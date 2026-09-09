# ADR-0079: Weather Advisory Composition Wiring — School Coordinates, Capability, Placement

Status: Accepted

## Context

ADR-0077 built the full Weather & Hazard Suspension Alerts port/adapter/
service slice (`domain/weather-hazard.ts`, `application/weather-service.ts`,
`domain/ports/weather-client.ts`, `infrastructure/open-meteo-weather-client.ts`)
but explicitly left it unwired: no school-coordinate field existed, and
`weatherService` was never instantiated in `composition.ts`. Batch 8 item
5 closes that gap. Three composition-layer questions this ADR settles:
where the school's coordinates live, who may set them, and where the
resulting advisory appears in the UI.

## Decisions

### 1. Two new nullable columns on `schools`, not a new table

Migration 51 adds `latitude REAL` / `longitude REAL` directly to the
existing `schools` table, mirroring how `logo`/`logo_mime` were added in
an earlier migration rather than a separate `school_branding` table.
Both are nullable together (no partial-set state is ever produced by
the repository layer) and carry no `CHECK` range constraint — range
validation lives at the command/application boundary
(`commands::school::validate_coordinates` and
`SchoolCoordinatesApplicationService.setCoordinates`), matching this
codebase's established split (see `set_logo`'s MIME/size validation for
the same pattern). "Not configured" (both `NULL`) is a first-class,
common state, not an edge case — most schools will never set this.

### 2. A new `ManageSchoolCoordinates` capability, not reusing `ManageSchoolBranding`

Following this codebase's own repeated precedent
(`ManageTeachingAssignments`/`ManageSectionAdvisories`/
`ManageSchoolBranding` are each their own variant even though all
currently resolve to School Head), a school's physical location is a
distinct administrative fact from its visual identity. Reusing
`ManageSchoolBranding` would have been simpler short-term but would tie
two conceptually unrelated settings to the same authorization variant,
against this codebase's explicit stated reasoning for every prior
capability split. Read access (`get_school_coordinates`) has no
dedicated capability at all — same convention as `get_school_logo`: any
authenticated member of the school may read it back, since the whole
point is that any teacher's `WeatherAdvisoryBanner` can look it up.

**Not gated by the ADR-0070 structural-lock PIN.** That lock's three
named surfaces (school identity/branding, membership grant, and the
lock's own configuration) don't include this, and adding a fourth
surface to that gate is a scope decision this ADR is not making —
coordinates are operational data for an optional advisory, not identity
data in the sense ADR-0070 was scoped around.

### 3. Settings field lives on the existing School Logo screen, not a new screen

`SchoolBrandingScreen` gains a second, independently-optional section
("School location") below the existing logo section, rather than a new
`SignedInTab`/nav entry. Both are School-Head-gated administrative
school-identity/settings, and the existing screen already has the
loading/error/confirmation scaffolding this reuses. The
`schoolCoordinatesService` prop is optional specifically so the screen's
existing logo-only tests and any future caller that doesn't need this
half keep working unchanged — matching this codebase's established
"absent, not broken" convention rather than a required prop that would
force every test/caller to supply a coordinates service it doesn't
care about.

### 4. The advisory itself is one small component mounted once in `App.tsx`, not per-screen

`WeatherAdvisoryBanner` is mounted once, alongside `IdleTimeoutWarning`,
inside `AppLayout`'s children in `App.tsx` — visible above every signed-
in screen rather than duplicated into `HomeScreen`/`MyDayScreen`/etc.
This keeps the wiring to one integration point and matches
`IdleTimeoutWarning`'s own precedent of a small, screen-independent
affordance mounted at the shell level. It renders **nothing** — not a
loading spinner, not an error banner — for every one of: no coordinates
configured, the Open-Meteo fetch failing for any reason, or current
conditions not crossing either hazard threshold (`level === "normal"`).
It only ever becomes visible with a genuine advisory, and even then
explicitly states this is not a suspension decision (`weather-hazard.ts`'s
own established wording constraint, carried through to this component).

## Consequences

- A school that never sets coordinates sees literally nothing different
  from before this slice — no banner, no settings prompt, no error.
- `weatherService` in `composition.ts` is the only caller of
  `OpenMeteoWeatherClient` (matching that class's own doc comment); every
  network failure it can produce is caught inside
  `WeatherApplicationService` before ever reaching `WeatherAdvisoryBanner`.
- A School Head sets coordinates once, from the School Logo screen; every
  teacher at that school then sees the shared advisory automatically
  (session-scoped read, no per-teacher configuration).

## Deferred / explicitly out of scope

- A dedicated "School Settings" screen consolidating logo + coordinates +
  any future school-level setting. Not needed yet at two settings; a
  reasonable future refactor if a third administrative setting arrives.
- Any location picker/map UI — plain latitude/longitude number inputs
  only, matching this batch's scope.
- Extending the ADR-0070 structural lock to cover this setting (see
  Decision 2).
