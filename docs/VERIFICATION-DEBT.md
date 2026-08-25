# Verification Debt

## Teacher Load / Class Schedule Foundation: Rust unverified by compiler, `security-reviewer` retrieval failure, two self-caught bugs (2026-08-25)

`cargo check --lib` was attempted once against this milestone's new
code (migration 18, `repository::teaching_assignment`,
`repository::schedule_meeting`, `auth::Capability::ManageTeachingAssignments`/
`authorize_view_teacher_load`, `commands::teaching_assignment`) and
failed identically to every prior reproduction — `windows-future`
0.3.2 vs. `windows-core` 0.62.2, unchanged root cause. Per this
milestone's own instruction, not retried further. Notably, this failure
occurs while compiling a transitive dependency, **before this crate's
own source is type-checked at all** — meaning there is zero compiler
signal on this milestone's new Rust, not even partial. All of it is
written and manually reviewed, not compiler-verified.

`security-reviewer` was dispatched for an adversarial pass on the new
authorization (`authorize_view_teacher_load`) and data-integrity logic
(conflict detection, `INSERT OR IGNORE` review). It completed real work
(19 tool uses, ~80K tokens across two attempts) but returned no
retrievable findings text on the initial attempt or one retry — the
same recurring agent-resume/retrieval failure documented since M7, now
hit for the fourth time this session alone (Curriculum Foundation's
`architecture-reviewer`, RBAC's and this milestone's `security-reviewer`).
Per the established protocol, a rigorous self-review was substituted.

**Two real, non-theoretical bugs were caught and fixed during this
milestone's own TDD/self-review, before the (failed) independent review
was even dispatched**:

1. `authorize_view_teacher_load`'s first draft authorized a School Head
   to view any `target_teacher_user_id` based solely on holding the
   `ManageTeachingAssignments` role in their own school — never checking
   that the _target_ teacher actually belongs to that school. Caught by
   the test `authorize_view_teacher_load_denies_a_school_head_from_a_different_school`
   before it was ever committed. Fixed by adding
   `user_repo::is_member_of_school(conn, target_teacher_user_id, &school_id)?`
   to the check.
2. `schedule_meeting::create`'s first draft used `INSERT OR IGNORE` for
   its final insert with no Rust-side `weekday` range validation — the
   same class of bug as the RBAC milestone's `role::grant()` mistake,
   which this project's own `local-database` skill already documented
   as a lesson. An out-of-range `weekday` would have silently reported
   `CreateMeetingOutcome::Duplicate` instead of the real error, since
   `OR IGNORE` swallows any constraint violation on the statement, not
   just the intended `UNIQUE` conflict. Fixed: explicit `(0..=6)` range
   check in Rust, `INSERT ... ON CONFLICT (...) DO NOTHING` instead of
   `OR IGNORE`. A third, related gap found in the same self-review pass
   (a time missing its leading zero, e.g. "8:00", would pass numeric
   parsing but fail the schema's `GLOB` shape check, surfacing as a raw
   database error instead of a clean `InvalidTime` outcome) was also
   fixed, with a regression test for each.

Self-review beyond the two fixes above also traced: tenant isolation
(`school_id` is session-derived only throughout; `section_id`/
`subject_id`/`teacher_user_id` are validated against it before any
write); conflict-detection SQL correctness (the half-open-interval
overlap condition and lexicographic "HH:MM" string comparison were
verified correct by hand, including the adjacent-non-overlapping edge
case); absence of a TOCTOU window (every command holds one
`Mutex<Connection>` guard for its full duration, serializing all
DB-touching commands globally, the same guarantee every other command
in this codebase already relies on); derived-load correctness (no
stored total exists anywhere in the schema); and command-layer
architecture (every `commands::teaching_assignment` handler is a thin
lock+authorize+single-repository-call wrapper, no business logic in the
Tauri layer).

