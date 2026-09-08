import type { WeatherSnapshot } from "../weather-hazard";

/**
 * A narrow port over "fetch current weather for a coordinate" — kept
 * separate so only `infrastructure/*` knows about the concrete HTTP call
 * (matching `ConnectivityChecker`'s own doc comment on why this
 * separation exists). Implementations MAY throw on any failure (network
 * error, timeout, malformed response) — `WeatherApplicationService` is
 * responsible for catching that and degrading to `"unavailable"`; this
 * port itself makes no promise about never throwing.
 */
export interface WeatherClientPort {
  fetchSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot>;
}
