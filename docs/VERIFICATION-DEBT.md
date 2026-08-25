# Verification Debt

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
