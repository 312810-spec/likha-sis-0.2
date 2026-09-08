import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoWeatherClient } from "./open-meteo-weather-client";

describe("OpenMeteoWeatherClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses a well-formed Open-Meteo response into a WeatherSnapshot", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { precipitation: 12.5, wind_speed_10m: 22.1, time: "2026-09-08T06:00" },
      }),
    }) as unknown as typeof fetch;

    const client = new OpenMeteoWeatherClient();
    const snapshot = await client.fetchSnapshot(14.6, 121.0);

    expect(snapshot).toEqual({
      precipitationMm: 12.5,
      windSpeedKph: 22.1,
      observedAt: "2026-09-08T06:00",
    });
  });

  it("throws on a non-2xx response, for the application service to catch", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const client = new OpenMeteoWeatherClient();
    await expect(client.fetchSnapshot(14.6, 121.0)).rejects.toThrow(/503/);
  });

  it("throws on a malformed response missing expected fields", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: {} }),
    }) as unknown as typeof fetch;
    const client = new OpenMeteoWeatherClient();
    await expect(client.fetchSnapshot(14.6, 121.0)).rejects.toThrow();
  });

  it("propagates a network-level rejection (e.g. offline) rather than swallowing it", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const client = new OpenMeteoWeatherClient();
    await expect(client.fetchSnapshot(14.6, 121.0)).rejects.toThrow("Failed to fetch");
  });
});
