# Verification Debt

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
