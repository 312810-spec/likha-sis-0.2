/**
 * Weather & Hazard Suspension Alerts — pure classification logic.
 *
 * This is deliberately a best-effort, non-blocking advisory, never an
 * authoritative class-suspension decision: only a school head / LGU can
 * actually suspend classes. See
 * `docs/adr/0077-weather-hazard-alerts-open-meteo-scope.md` for the full
 * scope decision (new external network dependency, Open-Meteo, no API
 * key, free tier) and why every failure path here degrades to
 * `"unavailable"` rather than surfacing an error to the teacher.
 *
 * Thresholds ($>30$mm rain, $>50$kph wind) come from
 * `docs/product/MASTER-TASK-INVENTORY.md` §3.4 and are the same
 * ballpark PAGASA uses informally for "heavy rain"/"strong wind"
 * advisories, but — like the award-eligibility threshold — have not
 * been checked against a specific current PAGASA/DepEd suspension
 * circular. Treat this as an advisory heuristic, not verified policy;
 * never word UI copy as "classes are suspended."
 */

export const RAIN_HAZARD_THRESHOLD_MM = 30;
export const WIND_HAZARD_THRESHOLD_KPH = 50;

export interface WeatherSnapshot {
  /** Millimeters of precipitation, typically over the last hour/day
   * depending on what the caller fetched. */
  precipitationMm: number;
  /** Kilometers per hour, wind speed (or gust, if that's what was
   * fetched — the caller's field choice, this module just compares
   * against the threshold). */
  windSpeedKph: number;
  observedAt: string;
}

/** @public — only consumed structurally, via `WeatherAdvisory.level`. */
export type WeatherAdvisoryLevel = "normal" | "advisory";

export interface WeatherAdvisory {
  level: WeatherAdvisoryLevel;
  reasons: string[];
  snapshot: WeatherSnapshot;
}

export function classifySuspensionRisk(snapshot: WeatherSnapshot): WeatherAdvisory {
  const reasons: string[] = [];
  if (snapshot.precipitationMm > RAIN_HAZARD_THRESHOLD_MM) {
    reasons.push(
      `Precipitation ${snapshot.precipitationMm}mm exceeds the ${RAIN_HAZARD_THRESHOLD_MM}mm advisory threshold.`,
    );
  }
  if (snapshot.windSpeedKph > WIND_HAZARD_THRESHOLD_KPH) {
    reasons.push(
      `Wind speed ${snapshot.windSpeedKph}kph exceeds the ${WIND_HAZARD_THRESHOLD_KPH}kph advisory threshold.`,
    );
  }

  return {
    level: reasons.length > 0 ? "advisory" : "normal",
    reasons,
    snapshot,
  };
}

/** A weather feature's result, as a UI screen actually receives it —
 * always one of these three shapes, never a thrown error. `"unavailable"`
 * covers offline, a network failure, an unparseable response, or a
 * request timeout indiscriminately: the whole point is that a teacher
 * workflow never blocks or errors out over this being best-effort. */
export type WeatherFeatureResult =
  { status: "ok"; advisory: WeatherAdvisory } | { status: "unavailable"; reason: string };

export function toUnavailableResult(reason: string): WeatherFeatureResult {
  return { status: "unavailable", reason };
}

export function toOkResult(snapshot: WeatherSnapshot): WeatherFeatureResult {
  return { status: "ok", advisory: classifySuspensionRisk(snapshot) };
}
