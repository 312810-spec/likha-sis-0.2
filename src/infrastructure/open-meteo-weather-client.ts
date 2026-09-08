import type { WeatherClientPort } from "../domain/ports/weather-client";
import type { WeatherSnapshot } from "../domain/weather-hazard";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Concrete adapter for Open-Meteo (open-meteo.com) — free, no API key,
 * used only for a best-effort weather advisory. See
 * `docs/adr/0077-weather-hazard-alerts-open-meteo-scope.md`: this is a
 * NEW external network dependency for an otherwise offline-first app,
 * accepted only because every caller (`WeatherApplicationService`) treats
 * any failure here as "unavailable," never a blocking error.
 *
 * Only `src/composition.ts` may import this class directly — UI/
 * application code depends on `WeatherClientPort` instead.
 */
export class OpenMeteoWeatherClient implements WeatherClientPort {
  async fetchSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot> {
    const url = new URL(OPEN_METEO_BASE_URL);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "precipitation,wind_speed_10m");
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("precipitation_unit", "mm");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Open-Meteo request failed with status ${response.status}.`);
      }
      const body = (await response.json()) as {
        current?: { precipitation?: number; wind_speed_10m?: number; time?: string };
      };
      if (
        typeof body.current?.precipitation !== "number" ||
        typeof body.current?.wind_speed_10m !== "number"
      ) {
        throw new Error("Open-Meteo response did not include the expected current-weather fields.");
      }
      return {
        precipitationMm: body.current.precipitation,
        windSpeedKph: body.current.wind_speed_10m,
        observedAt: body.current.time ?? new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