**No further blocking findings.** Real, non-self independent-review
debt remains open for this milestone — re-run `security-reviewer` once
agent-resume behavior is confirmed reliably working in a future
session.

## RBAC Authorization Corrective Gate: `security-reviewer` retrieval failure, self-review substituted (2026-08-25)

`security-reviewer` was dispatched for an adversarial pass on the
`add_user_to_school` fix (see the entry below). It completed real work
(7 tool uses, ~61K tokens) but returned no retrievable findings text —
the same recurring agent-resume/retrieval failure documented since M7,
hit twice already this session (Curriculum Foundation's
`architecture-reviewer`, Codex-plugin-cc research's `deped-researcher`).
One retry via `SendMessage` was sent per this project's established
protocol; per the same protocol, a rigorous self-review was performed
rather than waiting further.

Self-review traced exactly the 10 adversarial questions the dispatched
review was asked: (1) `add_user_to_school` never reads or writes the
caller's own roles, only the target `user_id`'s — no self-escalation
path. (2) `role::grant(&conn, &user_id, &school_id, role::TEACHER)`
passes the literal `TEACHER` constant, not a parameter — no path to
grant a different role via this command. (3) The cross-school
`current_school != school_id` check is unchanged, downstream of the new
capability check. (4) The whole command holds one `Mutex<Connection>`
guard for its full duration (`lock_db(&db)` at the top, held to the end
of the function) — no TOCTOU window, consistent with every other command
in this codebase. (5) `school_id` is checked against the trusted
session, never blindly accepted; `user_id`'s lack of restriction is
unchanged, pre-existing, intentional design (an FK-enforced existence
check only), not part of this defect. (6) Grepped every production
caller of `user::add_school_membership`/`role::grant` in
`src-tauri/src` — only `bootstrap_installation` (already correct) and
`add_user_to_school` (the fixed defect) — no bypass path exists
elsewhere. (7) The `Capability::ManageLearners` match arm is untouched;
only a new arm was added. (8) Re-read the new/updated test bodies:
`..._blocks_a_session_scoped_to_a_different_school` now grants the
caller School Head in their own school before attempting the
cross-school call, correctly isolating that check from the role check;
`..._denies_a_registrar_only_session` correctly isolates the role check
alone. (9) No other membership/role-mutating command exists in this
codebase at all (confirmed via a full grep of `src-tauri/src/commands/`).
(10) The legitimate School Head case is explicitly tested and asserted
`.is_ok()`.

**No blocking findings.** Real, non-self independent-review debt for
this specific fix remains open — re-run `security-reviewer` once
agent-resume behavior is confirmed reliably working in a future session.

## Curriculum / Key-Stage Versioning Foundation: `architecture-reviewer` retrieval failure, self-review substituted (2026-08-25)

`architecture-reviewer` was dispatched to review the new curriculum
schema/repository code for architecture leakage and data-integrity
correctness. It completed real work (33 tool uses, ~67K tokens) but
returned no retrievable findings text — the same recurring agent-resume/
retrieval failure documented since M7 (also hit this session by
`deped-researcher`, see below). One retry via `SendMessage` was sent per
this project's established protocol; per the same protocol, a rigorous
self-review was performed rather than waiting further or retrying again.

Self-review covered exactly what the dispatched review was asked to
check: (1) confirmed via `git diff --stat` that zero files under `src/`
(TS/UI) were touched this milestone — no curriculum/key-stage hardcoding
is possible in the frontend because there is no frontend code touching
this concept at all yet. (2) Re-read `resolved_curriculum_version_id_in_school`
directly: a single generic `COALESCE(cr.curriculum_version_id, dcv.id)`
lookup with no branching on curriculum name/id anywhere — the same shape
`resolved_weight_policy_id_in_school` already uses. (3) Confirmed
`key_stages` has no foreign key to `curriculum_versions` at all (deliberate,
per the ADR's reasoning that Key Stage banding is curriculum-independent).
(4) Re-read the migration SQL literally: `CHECK (min_grade_level <=
max_grade_level)` on `key_stages`, `curriculum_learning_areas.curriculum_version_id`
is `NOT NULL REFERENCES curriculum_versions(id)`, `idx_one_default_curriculum_version`
is a `UNIQUE INDEX ... WHERE is_default = 1` (the same structural pattern
already proven for `grading_policies`/`grading_weight_policies`, not a
new mechanism). (5) Traced historical-stability directly: `create()`
always resolves `curriculum_version_id` to a concrete, non-null value
before insert (explicit-and-validated, or auto-resolved-then-stored) —
so `COALESCE` never falls through to `dcv.id` (today's default) for any
row created via `create()`, only for a genuinely pre-existing/legacy row
with a literal `NULL` column value; confirmed no code path can rewrite an
already-stored `curriculum_version_id` after creation. (6) Grepped for
`OR IGNORE` in the new migration/repository code — zero occurrences (the
RBAC-milestone lesson was not repeated). (7) Confirmed `curriculum_versions`/
`key_stages`/`curriculum_learning_areas` carry no `school_id` column at
all (global reference data, matching `grading_weight_policies`), and that
`class_record::create`'s new parameter follows the exact same "not
tenant data, existence-check only" pattern already established for
`weight_policy_id` — no cross-school leak path exists.

**No blocking findings.** Real, non-self independent-review debt for this
milestone remains open — re-run `architecture-reviewer` once agent-resume
behavior is confirmed reliably working in a future session.

## Curriculum / Key-Stage Versioning Foundation: Rust unverified by compiler, `deped-researcher` failure (2026-08-25)

`cargo check --lib` was re-run against this milestone's new migration/
repository code and failed identically to every prior session's
reproduction (`windows-future` 0.3.2 vs. `windows-core` 0.62.2 — see the
entry below, unchanged root cause). This milestone's new Rust
(`key_stages`/`curriculum_versions`/`curriculum_learning_areas` migration
and tests, `repository/curriculum.rs`, `class_record.rs`'s
`curriculum_version_id` plumbing) is therefore **written and manually
reviewed, not compiler-verified or test-run**. `npm run quality`
(390/390), `check:architecture`, `check:dev-preview-isolation`, and
`knip` were all actually re-run and are clean — this milestone's changes
are Rust-only, so TS-side verification is a real, if partial, signal.

`deped-researcher` was dispatched to verify MATATAG curriculum
rollout/Key-Stage facts and returned no retrievable findings on the
initial attempt; one retry via `SendMessage` (this project's established
protocol) also returned "No new content" — the same recurring
agent-resume/retrieval failure documented since M7, now confirmed on
this agent type too. Direct `WebSearch`/`WebFetch` was substituted
instead of a third attempt, and produced usable, triangulated (though not
fully primary-source-verified — `deped.gov.ph` itself is blocked by this
environment's network egress policy) findings — see
`docs/SOURCE-REGISTRY.md`'s new entry for exactly what was and wasn't
confirmed. Periodically retry `deped-researcher` in a future session once
the harness appears healthy, per the project's standing reviewer-failure
rule.

## Wave 1A RBAC Foundation: `security-reviewer` findings — one fixed, one pre-existing gap recorded (2026-08-25)

Independent `security-reviewer` review of the new RBAC gate was dispatched
and returned real, substantive findings before hitting a session-limit API
error partway through a follow-up exchange (not the usual agent-resume
retrieval failure documented elsewhere in this file — the review itself
completed and reported). Two findings:

1. **Fixed.** `repository::role::grant()` used `INSERT OR IGNORE`, which
   silently swallows a `CHECK` constraint violation (not just the intended
   primary-key conflict) — an unrecognized role would have been a silent
   no-op instead of the error the function's own doc comment and the
   `grant_rejects_an_unrecognized_role` test require. Independently
   reproduced against real SQLite before trusting the reviewer's claim
   (`INSERT OR IGNORE` on a `CHECK`-violating row: 0 rows affected, no
   exception; `INSERT ... ON CONFLICT(...) DO NOTHING` on the same row:
   raises `CHECK constraint failed` as expected — conflict resolution only
   suppresses the named conflict target, not an unrelated `CHECK` failure).
   Fixed by switching to `ON CONFLICT (user_id, school_id, role) DO
NOTHING`. Not yet re-verified by an actual `cargo test` run — `cargo`
   still cannot compile in this environment (see the `windows-future`
   entry below) — verified instead by reproducing the exact SQLite
   semantics in isolation, and the fix is a one-line, easily-inspectable
   change.
2. **Fixed (2026-08-25, RBAC authorization corrective gate)** —
   originally: `commands::user::add_user_to_school`
   only checked that the caller has an active session scoped to the same
   `school_id` being granted into (`auth::authorize_school_membership_grant`)
   — it did not check the caller's _role_ at all, so any
   authenticated member of a school (Teacher included) could add a new
   colleague. **Confirmed exploitable end-to-end**, not merely
   theoretical: any authenticated session could call `register_user`
   (itself only requires an active session, any role — returns the new
   account's `user_id`) then `add_user_to_school` (same school, any
   role) to self-grant that fresh account membership. Grepped every
   production caller of `user::add_school_membership`/`role::grant`
   (`src-tauri/src/auth/mod.rs`'s `bootstrap_installation` and
   `src-tauri/src/commands/user.rs`'s `add_user_to_school` — the only
   two; `bootstrap_installation` was already correctly gated, reviewed
   under ADR-0036) — no other vulnerable path existed. Fixed by adding
   `Capability::ManageSchoolMembership` (School Head only, deliberately
   excluding Registrar as the conservative choice — onboarding a new
   school member is treated as a School Head personnel responsibility,
   not bundled into Registrar's enrollment/records scope) and routing
   `authorize_school_membership_grant` through the existing
   `authorize_capability` gate, the same pattern every other
   capability-checked command already uses. Six regression tests added/
   updated in `src-tauri/src/auth/mod.rs` proving: School Head succeeds;
   Teacher-only denied (the exact defect); no-role-at-all denied;
   Registrar-only denied; cross-school denied (fixture corrected to
   grant the caller School Head first, isolating the cross-school check
   from the role check); role revoked mid-session denied on the very
   next call. Not yet re-verified by `cargo test` — blocked by the
   unrelated pre-existing `windows-future` conflict below; independent
   `security-reviewer` dispatched for an adversarial pass. Still not
   reachable from any UI (unchanged).

## UX-04 teacher-ux-reviewer / accessibility-reviewer independent review not retrievable (open)

Both `teacher-ux-reviewer` and `accessibility-reviewer` were dispatched
against UX-04's `ClassRecordWorkspace.tsx`/`ClassRecordsScreen.tsx`
changes (2026-08-25) and hit the same recurring agent-resume/retrieval
failure documented since M7 (see `docs/adr/0027-audit-timestamp-readability-fix.md`,
and the identical UX-02/UX-03 entries below): each did real work
(teacher-ux: 31 tool calls across two attempts; accessibility: 31 tool
calls across two attempts) but returned no retrievable findings text,
on both the initial dispatch and one permitted retry. A rigorous
self-review was substituted and found and fixed one real, must-fix
accessibility gap: every assessment item's "Edit"/"Delete" buttons
shared the same accessible name across the whole list, with nothing
distinguishing which item a given pair belonged to for a screen-reader
user (fixed with a named `role="group"`, matching the pattern this
file's own Excused/N/A buttons already used correctly) — recorded in
`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`.
This did not block completing UX-04, but the owed independent reviews
themselves are still open debt. Retry both in a future session once
there's reason to believe the agent-resume harness issue is fixed;
remove this entry once real (non-self) reviews actually complete and
their findings are recorded.

## Rust toolchain cannot compile in this environment: `windows-future`/`windows-core` version conflict (open)

`cargo check --lib` (and therefore `cargo test`/`cargo build`/`cargo
clippy`) fails in this session's Linux dev environment on a pre-existing,
unrelated dependency conflict: `Cargo.lock` locks both `windows-core`
0.61.2 and 0.62.2, and both `windows-future` 0.2.1 and 0.3.2,
simultaneously. Building `windows-future` 0.3.2 then fails with several
`cannot find function/type ... in module windows_core::imp` errors (a
transitive Windows-target crate expecting symbols only the other locked
version provides). Confirmed via `cargo update -p windows-future`, which
refuses ("specification is ambiguous") without a version qualifier this
session deliberately did not supply, since forcing a Cargo.lock/Cargo.toml
change is outside any single UI milestone's scope and risks
side effects on an unrelated dependency tree. Not caused by, and not
fixable from, any `.rs` source file changed in UX-04 (only source files
were touched, never the manifest/lockfile). All UX-04 Rust changes
(`assessment_item.rs`'s `rename`/`update`/`delete`, `class_record.rs`'s
`item_count`/`recorded_count`/`total_eligible`) were verified instead by
careful manual review — signatures, SQL correctness, fail-closed-on-
`None` conventions, and the logic of each new test — not by an actual
compile/test run. Resolve by pinning a single consistent
`windows-future`/`windows-core` pair (a deliberate dependency decision,
not a drive-by fix) in a session where that's the explicit task, then
re-run `cargo test`/`cargo clippy --all-targets -- -D warnings` for every
milestone whose Rust changes accumulated while this was broken.

**Root cause actually reproduced and diagnosed, Wave 1A RBAC Foundation
(2026-08-25)** — this milestone's own task explicitly required reproducing
this blocker rather than continuing to cite it secondhand. `cargo check
--lib` and `cargo test --lib` were both actually run and both fail at the
identical point: `windows-future` 0.3.2 cannot compile — it references
`windows_core::imp::IMarshal`, `windows_core::imp::marshaler`, and
`windows_threading::submit`, none of which exist in the `windows-core`
0.62.2 / `windows-threading` 0.2.1 versions the lockfile actually pairs it
with. `git log -p -- Cargo.lock` confirms this dual-version lock existed
since the very first Cargo.lock commit (`e237e00`, M0) — nothing this
project has done introduced it. The deeper structural cause: `Cargo.toml`
declares `windows = { version = "0.62.2", ... }` **unconditionally** (no
`[target.'cfg(windows)'.dependencies]` section exists in this manifest at
all), and `src-tauri/src/crypto/dpapi.rs` (`mod dpapi;` in `crypto/mod.rs`,
used unconditionally by `db::mod.rs`'s `DpapiKeyStore`) is not gated behind
`#[cfg(windows)]` either — so this crate is structured to require a
functioning Windows API binding on every platform it's built on, including
this Linux dev container, regardless of whether the specific
windows-future/windows-core version pair matches. Even a corrected,
mutually-compatible `windows`/`windows-future`/`windows-core` version set
would still only fix the _compile_ error — DPAPI's actual Win32 calls
(`CryptProtectData`/`CryptUnprotectData`) have no Linux implementation to
link against, so a real fix likely also needs `#[cfg(windows)]` gating on
`dpapi.rs` and a target-specific `windows` dependency, which is a genuine
architecture change (how the crate is structured per-platform, and what a
non-Windows dev/CI build does for `KeyStore` — a stub, a different
`KeyStore` impl, or simply "this crate cannot build outside Windows,
accept that and provision only Windows CI/dev machines"). Per this
milestone's explicit instruction, this is **not** decided or implemented
here — recorded as the reproduced blocker, its exact chain, and evidence;
the corrective action (a real architecture decision, not a drive-by fix)
is deferred to a session where that's the explicit task.

## `playwright-cli` browser mismatch in this environment — workaround exists (open, session-specific)

`playwright-cli open` (any browser argument) failed in this session with
either "Chromium distribution 'chrome' is not found" or "Browser
'chrome-for-testing' is not installed... expected executable at
/opt/pw-browsers/chromium-1237/..." — the pinned `@playwright/cli`
version's expected browser build does not match what's actually
pre-installed at `/opt/pw-browsers` (chromium-1194) in this environment.
Workaround used successfully this session: bypass `playwright-cli`
entirely and drive the `playwright` npm package directly from a small
script, launching with `chromium.launch({ executablePath:
"/opt/pw-browsers/chromium" })` — this produced real, correct browser
screenshots (see `docs/adr/0034-class-records-assessments-score-entry-grade-output.md`'s
Verification section) and caught two genuine layout bugs jsdom-based
tests could not. Future sessions hitting the same `playwright-cli`
failure should use this workaround rather than concluding no
browser-rendered verification is possible.

## UX-03 teacher-ux-reviewer / accessibility-reviewer independent review not retrievable (open)

Both `teacher-ux-reviewer` and `accessibility-reviewer` were dispatched
against UX-03's `AttendanceScreen`/`MonthlySummaryScreen` changes
(2026-08-25) and hit the same recurring agent-resume/retrieval failure
documented since M7 (see `docs/adr/0027-audit-timestamp-readability-fix.md`,
UX-02's identical entry below): each did real work (teacher-ux: 31 tool
calls across two attempts; accessibility: 21 tool calls across two
attempts) but returned no retrievable findings text, on both the
initial dispatch and one permitted retry. A rigorous self-review was
substituted (recorded in `docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`'s
"Independent review" section) and found and fixed one real teacher-UX
gap (the "Mark all present preserves existing marks" reassurance was
Guided-mode-only; now shown in every mode) — so this did not block
completing UX-03, but the owed independent reviews themselves are still
open debt. Retry both in a future session once there's reason to
believe the agent-resume harness issue is fixed; remove this entry once
real (non-self) reviews actually complete and their findings are
recorded.

Things that are believed correct but not yet verified by the specific
means listed — because this environment/session lacked the tool, device,
or hardware. This is **not** a bug backlog; move an item here only when
the underlying work is otherwise done and reviewed, and remove it once
the missing verification actually happens (record what ran and when).

## UX-02 accessibility-reviewer independent review not retrievable (open)

`accessibility-reviewer` was dispatched against UX-02's rewritten
`TeacherWorkspaceScreen.tsx` (2026-08-25) and hit the same recurring
agent-resume/retrieval failure first documented in
`docs/adr/0027-audit-timestamp-readability-fix.md`: both the initial
dispatch and one permitted retry (asking it directly to resend its
findings) returned only an empty completion notice, never any actual
findings content. A rigorous self-review was substituted (recorded in
`docs/adr/0032-teacher-workspace-polish.md`'s "Independent review"
section) and found no blocking issue, so this did not block completing
UX-02, but the owed independent accessibility review itself is still
open debt. Retry in a future session once there's reason to believe the
harness issue is fixed; remove this entry once a real review actually
completes and its findings are recorded.

## Native visual / screen-reader inspection (open)

No browser/screenshot/rendering tool was available in the sessions that
built M0–M6. Structural/accessibility correctness was verified via React
Testing Library + `axe-core` (see `src/test/a11y.ts`) and computed WCAG
contrast ratios from actual hex values — not by looking at the rendered
UI. A human visual pass (does it look premium/comfortable, not just
structurally valid?) and a real screen-reader pass (NVDA/Narrator) on the
compiled app are still owed for every screen shipped so far
(`LoginScreen`, `LearnerListScreen`, `FirstRunSetupScreen`, `AppShell`).

## Browser-pane dev-server port was misconfigured — fixed 2026-08-25 (closed)

`.claude/launch.json` declared the dev server's port as `5173`, but
Vite/Tauri's actual `devUrl` is `1420`. This silently broke every
Browser-pane `navigate` attempt against the running dev server across
at least two sessions (the "navigation ... was denied or failed" note
recorded in earlier handoffs was this misconfigured port, not a tool
limitation). Fixed in `docs/adr/0030-ui-first-program-and-ux00.md`.
With the fix, Browser-pane DOM/text/console verification against
`vite dev` genuinely works, and — once the user displays the Browser
pane panel client-side — pixel-level screenshot capture works too
(confirmed in `docs/adr/0031-design-system-and-app-shell.md`: `LoginScreen`
screenshotted at three viewports, two color schemes, three teacher
modes).

## Authenticated (post-login) screens are pixel-verified via a dev-only fixture — closed 2026-08-25 (closed)

The browser-only `vite dev` server has no live Tauri IPC bridge, so
nothing past `LoginScreen` could be reached through a real login. UX-01
(`docs/adr/0031-design-system-and-app-shell.md`) ran a 10-scenario
decision on how to close this and selected a dev-only synthetic
fixture, deferring its construction to whichever milestone first
genuinely needed it. UX-02
(`docs/adr/0032-teacher-workspace-polish.md`) built it as its first
implementation slice: `src/dev-preview/` — a fully separate Vite entry
never registered in the production build input, a production
throw-guard in its `main.tsx`, and fixture repositories whose
auth-related methods throw unconditionally, with two independent
automated isolation proofs (a fast source-text test plus a built-`dist`
scan). `TeacherWorkspaceScreen` and `AttendanceScreen` were genuinely
screenshotted and interacted with through it at three viewports, two
color schemes, and all three teacher modes this session — the first
real pixel evidence of an authenticated LIKHA-SIS screen in this
program. This closes the gap for the screens the fixture wires
(Workspace, Attendance, Sign-in Activity); each remaining UX milestone
(UX-03 through UX-06) should extend the same fixture to wire its own
screens rather than rebuilding the safety architecture, and should
still consider the native `@wdio/tauri-service` pilot below for the
Tauri-IPC-specific behavior no browser-only fixture can prove.

## Playwright CLI coverage is browser-only, not native-binary (open)

`@playwright/cli` (adopted per `docs/SOURCE-REGISTRY.md`) can only drive
`vite dev`/browser-rendered UI. It cannot attach to the compiled Tauri
webview, so it never exercises the actual native binary, the Tauri IPC
bridge, or Windows-specific WebView2 behavior. Do not treat a green
Playwright run as native-binary verification.

## Native Tauri WebDriver E2E (planned, not yet built out)

`@wdio/tauri-service` was identified as the current official path for
real native-binary E2E on Windows (embedded WebView2 provider, no paid
CrabNebula dependency required on Windows). Only a single pilot smoke
test (launch app → confirm bootstrap/login screen renders → close
cleanly) was scoped for the harness upgrade, not a full E2E suite. Expand
coverage only as UI stabilizes — building it out while screens are still
moving quickly would create ongoing maintenance drag disproportionate to
the milestone stage.

## Android verification (deferred, out of current scope)

LIKHA-SIS targets Windows first, Android later. Nothing Android-specific
has been built or verified. This is expected at the current milestone,
not a gap to close yet — revisit when Android work actually starts.

## Recovery scenarios needing real hardware (open)

The DPAPI-protected key store (`docs/adr/0003-encryption-at-rest.md`) has
unit-test coverage for wrong-key/no-key rejection, but recovery behavior
across a real Windows user-profile change, a different physical machine,
or DPAPI key rotation has not been exercised on real hardware/accounts —
only within a single test process on one machine.
