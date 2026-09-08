import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { WeatherClientPort } from "../domain/ports/weather-client";
import type { WeatherSnapshot } from "../domain/weather-hazard";
import { WeatherApplicationService } from "./weather-service";

class FakeWeatherClient implements WeatherClientPort {
  constructor(
    private readonly behavior:
      { mode: "resolve"; snapshot: WeatherSnapshot } | { mode: "reject"; error: Error },
  ) {}

  async fetchSnapshot(): Promise<WeatherSnapshot> {
    if (this.behavior.mode === "reject") throw this.behavior.error;
    return this.behavior.snapshot;
  }
}

describe("WeatherApplicationService.getSuspensionAdvisory", () => {
  it("returns an ok advisory when the client resolves", async () => {
    const service = new WeatherApplicationService(
      new FakeWeatherClient({
        mode: "resolve",
        snapshot: { precipitationMm: 5, windSpeedKph: 10, observedAt: "2026-09-08T00:00:00Z" },
      }),
    );

    const result = await service.getSuspensionAdvisory(14.6, 121.0);
    expect(result.status).toBe("ok");
  });

  it("degrades to unavailable — never throws — on a network failure", async () => {
    const service = new WeatherApplicationService(
      new FakeWeatherClient({ mode: "reject", error: new Error("fetch failed") }),
    );

    const result = await service.getSuspensionAdvisory(14.6, 121.0);
    expect(result).toEqual({ status: "unavailable", reason: "fetch failed" });
  });

  it("degrades to unavailable on a timeout-shaped abort error too", async () => {
    const service = new WeatherApplicationService(
      new FakeWeatherClient({ mode: "reject", error: new DOMException("aborted", "AbortError") }),
    );

    const result = await service.getSuspensionAdvisory(14.6, 121.0);
    expect(result.status).toBe("unavailable");
  });

  it("rejects an out-of-range coordinate as a genuine validation error, not a network failure", async () => {
    const service = new WeatherApplicationService(
      new FakeWeatherClient({
        mode: "resolve",
        snapshot: { precipitationMm: 0, windSpeedKph: 0, observedAt: "2026-09-08T00:00:00Z" },
      }),
    );

    await expect(service.getSuspensionAdvisory(999, 121.0)).rejects.toBeInstanceOf(ValidationError);
  });
});
