# ADR-0076: Weather & Hazard Suspension Alerts — Open-Meteo, Strictly Optional/Best-Effort

Status: Accepted

## Context

`docs/product/MASTER-TASK-INVENTORY.md` §3.4 asks for a "Weather &
Hazard Suspension Alerts" feature: a hyper-local Open-Meteo integration
via school coordinates that flags a possible severe-weather advisory
(>30mm rain, >50kph wind).

This is a genuinely new kind of thing for LIKHA-SIS: every other feature
in this codebase is either fully local (SQLite) or talks to LIKHA's own
sync backend behind the `SyncProvider` interface (see
`docs/adr/0002-local-database-foundation.md`,
`.claude/rules/architecture.md`'s layering). This is the first feature
that calls an unrelated third-party public API directly from the
device — in an app whose top engineering priority (per `CLAUDE.md`) is
"security/privacy → correctness → ... → offline reliability". A network
call is, by construction, something offline reliability does not control.

## Decision

Build it, but scope it as **strictly optional and best-effort**, never a
blocking or authoritative part of any core teacher workflow:

1. **Provider: Open-Meteo** (`api.open-meteo.com`). Free, no API key, no
   account, no billing — satisfies the "no paid infrastructure without
   approval" rule with room to spare. Its terms permit non-commercial and
   commercial use without a key for the free tier at reasonable volume.
   This is the ONE exception this batch makes to LIKHA's normal
   "everything talks to our own backend or is local" shape, and it is
   made only because of the fail-safe design below — flagged here exactly
   as `CLAUDE.md`'s harness-change bar and this batch's own instructions
   require, even though it costs nothing.
2. **Every failure degrades silently to `"unavailable"`.** Offline, DNS
   failure, timeout, a non-2xx response, a malformed/changed response
   shape — all of it. `WeatherApplicationService.getSuspensionAdvisory`
   (`src/application/weather-service.ts`) catches every rejection from
   the `WeatherClientPort` and returns
   `{ status: "unavailable", reason }`, never throwing for a
   network-shaped reason. The only thing that can make this service throw
   is a genuinely invalid coordinate (a caller bug, not a runtime
   condition). A UI built on this must render "weather data unavailable"
   and otherwise get out of the way — it must never block, delay, or
   error out attendance-taking, grading, or any other core workflow.
3. **Advisory only, not a suspension decision.** `classifySuspensionRisk`
   (`src/domain/weather-hazard.ts`) only says whether current
   precipitation/wind exceed the thresholds named in the inventory
   (>30mm rain, >50kph wind) — those thresholds are a ballpark heuristic
   from the inventory doc, not verified against a specific current
   PAGASA/DepEd suspension circular, and the module's own doc comment
   says so. The result is worded as an advisory in code and must be
   worded as an advisory in any UI copy — never "classes are suspended,"
   which only a school head/LGU can actually declare.
4. **Architecture**: a narrow `WeatherClientPort`
   (`src/domain/ports/weather-client.ts`) is the only thing
   domain/application code depends on; `OpenMeteoWeatherClient`
   (`src/infrastructure/open-meteo-weather-client.ts`) is the only file
   that knows about the concrete HTTP call, following the exact same
   port/adapter separation as `ConnectivityChecker`. Only
   `src/composition.ts` may construct it directly, same as every other
   infrastructure adapter in this codebase.
5. **No new coordinate storage this batch.** `School` has no
   latitude/longitude field today. Rather than add a new migration column
   purely to support an optional advisory widget, this batch keeps
   coordinate entry out of scope for persistence — a screen consuming
   this service would need to accept coordinates as session input (e.g. a
   form field) until a real "school location" field is designed
   deliberately (its own small scope decision, not smuggled into this
   ADR).

## Deferred (recorded next-slice work)

- A UI screen/widget that actually calls `WeatherApplicationService` and
  renders the advisory. This batch ships the port, the adapter, the
  domain classification, and the application service, all tested — no
  screen wiring yet, matching Batch 4's own precedent of shipping a
  tested domain module before its UI glue (see ADR-0075 §1's
  `palette.ts`).
- A deliberate "school location" concept (lat/lng persisted per school)
  if a UI screen for this is built later — out of scope for this ADR.

## Consequences

- LIKHA is no longer purely "local SQLite or our own sync backend" for
  every feature — this is the first, narrow exception, justified by
  zero cost and a fail-safe design that cannot break offline reliability.
- If Open-Meteo changes its free-tier terms or response shape,
  `OpenMeteoWeatherClient` is the only file that needs to change; the
  domain/application layers are unaffected as long as the port contract
  holds.

## Verification

- `src/domain/weather-hazard.test.ts` — threshold classification,
  including an exactly-at-threshold boundary case.
- `src/application/weather-service.test.ts` — proves a network failure,
  a timeout-shaped `AbortError`, and any other client rejection all
  degrade to `{ status: "unavailable" }` without throwing; proves an
  out-of-range coordinate is rejected as a `ValidationError` instead
  (the one case that IS allowed to throw).
- `src/infrastructure/open-meteo-weather-client.test.ts` — response
  parsing, non-2xx handling, malformed-response handling, and a raw
  network rejection, all against a mocked `fetch`.
