import { describe, expect, it } from "vitest";
import {
  RAIN_HAZARD_THRESHOLD_MM,
  WIND_HAZARD_THRESHOLD_KPH,
  classifySuspensionRisk,
  toOkResult,
  toUnavailableResult,
} from "./weather-hazard";

describe("classifySuspensionRisk", () => {
  it("is normal when both readings are within threshold", () => {
    const advisory = classifySuspensionRisk({
      precipitationMm: 5,
      windSpeedKph: 20,
      observedAt: "2026-09-08T06:00:00Z",
    });
    expect(advisory.level).toBe("normal");
    expect(advisory.reasons).toEqual([]);
  });

  it("flags an advisory when rain exceeds the threshold", () => {
    const advisory = classifySuspensionRisk({
      precipitationMm: RAIN_HAZARD_THRESHOLD_MM + 1,
      windSpeedKph: 10,
      observedAt: "2026-09-08T06:00:00Z",
    });
    expect(advisory.level).toBe("advisory");
    expect(advisory.reasons).toHaveLength(1);
  });

  it("flags an advisory when wind exceeds the threshold", () => {
    const advisory = classifySuspensionRisk({
      precipitationMm: 0,
      windSpeedKph: WIND_HAZARD_THRESHOLD_KPH + 1,
      observedAt: "2026-09-08T06:00:00Z",
    });
    expect(advisory.level).toBe("advisory");
    expect(advisory.reasons).toHaveLength(1);
  });

  it("reports both reasons when both exceed threshold", () => {
    const advisory = classifySuspensionRisk({
      precipitationMm: 40,
      windSpeedKph: 60,
      observedAt: "2026-09-08T06:00:00Z",
    });
    expect(advisory.reasons).toHaveLength(2);
  });

  it("is exactly-at-threshold normal (strictly greater-than, not >=)", () => {
    const advisory = classifySuspensionRisk({
      precipitationMm: RAIN_HAZARD_THRESHOLD_MM,
      windSpeedKph: WIND_HAZARD_THRESHOLD_KPH,
      observedAt: "2026-09-08T06:00:00Z",
    });
    expect(advisory.level).toBe("normal");
  });
});

describe("feature-result degradation", () => {
  it("wraps a snapshot into an ok result", () => {
    const result = toOkResult({
      precipitationMm: 0,
      windSpeedKph: 0,
      observedAt: "2026-09-08T06:00:00Z",
    });
    expect(result.status).toBe("ok");
  });

  it("degrades to unavailable with a reason, never throwing", () => {
    const result = toUnavailableResult("network request failed");
    expect(result).toEqual({ status: "unavailable", reason: "network request failed" });
  });
});
