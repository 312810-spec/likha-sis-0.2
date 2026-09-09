import type { WeatherClientPort } from "../domain/ports/weather-client";
import { ValidationError } from "../domain/errors";
import {
  toOkResult,
  toUnavailableResult,
  type WeatherFeatureResult,
} from "../domain/weather-hazard";

/**
 * Weather & Hazard Suspension Alerts application service. Every failure
 * mode of the underlying network call — offline, DNS failure, timeout,
 * a non-2xx response, malformed JSON — is caught here and turned into a
 * `{ status: "unavailable" }` result. This service NEVER throws for a
 * network-shaped reason: the only thing it validates (and can reject
 * with a `ValidationError`) is the caller-supplied coordinate itself,
 * which is a genuine programming-error class of bug, not a runtime
 * condition a teacher's workflow should ever be blocked by.
 *
 * See `docs/adr/0077-weather-hazard-alerts-open-meteo-scope.md` for why
 * this is scoped as strictly optional/best-effort.
 */
export class WeatherApplicationService {
  constructor(private readonly client: WeatherClientPort) {}

  async getSuspensionAdvisory(latitude: number, longitude: number): Promise<WeatherFeatureResult> {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new ValidationError("A valid latitude/longitude is required.");
    }

    try {
      const snapshot = await this.client.fetchSnapshot(latitude, longitude);
      return toOkResult(snapshot);
    } catch (error) {
      return toUnavailableResult(
        error instanceof Error ? error.message : "Weather data unavailable.",
      );
    }
  }
}
