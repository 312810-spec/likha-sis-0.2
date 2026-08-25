# ACTIVE PLAN

## UI-First Tranche (added 2026-08-25) — current work, read this section first

**Drift repair note**: this file previously listed only M0 onward in
chronological order and had not kept pace with `docs/PROGRESS-MAP.md`,
`docs/CURRENT-HANDOFF.md`, or ADR-0021 through ADR-0029 (all of which
cover real, completed work this file never recorded: Authentication
Audit Log, Global Session Expiry Handling, Learner Search, Teacher
Workspace, Learner Roster CSV Export, Idle-Timeout Warning, the
audit-timestamp/ARIA self-review fixes, the Workspace grading-period
status, and the proptest lockout pilot). Per the directing prompt for
this UI-first program ("Known planning drift... Repair this at the
first UI milestone; do not propagate the inconsistency"), this section
is the repair: `docs/PROGRESS-MAP.md` and `docs/adr/*` are the
authoritative record for that already-completed work going forward,
not this file's stale M-number listing below (left intact as historical
record — see "Historical M0-M20 detail" further down, unchanged).

Full direction and Impeccable/visual-verification decisions:
`docs/adr/0030-ui-first-program-and-ux00.md`.

### UX-00 — Progress Map Repair + Impeccable Pilot + Visual Baseline

Teacher outcome: none directly yet — this establishes the reliable
design/verification foundation the rest of the UI program depends on.

Baseline SHA (verified via `git log`/`git fetch`, matched the user's
own supplied checkpoint exactly): `5b6e4d1`.

Checklist:

- [x] Verify git state (fetch, compare local/origin, confirm clean
      fast-forward-able tree) before any action.
- [x] Read `CLAUDE.md`, `docs/PROJECT-MEMORY.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/PROGRESS-MAP.md`,
      `docs/SOURCE-REGISTRY.md`, `docs/VERIFICATION-DEBT.md`, the
      autonomous-development/architecture/security-privacy/testing
      rules, and the `premium-teacher-ui`/`accessibility` skills.
- [x] Verify the `impeccable` npm package is real before installing
      (registry check: maintainer, repo, license — matches
      `pbakaus/impeccable`).
- [x] Install Impeccable project-local; catch and correct the
      installer's unrequested hook write (see ADR-0030).
- [x] Investigate the visual-verification path: found and fixed a real
      bug (`.claude/launch.json` port `5173` → actual `1420`); confirmed
      Browser-pane DOM/text/console verification now genuinely works;
      confirmed pixel screenshot capture is blocked by a client-side
      pane-display state, disclosed rather than worked around; formally
      selected the three-layer strategy in ADR-0030.
- [x] Repair `docs/PROGRESS-MAP.md`: add the UI-First Tranche table,
      mark UX-00 in progress, UX-01–UX-08 queued.
- [x] Repair `docs/ACTIVE-PLAN.md` (this section).
- [x] Put the active task at the top of `docs/CURRENT-HANDOFF.md`.
- [x] Create `PRODUCT.md` — via `/impeccable init`'s own playbook,
      synthesized from the directing prompt's exhaustive brief plus
      `CLAUDE.md`/`PROJECT-MEMORY.md` rather than a redundant interview
      round (substitution disclosed in the file itself and in the
      milestone report). Platform recorded as `adaptive` (Windows now,
      Android a named future target, one product whose design language
      genuinely adapts per OS).
- [x] Create `DESIGN.md` — selected "Calm Civic Classroom" (the
      directing prompt's own recommended thesis) with rationale against
      LIKHA's priority order; documents the incumbent token system
      (`src/ui/theme/styles.css`) as the evolution baseline (refinement,
      not a from-scratch replacement) and names the concrete token/
      typography/motion/accessibility targets UX-01 implements.
- [x] Inventory every current screen: 13 screens/components in
      `src/ui/*.tsx` (`AppShell`, `AttendanceScreen`, `AuditLogScreen`,
      `ClassRecordWorkspace`, `ClassRecordsScreen`, `FirstRunSetupScreen`,
      `GradingPeriodsScreen`, `IdleTimeoutWarning`, `LearnerListScreen`,
      `LoginScreen`, `MonthlySummaryScreen`, `SectionsScreen`,
      `TeacherWorkspaceScreen`). Shared CSS lives entirely in
      `src/ui/theme/styles.css` (442 lines, no per-screen stylesheets).
      Full token/component/pattern inventory recorded in `DESIGN.md`'s
      "Composition and Components" section.
- [x] Capture a visual baseline to the extent this session's
      verification path allows: found and fixed a real bug
      (`.claude/launch.json`'s wrong dev-server port) that had been
      silently breaking Browser-pane verification; confirmed DOM/text/
      console verification against the real `vite dev` server now
      genuinely works (`LoginScreen` renders correctly with the
      expected, already-documented "no Tauri IPC bridge" console
      errors — not a new bug); pixel-level screenshot capture is
      blocked this session by a client-side Browser-pane-display state,
      disclosed, not worked around — see ADR-0030.
- [x] Establish measurable UI baselines (grepped directly from source,
      not estimated): loading state (`role="status"`) present in 10/13
      screens; error state (`role="alert"`) in 12/13; a distinct empty-
      state message in 8/13 (the other 5 either always have data by
      construction or are pure banners/warnings with no list to be
      empty); `useTeacherMode` (Guided-hint capability) wired in 12/13.
      316/316 TS tests passing across 43 test files is the existing
      structural/accessibility baseline (`axe-core` via
      `expectNoAccessibilityViolations`) every later UX milestone's own
      test changes are compared against.
- [x] Run `npm run quality` (316/316), `npm run build`, `npx knip`
      (same 5 pre-existing findings, zero new) as the milestone's
      baseline checks.
- [x] Push the UX-00 completion commit; verify remote sync.

### UX-01 through UX-08 — Queued

See `docs/PROGRESS-MAP.md`'s UI-First Tranche table for the full
ordered list and dependencies. Each gets its own detailed checklist in
this section once its own start checkpoint is pushed — not written in
advance, since UX-00's screen inventory and chosen design direction
will shape exactly what each later milestone's checklist should say.

## Historical M0-M20 detail (unchanged, chronological, pre-dates the UI-first direction)

## M0 Workspace Foundation — Complete

Goal: create a clean, reproducible, production-oriented development baseline before feature work.

Verified on this machine (2026-08-23):

- `npm install` — clean, 0 vulnerabilities.
- `npm run typecheck` — passes (`tsc -b --noEmit`, strict mode).
- `npm run lint` — passes (ESLint flat config, 0 issues).
- `npm run format:check` — passes (Prettier, all files).
- `npm run test` — passes (Vitest + Testing Library, jsdom).
- `npm run build` — passes (Vite production build).
- `cargo check` / `cargo build` in `src-tauri/` — both pass. Rust
  `stable-x86_64-pc-windows-msvc` toolchain and Visual Studio Build Tools
  2022 (C++ workload) were installed via winget during this session and
  produced a linked `app.exe`.

Not run: `tauri build` (installer bundling via WiX/NSIS) and `tauri dev`
(interactive window) — out of scope for a workspace-foundation checkpoint
and not needed to verify the toolchain.

## M1 Windows LocalDatabase Foundation — Complete

Goal: one reusable, provider-independent persistence pattern (Repository
Ports -> Infrastructure/Platform Adapters) proven with ordinary SQLite.
Decision record: `docs/adr/0002-local-database-foundation.md`.

Delivered: `src-tauri/src/{db,repository,commands,error}.rs` (all SQL
lives in Rust; `Learner` reads are school-scoped only; Mutex-poisoning
recoverable; IPC errors carry no internals), `src/domain/`,
`src/domain/ports/`, `src/infrastructure/tauri/` (TS types/ports/adapters
so UI never imports Tauri or SQLite directly). Independently reviewed
(architecture/security/reliability); findings fixed.

Verified: `cargo test` 14/14, `cargo clippy -D warnings` clean, `cargo
build` clean, `npm run quality` clean (5/5 TS tests).

## M2 Encryption-at-Rest & Secure Key Storage — Complete

Goal: encrypt the working database and protect its key, without changing
the M1 pattern's shape. Decision record:
`docs/adr/0003-encryption-at-rest.md`.

Delivered: SQLCipher via `rusqlite`'s `bundled-sqlcipher-vendored-openssl`
(raw 256-bit key, `PRAGMA cipher_compatibility = 4` pinned), a `KeyStore`
trait with a `DpapiKeyStore` implementation (Windows DPAPI, atomic
create-or-load, fails closed on a corrupted/undecryptable key file, never
silently mints a replacement key), key material zeroized after use.
Independently security-reviewed; one blocking finding (a key-file-creation
TOCTOU race) and several hardening gaps (no zeroization, no
cipher-compatibility pin, DPAPI flags, null-pointer guard) fixed.

Verified: `cargo test` 22/22 — including a test that opens an encrypted
database with no key and with the wrong key and confirms SQLCipher's HMAC
check genuinely rejects both (real cryptographic proof, not just design
intent). `cargo clippy -D warnings` clean. `npm run quality` clean
(TS side unaffected — encryption is transparent below `db::open`).

New build-time dependency: Perl (Strawberry Perl, installed via winget) —
required to compile vendored OpenSSL for SQLCipher on Windows.

Not implemented (deliberately out of scope): cloud sync, authentication,
recovery path for a lost key file (intended recovery is a future cloud
sync restore, not a local escape hatch that would weaken the guarantee).

## M3 Application Services & Input Validation Foundation — Complete

Goal: put something between UI and the repository ports so validation and
multi-step business rules have a home (the M1 review had flagged school
and learner names as only NOT-NULL constrained at the SQL level, not
validated as non-empty — this was the first concrete case).

Delivered: `src/domain/errors.ts` (`ValidationError`, distinct from
infrastructure errors), `src/application/school-service.ts`
(`SchoolApplicationService.registerSchool`), `src/application/learner-service.ts`
(`LearnerApplicationService.enrollLearner`/`listLearners`) — both validate
(trim, non-empty, max length) before ever calling the repository.

Verified: `npm run quality` clean, 15/15 TS tests (10 new), including
proof that invalid input never reaches the fake repository's `create`
call — validation happens at this layer, not by trusting the database
constraint alone. Fully unit-tested without a live UI window, using fake
in-memory repository implementations — no Rust changes in this milestone,
so the Rust suite was not re-run.

## M4 Authentication & Local Session Foundation — Complete

Goal: close the "every operation was implicitly trusted" gap from M1–M3.
Product decision (from the user): shared school computers, multiple
teachers, no 1:1 Windows-account assumption; LIKHA username+password
identity; local/offline authentication; explicit session tied to
identity + school scope; fail closed; no role/permission system yet.
Decision record: `docs/adr/0004-authentication-and-local-session.md`.

Delivered: `src-tauri/src/auth/` (Argon2id hashing, timing-safe
unknown-user handling, `SessionManager` — in-memory gate that never
survives a restart, checked against both expiry and an independent DB
revocation lookup), `src-tauri/src/repository/{user,session}.rs`,
`src-tauri/src/commands/{auth,user}.rs`, `commands::learner::*` updated
so `school_id` is derived from the session and is no longer a
client-supplied parameter at all. TS mirrors: `src/domain/{user,session}.ts`,
`src/domain/ports/{auth,user}-repository.ts`,
`src/infrastructure/tauri/{auth,user}-repository.ts`,
`src/application/{auth,user}-service.ts`; `LearnerRepository`/
`LearnerApplicationService` updated to match the session-derived shape.

Independently reviewed (authentication/security, architecture boundaries,
offline behavior, session lifecycle, school isolation, test sufficiency).
One **blocking** finding, fixed: the initial design left `register_user`/
`add_user_to_school` completely unauthenticated, letting anyone with UI
access and zero credentials self-grant membership in an already-populated
school and read its real data — reproducing the exact gap M4 was meant to
close. Narrowed to: unauthenticated only for a device's very first user
account, and only for a school's very first membership; every case after
that requires an active session (scoped to the same school, for
memberships). Should-fix findings also closed: session revocation is now
checked independently against the DB (not only in-memory), plaintext
password `String`s are zeroized at the command boundary.

Verified: `cargo test` 63/63 (up from 49 pre-M4), covering — among the
security requirements explicitly required for this milestone — correct
password succeeds; wrong password fails; unknown username fails with the
_same_ error and comparable timing as wrong password; password never
stored plaintext (`$argon2id$...` only); hash is salted (two hashes of
the same password differ); session missing/expired/independently-revoked
all fail closed; logout invalidates immediately; a process restart always
requires fresh login even with an unexpired DB session row; one school's
session cannot read another school's learners (there is no parameter
through which it could even ask); the unauthenticated-bootstrap attack
scenario is explicitly reproduced and confirmed blocked.
`cargo clippy -D warnings` clean. `npm run quality` clean (30/30 TS
tests, up from 15).

Not implemented (deliberately out of scope): roles/permissions beyond
"session scoped to a school," password reset, account lockout,
idle-timeout (only fixed 8h expiry), cloud authentication, any UI.

## M5 App Shell & First Learner UI Vertical Slice — Complete

Goal: prove the full stack end-to-end (`UI -> Application Services ->
Domain -> Repository Ports -> Infrastructure/Platform Adapters`) with a
real screen, and turn Efficient/Comfortable/Guided from documented intent
into a working mechanism. Decision record:
`docs/adr/0005-app-shell-and-first-ui-slice.md`.

Delivered: `src/composition.ts` (the one file wiring concrete Tauri
adapters into Application Services), `src/ui/{AppShell,LoginScreen,LearnerListScreen}.tsx`,
`src/ui/theme/*` (mode context + CSS custom properties per mode), `App.tsx`
rewritten as the top-level checking-session/sign-in/learner-list state
machine.

Independently reviewed (design/teacher-comfort; accessibility — both
explicitly told they had no rendering/screenshot tool and instructed not
to claim visual verification). Two **blocking** findings, both fixed:
(1) `LoginScreen` was overwriting every login failure, including
validation errors, with one generic message, inconsistent with
`LearnerListScreen`'s already-correct handling; (2) `--color-border` —
used for every input/button/divider outline project-wide — measured
~1.3–1.6:1 contrast against the page/surface backgrounds (computed from
the actual hex values, not estimated), well under the 3:1 WCAG 1.4.11
minimum for UI component boundaries. Should-fix findings also closed: the
mode system was token-only (spacing/font-size only) with an unused
`.field-hint` CSS class — `Guided` mode now renders genuine contextual
help text no other mode shows; no loading state on the schools dropdown;
no confirmation after enrolling a learner; no focus management on screen
transitions; the mode switcher's pressed state relied on color alone
(WCAG 1.4.1); placeholder `<option>`s weren't `disabled`.

Verified: `npm run quality` clean, 56/56 TS tests (up from 30 — every
fix above has a dedicated test, not just "didn't break existing tests"),
including `axe-core`-based structural accessibility checks on every
screen (switched from `vitest-axe`, unmaintained at v0.1.0 with types
that don't match Vitest 4.x, to a small direct wrapper — see
`src/test/a11y.ts`). Production `npm run build` clean. Additionally,
launched the actual compiled `app.exe` directly (not just `cargo test`)
and confirmed via its log output that it opens the encrypted database and
applies both migrations successfully end-to-end — real evidence beyond
unit tests that M1–M4's wiring works in the real binary.

**Explicitly NOT verified**: this session's environment has no browser,
screenshot, or rendering tool. Nothing about actual visual layout, color
rendering, spacing rhythm, or whether the UI "feels" premium was
confirmed — only what static analysis, computed contrast ratios, and
jsdom-based component/accessibility tests can prove. A human (and
screen-reader) pass on the running app is still required and was not
substituted for.

## M6 First-Run / School Bootstrap Experience — Complete

Goal: give a fresh install an actual way to create its first school and
teacher account through the UI — M5's `LoginScreen` requires at least one
school/membership to exist, but nothing could create them. Decision
record: `docs/adr/0006-first-run-bootstrap.md`.

Delivered: `auth::bootstrap_installation` (one atomic transaction: school

- first user + membership + session, all-or-nothing),
  `repository::installation` (the one-time-only guard),
  `commands::setup::{installation_status,bootstrap_installation}`,
  migration 3 (`installation_state`), `AppError::AlreadyInitialized`. TS:
  `src/ui/FirstRunSetupScreen.tsx` (single form, "Your school"/"Your
  account" sections, shared password show/hide, teacher-facing copy — no
  jargon), `src/application/setup-service.ts`,
  `src/domain/ports/setup-repository.ts`,
  `src/infrastructure/tauri/setup-repository.ts`,
  `src/domain/password-policy.ts` (shared min-password-length constant).
  `App.tsx` now checks `installationStatus()` before anything else.

Independently reviewed (design/teacher-comfort, accessibility — both
completed; a planned independent security/reliability review hit a
session usage limit mid-run and had to be replaced with rigorous
self-review, retried once more in the background afterward). The
self-review found and fixed a real **blocking** concurrency bug: the
first version of the one-time-only guard was a `SELECT`-then-act check
inside the transaction, reasoning that SQLite's cross-process write lock
would serialize two racing processes — it doesn't; SQLite does not
invalidate an already-established read snapshot just because a
different connection committed since, so two processes racing to
bootstrap the same file could both pass that check and both succeed.
Fixed with a real `INSERT`-based singleton claim
(`installation_state`, PK-constrained to one row), which genuinely
participates in SQLite's write-lock serialization the way a `SELECT`
never does. Verified with a real multi-thread, multi-connection,
same-file concurrency test (`tests/bootstrap.rs`), not just sequential
re-calls or reasoning. Should-fix accessibility findings closed:
confirm-password field wasn't linked to the length-hint via
`aria-describedby`; checkbox/radio target size was below WCAG 2.2 SC
2.5.8's 24×24px minimum in two of three teacher modes; "administrator"
wording softened for a first-time, possibly-nervous user.

One **accepted residual risk**, documented not fixed: a narrower race
remains between `bootstrap_installation` and the older
`register_user`/`add_user_to_school` commands racing _each other_
specifically (both still use `SELECT`-based gates with the same
snapshot-staleness property) — requires two different UI flows driven by
two separate processes simultaneously, and the worst case is duplicate
accounts/schools, not a privilege escalation or data leak. See ADR-0006
Consequences.

Verified: `cargo test` 72/72 (up from 63), `cargo clippy -D warnings`
clean. `npm run quality` clean, 76/76 TS tests (up from 56) — including
proof that a mismatched-password retry succeeds cleanly without losing
already-entered data, that a generic (non-leaking) message shows on a
server-side failure, and that the setup screen's visible copy contains
none of "database/migration/credential hash/tenant/cryptography/
repository." `npm run build` clean. Relaunched the actual compiled
`app.exe` after the Rust changes and confirmed clean startup via logs
(same real-binary check used in M5).

## Claude Code Harness Upgrade — Complete (2026-08-24)

Goal: a one-time development-process infrastructure upgrade (not an
application milestone) — a lean, project-local Claude Code operating
system per the 31-section spec given for this session. Decision record:
`docs/adr/0007-claude-code-harness-architecture.md`. Full working log:
`.planning/harness-upgrade/{task_plan,findings,progress}.md`.

Delivered: `.claude/rules/*.md` (4), `.claude/skills/*/SKILL.md` (16),
`.claude/agents/*.md` (8, all read-only), `.claude/settings.json` +
`.claude/hooks/*.cjs` (3 hook scripts), `scripts/check-architecture.mjs`
(+ test), `scripts/check-security.mjs`, `.gitleaks.toml`,
`src-tauri/deny.toml`, `osv-scanner.toml`, `docs/VERIFICATION-DEBT.md`,
`docs/SOURCE-REGISTRY.md`. Installed and verified: Gitleaks 8.30.1
(winget), OSV-Scanner 2.4.0 (winget), cargo-deny (`cargo install
--locked`), `@playwright/cli@0.1.18` (npm, exact-pinned) with its
official skill. One real app-adjacent fix: `src-tauri/Cargo.toml` gained
`publish = false` (the crate is never published; this was a genuine
`cargo deny` finding, not a stylistic change).

Independently reviewed by three fresh agents (security, architecture,
reliability) against the harness itself, plus a final `evaluator` pass.
Findings and fixes: (1) `format-write-edit.cjs` used `spawnSync` with
`shell: true` on a filesystem path taken from tool input — fixed with an
explicit in-repo/safe-characters check before the path ever reaches the
shell; (2) `.claude/rules/architecture.md` didn't mention
`src/application` even though the checker script correctly restricts it
— wording fixed to match; (3) the original `quality:security` script
chained three tools with `&&`, which can't distinguish "tool not
installed" from "tool ran and found something" (both exit 1) — rewritten
as `scripts/check-security.mjs` with an explicit per-tool presence probe,
verified against both a tools-missing and a tools-present shell state.

Verified: `npm run quality` clean (17 test files / 81 tests, up from 76 —
5 new tests for the architecture checker), `npm run quality:security`
clean (Gitleaks 0 leaks, `cargo deny check` clean across
advisories/bans/licenses/sources, OSV-Scanner clean with 17 accepted
findings documented and filtered — 16 transitive unmaintained-crate
RUSTSEC ids from Tauri's own dependency tree with no upstream fix, plus
one Linux-only glib CVE not reachable on this project's Windows-only
build target), `cargo test` 72/72, `cargo clippy --all-targets -D
warnings` clean.

**Known, disclosed gap**: `.claude/settings.json` did not exist when this
session started, so its hooks were pipe-tested with synthesized stdin
(confirmed correct input/output behavior) but were not observed live in
this same session — the settings-file watcher only watches directories
that existed at session start. A `/hooks` reload or session restart
activates them.

## Graphify Code-Graph Evaluation — Rejected, No Change (2026-08-24)

Goal: evaluate `Graphify-Labs/graphify` as a possible CLI+skill
accelerator for architecture exploration, per an explicit follow-up
harness task. Full writeup: `docs/SOURCE-REGISTRY.md` and
`.planning/graphify-eval/findings.md`.

**Rejected at the security-review gate, before any installation.**
Independently verified (`gh api`, not just a research summary):
109,806 stars / 10,675 forks on a repo created 4.5 months earlier — a
~245x gap over the next most-starred same-named project, matching
documented fake-star reputation-laundering patterns — plus the
maintainers explicitly declining to fix a live, self-acknowledged PyPI
typosquat vector on their own install path (issue #280, read in full,
closed `not_planned`). A cluster of similarly-named satellite repos
appeared in the same narrow window. No code from this project was
downloaded, cloned, or executed; no dependency was added; no `.claude/`
skill/agent/hook was created for it. `npm run quality` re-verified clean
afterward (81/81 tests) — this task made no application-affecting
change.

## Windows Machine-Migration Checkpoint — Complete (2026-08-24)

Goal: verify this canonical repo (`C:\Projects\likha-sis-0.2`, matching
`origin/main` at `a70915b`) is in a working, reproducible state on a
newly-set-up Windows PC, and fix any real defects found — not an
application milestone.

Delivered: `.gitattributes` (LF-normalizes text sources; CRLF pinned for
`.cmd`/`.bat`; binaries marked `binary`), `scripts/verify-dev-environment.ps1`
(read-only doctor: Git/Node/Rust/MSVC+SDK/Perl/line-ending-policy/stale-
build-cache-regression), `scripts/setup-windows.ps1` (idempotent winget
installer for the same prerequisite list, diagnosis-first).

Two real defects found and fixed, neither an application-code change:
(1) no `.gitattributes` existed, so a Windows clone with the common
global `core.autocrlf=true` default (this machine's global setting, even
though this specific repo's local override was already `false`) would
checkout CRLF and fail `prettier --check`; (2) `src-tauri/target/`
contained cached Rust build-script output with absolute paths baked in
from a different clone directory name, breaking `cargo build`/`cargo
test` with a cryptic "plugin permissions file not found" error — fixed
by a full clean delete-and-rebuild of `target/`, done strictly
sequentially (two earlier attempts that overlapped background build
processes on the same directory did not clear it).

Independently reviewed: `security-reviewer` on the two new `.ps1` files
and `.gitattributes` — no blocking findings; two should-fix items in
`setup-windows.ps1` (pin `--source winget`; propagate install failure to
a non-zero exit instead of silently succeeding) — both fixed.
`reliability-reviewer`: two independent attempts both entered a confused
state (misinterpreting genuinely new follow-up messages as repeated
automated hook reminders, returning no usable findings) — replaced with
rigorous self-review, mirroring M6's fallback when an independent review
hit a session limit; full detail in `docs/CURRENT-HANDOFF.md`.
`architecture-reviewer` not invoked — no application code changed, only
new scripts and repo config.

Verified: `npm run quality` clean (17/17 test files, 81/81 tests — same
count as before this checkpoint, confirming no regression), `cargo test`
85/85 (up from 72 at the last recorded M6 checkpoint — the difference is
tests added by the prior harness-upgrade session, not this one),
`cargo clippy --all-targets -- -D warnings` clean (run twice: once with
the pre-existing uncommitted `Cargo.toml` diff in place, once with it
temporarily stashed out, to confirm that diff is not what fixed the
build). `scripts/verify-dev-environment.ps1` itself reports 0 FAIL, 2
WARN (cargo/perl correctly installed but not on the specific shell
session's PATH — expected and by design, not a defect), 7 PASS.

Not run: `npm run quality:security` (Gitleaks/OSV-Scanner/cargo-deny not
on this machine's PATH — disclosed gap, see `docs/PROJECT-MEMORY.md`).

Additionally launched the actual compiled `src-tauri\target\debug\app.exe`
directly (M5/M6 precedent) for several seconds: it created a real
WebView2 profile under `%LOCALAPPDATA%\org.likhasis.app\EBWebView\`
(proof the native window/webview genuinely initialized under the correct
app identifier, not just that the process started), ran without a Rust
panic or crash, and shut down cleanly with no lingering process — the
only log line was a single benign Chromium/WebView2 teardown diagnostic
("Failed to unregister class Chrome_WidgetWin_0"), a known harmless
message on WebView2 process exit, not an application error. **What this
does NOT prove**: this session has no browser/screenshot/GUI-observation
tool for the native window, so nothing about actual visual rendering,
layout, or the first-run/login screen appearing correctly was confirmed
— the WebView2 profile's existence is backend/process evidence, not a
substitute for a human visual pass. See `docs/VERIFICATION-DEBT.md`
(standing gap, unchanged by this checkpoint).

## M7 Attendance Tracking — Complete (2026-08-24)

Goal: a first attendance vertical slice — a teacher can mark each learner
in their school Present/Absent/Late/Excused for a given date, and see the
whole roster (including unmarked learners) for that date. Chosen by the
user from a candidate list after the Windows migration checkpoint (see
`docs/CURRENT-HANDOFF.md`'s prior "no M7 defined" blocker) — explicitly
scoped as attendance recording only, not an official DepEd form (SF2)
export, which remains a distinct future candidate.

Delivered, mirroring the M5 `learner` slice's layering exactly (no new
architectural decision, so no new ADR — see ADR-0002/0004/0005):

- `src-tauri/src/db/migrations.rs` migration 4: `attendance_records`
  (`school_id`/`learner_id` FKs, `UNIQUE(learner_id, attendance_date)`,
  a `CHECK` constraint on `status`).
- `src-tauri/src/repository/attendance.rs`: `record()` (verifies the
  learner belongs to the caller's school via the existing
  `learner::find_by_id_in_school` before an upsert —
  `INSERT ... ON CONFLICT (learner_id, attendance_date) DO UPDATE`, so
  re-marking the same learner/date overwrites rather than duplicates) and
  `roster_for_date()` (a `LEFT JOIN` from the full roster, so unmarked
  learners still appear — not a plain list of `attendance_records`).
- `src-tauri/src/commands/attendance.rs`: `attendance_roster_for_date`,
  `record_attendance` — `school_id` derived only from
  `sessions.require_active_school_scope`, never a parameter, matching
  every other tenant-data command in this codebase.
- TS: `src/domain/attendance.ts`, `src/domain/ports/attendance-repository.ts`,
  `src/application/attendance-service.ts` (validates learner id, date
  format/non-future, and status before ever calling the repository — a
  `now: () => Date` clock is injected for testability), `src/infrastructure/tauri/attendance-repository.ts`,
  `src/ui/AttendanceScreen.tsx` (date picker defaulting to today,
  max-today; a roster table with one status-button group per learner;
  immediate marking with no separate save step — the pressed-button state
  change is the confirmation, deliberately not a banner-per-click, since
  attendance marking is high-frequency/repetitive unlike the one-time
  learner-enrollment form). Reachable from the app via a new
  "Learners"/"Attendance" section switcher in `App.tsx`, shown once
  signed in.

Verified: `cargo test` 98/98 (up from 85 before this milestone — 7 new
repository unit tests, 6 new integration tests in
`tests/attendance_management.rs` proving cross-school isolation and
auth-required behavior at the command-equivalent layer, matching
`tests/learner_management.rs`'s pattern), `cargo clippy --all-targets -D
warnings` clean, `npm run quality` clean (20/20 test files, 99/99 tests —
up from 81 before this milestone, including a dedicated
`AttendanceScreen.test.tsx` with an `axe-core` structural accessibility
check), `npm run build` clean, `npm run check:architecture` clean.
Relaunched the compiled `app.exe`: log output confirmed
`Database migrated to version 4` (real proof the new migration applies
cleanly against a live SQLCipher-encrypted database, not just that
`cargo build` succeeded) and clean shutdown with no panic.

Independent review: `security-reviewer`, `architecture-reviewer`,
`teacher-ux-reviewer`, and `accessibility-reviewer` were all launched and
each completed substantial real work (14-23 tool calls, 42k-58k tokens),
but this session hit a harness-level issue where none of their findings
text was retrievable through the completion notification or a resumed
follow-up message (confirmed not agent-specific: it affected all four,
across two different resume attempts each) — full detail in
`docs/CURRENT-HANDOFF.md`. Replaced with rigorous self-review against the
exact same review prompts, the same fallback M6 and this session's own
Windows-migration checkpoint used when independent review didn't
complete. Self-review confirmed: `record()` checks
`learner::find_by_id_in_school` before writing and holds the same
Mutex-guarded connection for the whole command (no TOCTOU window, same
pattern as `learner::update`); all SQL is parameterized, no string
interpolation of caller input; `commands::attendance::*` never accepts
`school_id` as a parameter; `npm run check:architecture` passes and
`AttendanceScreen.tsx` only imports from `application`/`domain`, not
`infrastructure` or `@tauri-apps/*`; the pressed-status non-color cue
(`::before { content: "✓ " }`) mirrors the already-reviewed
`.mode-switcher` pattern exactly; per-learner `aria-label`s on each
status-button group are intentional repetition (necessary for a screen
reader user tabbing through many learners' buttons to know whose row
they're on), not an oversight.

**Not verified**: same standing gap as every prior UI milestone — no
browser/screenshot tool for the native window in this session, so actual
visual rendering of `AttendanceScreen` was not confirmed, only
structural/accessibility/behavioral testing. See
`docs/VERIFICATION-DEBT.md`.

**Update**: a single fresh re-attempt at `security-reviewer` (per this
session's one-retry escalation rule) succeeded in surfacing findings —
no blocking issues, two informational notes fixed (an unscoped re-fetch
query tightened to filter by `school_id`; a panic-on-malformed-status
path changed to a recoverable `AppError`). Re-verified: `cargo test`
98/98, `cargo clippy -D warnings` clean. `architecture-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer` still ↺ INDEPENDENT
REVIEW REQUIRED — see `docs/CURRENT-HANDOFF.md`.

## M8 Monthly Attendance Summary — Complete (2026-08-24)

Goal: a school-wide monthly attendance overview, selected as M8 via a
20-scenario evidence-based product-decision simulation (full record:
`docs/product/M8-DECISION.md`). Explicitly **not** a section-level SF2
replica — see that record's "Update 2" for the real DepEd source that
grounded this scope decision.

**Real source used**: the user provided an actual, in-use DepEd
`CONSO SF v2025.xlsx` workbook. Its structure was inspected directly
(sheet names, headers, legend) to verify SF2's real layout —
**structural facts only were extracted; the workbook's real learner/
staff names and school identity were never copied into this repository**,
per the synthetic-data-only rule. This grounded two scope corrections:
SF2 is organized per section/grade level (LIKHA-SIS has no such entity
yet — `School` has only `id`/`name`/`created_at`, checked directly), and
DepEd's actual per-day codes (blank/Present, "x"/Absent, half-shaded/
Tardy) don't include a 4th "Excused" code the way this app's model does.

Delivered, no new database migration (a pure read/aggregate over
existing `attendance_records` + `learners`):

- `src-tauri/src/repository/attendance.rs`: `monthly_grid()` — a
  `LEFT JOIN` roster query restricted to a `year`/`month`'s **school
  days only** (Mon-Fri; verified against the real SF2 source, not
  assumed), via a new dependency-free `day_of_week()` (Sakamoto's
  algorithm, unit-tested against known reference dates including a leap
  day) and `days_in_month()`. Returns per-learner day arrays plus
  present/absent/late/excused totals, school-scoped identically to
  `roster_for_date`.
- `src-tauri/src/commands/attendance.rs`: `monthly_attendance_summary` —
  `school_id` derived only from the session, same convention as every
  other command.
- TS: `MonthlyAttendanceReport`/`MonthlyLearnerAttendance` domain types,
  `AttendanceRepository.monthlySummary()`, `AttendanceApplicationService.monthlySummary()`
  (validates month 1-12, year range, and rejects a month that hasn't
  started yet — allows the current in-progress month), `TauriAttendanceRepository.monthlySummary()`,
  `src/ui/MonthlySummaryScreen.tsx` (a month picker defaulting to the
  current month, a school-day grid table with per-day status
  abbreviations and full-text `aria-label`s, monthly totals per learner,
  and an on-screen disclaimer naming both scope gaps above — not
  buried in documentation only). Reachable via a third "Monthly Summary"
  tab in the existing Learners/Attendance section switcher.

Verified: `cargo test` 107/107 (up from 98 — 6 new `monthly_grid` unit
tests including day-of-week correctness against real calendar reference
dates, a weekend-exclusion proof, a different-month-exclusion proof, and
3 new integration tests in `tests/attendance_management.rs` proving
cross-school isolation and auth-required behavior for the new command,
matching the existing pattern), `cargo clippy --all-targets -D warnings`
clean, `npm run quality` clean (21/21 test files, 113/113 tests — 8 new
dedicated `MonthlySummaryScreen.test.tsx` tests including an axe-core
accessibility check), `npm run build` clean, `npm run check:architecture`
clean. Relaunched the compiled `app.exe`: clean startup and shutdown, no
panic (no new migration to confirm this time — none was needed).

**Independent review**: one fresh `security-reviewer` attempt was made
(the harness-failure rule's one-retry allowance) and hit the same
agent-resume retrieval issue affecting several other agents this
session (22 tool calls / 73k tokens of real work, no retrievable
findings). Per that rule: not retried further; self-review performed
instead. Self-review confirmed via direct code read plus the passing
test suite: all SQL in `monthly_grid` is parameterized (`school_id` in
the `WHERE` clause, date range as bind parameters, never string-built
from caller input); `monthly_attendance_summary` never accepts
`school_id` as a parameter; the new cross-school-isolation integration
test (`a_teachers_monthly_summary_never_includes_another_schools_learners`)
and auth-required test both pass. **Marked ↺ INDEPENDENT REVIEW
REQUIRED** in `docs/CURRENT-HANDOFF.md` — architecture/teacher-ux/
accessibility review was not even attempted this milestone (budget
went to the one permitted security-reviewer retry instead), so those
three plus a real second security opinion are all still owed.

## M9 Section Foundation + DepEd Attendance Semantic Alignment — Complete (2026-08-24)

Goal: close the two real gaps M8's DepEd source work surfaced — no
`Section` entity (SF2 is organized per section/grade level) and an
attendance status model with an invented 4th "Excused" code DepEd does
not have. Redirected mid-session from the previously-decided "Learner
Profile Enrichment" (now the leading M10 candidate) — see
`docs/product/M9-DECISION.md` for why this wasn't a re-simulation, and
`docs/adr/0008-section-foundation-and-attendance-semantics.md` for the
full technical decision.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 5: `sections`
  (`school_id`/`school_year`/`grade_level`/`name`, unique on the
  4-tuple), `section_memberships` (half-open `[starts_on, ends_on)`
  interval per learner, `CREATE UNIQUE INDEX
idx_one_active_membership_per_learner ... WHERE ends_on IS NULL` as a
  structural — not application-level — one-open-membership guarantee),
  and a full `attendance_records` rebuild (SQLite cannot alter a `CHECK`
  constraint in place) adding `section_id` and narrowing `status` to
  `present`/`absent`/`tardy` with a tested lossless data migration
  (`late → tardy`, `excused → absent`).
- `src-tauri/src/repository/{section,section_membership}.rs`: school-
  scoped section CRUD, `enroll()` (validates section/learner both belong
  to the caller's school, transfers a learner out of any other open
  membership), `roster_for_section()`/`roster_for_section_over_range()`,
  `is_active_member()`.
- `src-tauri/src/repository/attendance.rs` reworked: `record()` now
  verifies section-then-learner-then-active-membership before writing;
  `roster_for_date` → `roster_for_section_date`; `monthly_grid` →
  `monthly_grid_for_section`. `AttendanceStatus` is the real 3-code enum.
- `src-tauri/src/commands/{attendance,section}.rs`: `section_id` is a
  client-supplied parameter (like `learner_id` already was) — isolation
  holds because every query scopes on `school_id` (session-derived) AND
  `section_id` together, so a foreign `section_id` resolves to nothing
  rather than leaking rows. New commands: `list_sections_by_school`,
  `create_section`, `enroll_learner_in_section`, `section_roster`.
- TS: `src/domain/section.ts`, `src/domain/ports/section-repository.ts`,
  `src/infrastructure/tauri/section-repository.ts`,
  `src/application/section-service.ts`, `src/ui/SectionsScreen.tsx` (new
  — create a section, enroll a learner; the minimum needed for
  Attendance/Monthly-Summary to stay reachable, not full roster
  management). `domain/attendance.ts` updated to the 3-status model
  (`tardyCount` replaces `lateCount`/`excusedCount`).
  `AttendanceScreen`/`MonthlySummaryScreen` both gained a section picker
  ahead of their date/month pickers; teacher-facing copy and
  `aria-label`s changed from Present/Absent/Late/Excused to
  Present/Absent/Tardy throughout. `App.tsx` gained a "Sections" tab.

Verified: `cargo test` 125/125 (94 lib + 12 attendance-integration + 7
auth + 1 bootstrap + 7 learner + 4 db — up from 107 before this
milestone; includes `migration_5_converts_legacy_attendance_data_without_loss`,
`migration_5_enforces_one_active_membership_per_learner`, full
`repository::section`/`repository::section_membership` unit coverage,
and rewritten `tests/attendance_management.rs` integration tests proving
cross-school isolation for both a foreign learner AND a foreign
`section_id` specifically), `cargo clippy --all-targets -D warnings`
clean, `npm run quality` clean (24/24 test files, 138/138 tests — up
from 113 before this milestone), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: one `security-reviewer` attempt was made this
milestone (29 tool calls / ~90k tokens of real work over ~8 minutes,
confirmed via `ListAgents`), and hit the same agent-resume retrieval
issue affecting several other agents this session and M7/M8 before it —
the completion notification carried no findings text. Per this session's
one-retry escalation rule, it was resumed once via `SendMessage` asking
it to restate its findings; the second completion notification also
carried nothing retrievable ("No new input"). Per the rule (retry once,
don't repeatedly retry), not retried further — self-review performed
instead, the same fallback M6/M7/M8 used.

Self-review verified directly against the passing test suite and a
direct code read: (1) `record()`'s three-step gate (section-in-school,
learner-in-school, active-membership) cannot be bypassed —
`tests/attendance_management.rs`'s
`a_teacher_cannot_mark_attendance_using_another_schools_section` and
`recording_attendance_for_a_learner_not_on_the_sections_roster_is_rejected`
both pass; (2) all new SQL is parameterized (bind-parameter tuples, no
`format!`/string interpolation into query text) in
`repository::{section,section_membership,attendance}`; (3)
`commands::section::*`/`commands::attendance::*` never accept
`school_id` as a parameter, matching every other command in this
codebase — `school_id` is always `sessions.require_active_school_scope(&conn)`;
(4) the `enroll()` transfer race: two concurrent `enroll()` calls for
the same learner racing past the same `current_open` `SELECT` would both
`UPDATE` the old membership's `ends_on` (idempotent) and then both
attempt to `INSERT` a new open membership — the second `INSERT` hits
`idx_one_active_membership_per_learner`'s `UNIQUE` constraint and fails
with a real DB error (mapped to `AppError::Database`), not a silent
duplicate open membership; this is the same class of bug M4/M6 shipped
once each (a `SELECT`-then-act check with no real serialization) but
here the actual write-time uniqueness is enforced by a genuine SQL
constraint, not application logic re-checking the same stale read — so
the outcome is a failed second call, not a data-integrity violation; (5)
`npm run check:architecture` passes, confirming `SectionsScreen.tsx`/
updated `AttendanceScreen.tsx`/`MonthlySummaryScreen.tsx` only import
from `application`/`domain`. **Still owed**: a real (non-self)
`architecture-reviewer`/`security-reviewer`/`teacher-ux-reviewer`/
`accessibility-reviewer` pass for M9, on top of the ones already owed
from M7/M8, once agent-resume behavior is confirmed working in a session
where it isn't broken.

**Not verified**: same standing gap as every prior UI milestone — no
browser/screenshot tool for the native window in this session, so actual
visual rendering of `SectionsScreen`/the updated section pickers was not
confirmed, only structural/accessibility/behavioral testing. See
`docs/VERIFICATION-DEBT.md`.

## M10 Local Section-Level SF2 Export + Reusable Official-Form Engine Foundation — Complete (2026-08-24)

Goal: a section-level, DepEd-SF2-inspired monthly attendance export a
teacher can actually use, plus a small reusable foundation for future
official-form exports. User-directed (not autonomously selected) — see
`docs/adr/0009-sf2-export-and-official-form-engine.md` for the full
decision, source citations, and scope boundaries.

**Research method**: two prior `security-reviewer` agent attempts this
session (recorded under M9, above) both hit the same agent-resume
retrieval issue. Rather than spend another attempt on `deped-researcher`
very likely to hit the identical harness bug, SF2's field layout was
researched inline via `WebSearch`/`WebFetch` in the main session
instead. Triangulated across three independent sources: DepEd Order No.
4, s. 2014 ("Adoption of the Modified School Forms"); two independent
web sources (depedph.com, teacherph.com); and the real
`CONSO SF v2025.xlsx` workbook inspected during M8. All three agree on
the per-day coding legend and section/month organization.

Delivered:

- `src-tauri/src/export/csv.rs`: a dependency-free RFC-4180-minimal CSV
  writer (escapes commas/quotes/newlines) — the reusable "engine" piece,
  fully unit tested.
- `src-tauri/src/export/sf2.rs`: `build_sf2_export()`, a pure function
  (no DB/auth access) that assembles the SF2-inspired CSV from an
  already-fetched `School`/`Section`/`MonthlyAttendanceReport`, plus a
  `FieldDisclosure` struct (`populated_fields`/`omitted_fields`, each
  omission with a stated reason) — the other reusable piece, meant to be
  returned by every future official-form export, not just this one.
  **No zero-filled placeholder statistics**: DepEd's enrollment/dropout/
  transfer/gender footer fields are omitted entirely rather than
  emitting a fabricated `0` for data this app has never tracked, since a
  fake zero on a form a teacher might submit is a real compliance risk,
  not an honest gap.
- `src-tauri/src/commands/export.rs`: `export_section_monthly_sf2` —
  `school_id` derived only from the session (same convention as every
  other command); `section_id` is client-supplied the same legitimate
  way established in ADR-0008, resolved via `section::find_by_id_in_school`
  before use, returning `None` for a foreign section rather than any
  data. Writes to `Documents\LIKHA-SIS\` (Tauri's core `document_dir()`
  path API, falling back to `app_data_dir()` — no new plugin, no
  capability change, zero new dependencies).
- TS: `src/domain/export.ts`, `src/domain/ports/export-repository.ts`,
  `src/infrastructure/tauri/export-repository.ts`,
  `src/application/export-service.ts`. `MonthlySummaryScreen.tsx` gained
  an "Export SF2 (CSV)" button and a result panel rendering the saved
  file path plus the full omitted-fields disclosure, rendered directly
  from the same `FieldDisclosure` the CSV's trailing comment block came
  from — no separately-maintained disclaimer text to drift out of sync.

Verified: `cargo test` 150/150 (115 lib + 12 attendance-integration + 7
auth + 1 bootstrap + 4 export-integration + 7 learner + 4 db — up from
125 before this milestone; includes full `export::csv`/`export::sf2`
unit coverage — per-day code rendering, header-field assembly, an
explicit assertion that no dropout/enrollment/gender field ever appears
outside the disclosure comment block, that every disclosed omission is
actually named in the CSV, CSV/formula-injection neutralization, and
`sanitize_filename_component`'s full Windows-reserved-character
coverage — see "Independent review" below for the two findings that
added the last several tests), `cargo clippy --all-targets -D warnings`
clean, `npm run quality` clean (26/26 test files, 148/148 tests — up
from 138), `npm run build` clean, `npm run check:architecture` clean.
Relaunched the compiled `app.exe`: clean startup and shutdown, no panic
(no new migration this time — none was needed).

**Independent review**: one fresh `security-reviewer` attempt was made
this milestone (a new review episode, not a repeat of M9's already-used
retry) — the first completion notification came back empty (the same
agent-resume issue as M9), but a single resume-and-restate retry this
time succeeded and returned two real, actionable should-fix findings:
CSV/formula injection via a leading `=`/`+`/`-`/`@`/tab in any
teacher-entered field (learner or section name), and an unstripped `:`
in the exported filename (Windows/NTFS alternate-data-stream risk). Both
fixed — see `docs/adr/0009-sf2-export-and-official-form-engine.md`'s
"Independent review" section for full detail and the fix description.
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
still not attempted for M10 — same standing debt as M7/M8/M9.

**Not verified**: same standing gap as every prior UI milestone — no
browser/screenshot tool for the native window in this session, so actual
visual rendering of the export button/result panel was not confirmed,
only structural/behavioral testing (no dedicated a11y test was added for
just the new button/panel — covered by `MonthlySummaryScreen.test.tsx`'s
existing whole-screen `expectNoAccessibilityViolations` check, which
does render with an export result present in one test case). See
`docs/VERIFICATION-DEBT.md`.

Not implemented (deliberately out of scope, see ADR-0009): a user-chosen
save location (Save As dialog), Excel/PDF output, the School ID field
(schema gap), any of the omitted DepEd footer statistics, a generic
form-definition framework for forms beyond SF2.

## M11 Grading-Period Foundation — Complete (2026-08-24)

Goal: a foundation for recording grading periods per school year, without
hardcoding DepEd's grading-period terminology — user-directed (named as
the explicit next-best alongside M10's own direction, no separate
product-decision pass needed). Full decision, source citations, and the
in-flux-policy reasoning: `docs/adr/0010-grading-period-foundation.md`.

**Research finding that shaped the design**: DepEd's grading-period
structure genuinely changed within this project's own lifetime — the
older K to 12 curriculum used four quarters; **DepEd Order No. 9, s.
2026** shifts Basic Education to a three-term structure for SY
2026-2027 onward (confirmed across six independent sources agreeing on
the order number, title, and SY 2026-2027 date range). Not confirmed:
exact per-term dates beyond the SY bookends, and whether Senior High
School follows this order or its own semester structure. **User's
explicit direction, asked directly given this ambiguity**: policy-driven/
versioned periods, defaulting to the current official three-term
structure — not a hardcoded assumption, not further research.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 6: `grading_policies`
  (versioned reference data, `is_default` structurally constrained to
  at most one row via a unique partial index — the third application of
  this project's established one-row-per-condition pattern, see
  ADR-0006/0008), `grading_policy_periods` (a policy's ordered, named
  periods — seed data: 3 terms for the default DepEd Three-Term policy,
  4 quarters for the legacy policy), `grading_periods` (school-scoped,
  `CHECK (starts_on <= ends_on)`, unique per school/school-year/period —
  dates always school-entered, never defaulted).
- `src-tauri/src/repository/grading.rs`: `list_policies`/
  `list_periods_for_policy` (reference data, no school scoping needed —
  there's no tenant data in these tables), `create`/`list_by_school_year`
  (school-scoped, matching `section`'s isolation convention).
- `src-tauri/src/commands/grading.rs`: `list_grading_policies`,
  `list_grading_policy_periods`, `list_grading_periods_by_school_year`,
  `create_grading_period` — `school_id` derived only from the session;
  `policy_period_id` is client-supplied the same legitimate way
  `section_id` already is (ADR-0008/0009), verified to exist before use.
- TS: `src/domain/grading.ts`, `src/domain/ports/grading-repository.ts`,
  `src/infrastructure/tauri/grading-repository.ts`,
  `src/application/grading-service.ts`, `src/ui/GradingPeriodsScreen.tsx`
  (new "Grading Periods" tab: policy picker showing its source citation
  inline, a school-year input, one row per policy period with an
  inline date-range form until saved). `src/ui/theme/styles.css` gained
  a `.visually-hidden` utility (standard clip-rect pattern).

Verified: `cargo test` 168/168 (128 lib + 12 attendance-integration + 7
auth + 1 bootstrap + 4 export-integration + 5 grading-integration + 7
learner + 4 db — up from 150 before this milestone; includes 6 dedicated
`db::migrations::tests::migration_6_*` tests directly proving the seed
data, the default-policy uniqueness constraint, and the
`starts_on <= ends_on` check against a real migration run, plus full
`repository::grading` unit coverage — cross-school isolation, duplicate-
period rejection, unknown-policy-period rejection), `cargo clippy
--all-targets -D warnings` clean, `npm run quality` clean (29/29 test
files, 168/168 tests — up from 148), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: one `security-reviewer` episode, succeeded on
the first attempt this time (no resume-retry needed — this session's
agent-resume issue has been inconsistent: failed twice for M9, succeeded
on retry for M10, succeeded immediately for M11). **No findings** — the
reviewer verified directly against source that `school_id` is derived
exclusively from the session everywhere in `commands::grading::*`,
`policy_period_id` is existence-checked before use with the write itself
scoped to the session-derived `school_id`, `grading_policies`/
`grading_policy_periods` genuinely carry no `school_id` column (confirmed
non-tenant reference data, not merely assumed), all queries are
parameterized, `list_by_school_year` filters by `school_id` in its literal
SQL, and the schema-level `CHECK`/`UNIQUE` constraints are real and
propagate violations through `AppResult` rather than panicking or
silently succeeding.
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M11 — same standing debt as M7/M8/M9/M10.

**Verification gap, disclosed**: the usual compiled-`app.exe` relaunch
check for the new migration was attempted three times and was
inconclusive (process ran without crashing, stderr stayed empty, but
stdout log capture returned 0 bytes each time — most likely a
PowerShell/pipe-buffering artifact of force-terminating a GUI process,
not a real defect). Not treated as a blocker given the six dedicated,
passing migration-6 tests running the actual migration SQL against a
real SQLite connection — see ADR-0010 for full detail.

Not implemented (deliberately out of scope, see ADR-0010): grade
computation/weighting, a gradebook, editing/deleting a saved grading
period, Senior High School's separate semester structure, any UI for
adding a third grading policy.

## M12a Gradebook/Class Record Foundation — Complete (2026-08-24)

Goal: the workspace foundation M12b's assessment items/scores will attach
to — one section + one subject + one grading period — without
committing to a schema M13's grade-computation research will likely
force a rework of. User directed the full M12/M13/M14 roadmap in one
message; per advisor consultation before implementation, M12 was split
into phases (M12a this milestone, M12b assessment items/scores, M12c
keyboard/mobile/audit polish) rather than built as one pass. Full
decision: `docs/adr/0011-gradebook-class-record-foundation.md`.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 7: `subjects` (school-scoped
  reference data, `UNIQUE (school_id, name)`), `class_records` (joins
  `section_id`/`subject_id`/`grading_period_id`, `UNIQUE (section_id,
subject_id, grading_period_id)` — a structural no-duplicate-combination
  guard, not check-then-act).
- `src-tauri/src/repository/subject.rs`: mirrors `section.rs`'s
  `create`/`find_by_id_in_school`/`list_by_school` shape exactly.
- `src-tauri/src/repository/class_record.rs`: `create` verifies
  `section_id`/`subject_id`/`grading_period_id` all resolve within the
  caller's school, **and** that the section's `school_year` matches the
  grading period's `school_year` — `ClassRecord` stores no `school_year`
  of its own precisely so there's one source of truth, not two values
  that could drift. All four rejection reasons collapse into `Ok(None)`,
  matching `section_membership::enroll`'s established convention.
  `list_by_school` returns a joined `ClassRecordDetail` (section/subject/
  grading-period names) so a list screen needs no extra round trips.
  `grading::find_by_id_in_school` changed from private to `pub` so this
  module could reuse it.
- `src-tauri/src/commands/subject.rs`, `commands/class_record.rs`:
  `school_id` derived only from the session; `section_id`/`subject_id`/
  `grading_period_id` are client-supplied the same legitimate way
  `section_id` already is in `enroll_learner_in_section`.
- TS: `src/domain/subject.ts`, `src/domain/class-record.ts`, matching
  `domain/ports/*`, `infrastructure/tauri/*`, `application/*-service.ts`
  (all mirroring `Section`'s existing pattern), `src/ui/ClassRecordsScreen.tsx`
  (new "Class Records" tab: picking a section loads that section's own
  `school_year`'s grading periods, steering a teacher away from
  constructing a mismatched combination before submission; inline
  "add a subject" mini-form; lists existing class records).

Verified: `cargo test` 141 lib tests (includes this milestone's new
`repository::subject`/`repository::class_record` unit tests) + 5
new `tests/class_record.rs` integration tests (cross-school section/
subject/grading-period rejection, "requires a session" for both new
commands, own-school create-then-list round trip) — all green, plus 1
new `db::migrations::tests::migration_7_*` test proving the
no-duplicate-combination constraint against a real migration run.
`cargo clippy --all-targets -D warnings` clean. `npm run quality` clean
(34/34 test files, 189/189 tests — up from 168), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: `architecture-reviewer` was dispatched for this
milestone (owed since M7 — the first of that standing debt actually run
this session), but its findings text was not retrievable through the
normal completion-notification/resume path on either the initial run or
one resume-retry (real work confirmed via token/tool-use counts — 17
tool uses, ~61K tokens total — but no usable output either time). Per
this session's established escalation rule (attempt once more, then
fall back to self-review), a careful self-review covering the same four
questions was performed instead — **no blocking findings**; full detail
in `docs/adr/0011-gradebook-class-record-foundation.md`. Re-run a real
`architecture-reviewer` for M12a once agent-resume behavior is confirmed
reliably working in a future session.
`security-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M12a — same standing debt as M7-M11 for the other
three review types.

Not implemented (deliberately out of scope, see ADR-0011): assessment
components/items, learner scores, missing/not-applicable states,
keyboard-efficient entry, mobile-specific layout beyond ordinary
responsive CSS, a mutation-audit trail, editing/closing a class record,
Senior High School's separate semester structure, any multi-teacher/
co-teacher concept.

## M12b Assessment Items and Learner Scores — Complete (2026-08-24)

Goal: assessment items and learner scores on top of M12a's `ClassRecord`
workspace, continuing the user-directed M12/M13/M14 roadmap. Full
decision: `docs/adr/0012-assessment-items-and-scores.md`.

**Research finding that shaped the design**: this milestone's own inline
research (`WebSearch`/`WebFetch`) found that DepEd Order No. 8, s. 2015's
Written Work/Performance Task/Quarterly Assessment classroom-assessment
terminology has been **repealed** by DepEd Order No. 015, s. 2026, which
renames the categories to Written Works/Performance Tasks/Examinations
(the third category now comprising Summative Tests plus a Term
Examination). Triangulated across two independent secondary sources;
per-category weighting percentages were not found and are explicitly
**not** modeled here — that is M13's own research scope. Per advisor
guidance (consistent with M11's own precedent), category names are
versioned reference data, not a hardcoded enum.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 8: `assessment_category_sets`
  (versioned reference data, `is_default` structurally constrained to at
  most one row — the fourth application of the one-row-per-condition
  index pattern), `assessment_categories` (a set's ordered, named
  categories — seed data: DO 015 s. 2026 default with Written
  Works/Performance Tasks/Examinations; legacy DO 8 s. 2015 explicitly
  marked repealed in its own citation), `assessment_items`
  (school+class-record scoped, `max_score REAL NOT NULL CHECK (max_score
  > 0)`), `learner_scores`(school-scoped,`status`CHECK-paired with`score`null-ness,`UNIQUE (assessment_item_id, learner_id)`, absence of
a row meaning "not yet recorded" — the same idiom
`attendance_records` already established).
- `src-tauri/src/repository/assessment_category.rs`: reference-data
  listing, no school scoping needed (matches `grading`'s policy listing).
- `src-tauri/src/repository/assessment_item.rs`: `create` verifies
  `class_record_id` resolves in-school and `category_id` exists;
  `list_by_class_record` scopes by `school_id` AND `class_record_id`.
- `src-tauri/src/repository/learner_score.rs`: `record` verifies the
  item resolves in-school, the learner held an active section membership
  at any point in the class record's grading-period date range (via
  `section_membership::roster_for_section_over_range`, reused from M8),
  and the status/score pairing including the `[0, max_score]` bound —
  the one check that can't be a SQL `CHECK` (cross-table). Every
  rejection collapses to `Ok(None)`, matching `enroll`'s convention.
  `roster_for_item` returns the scoreable roster via `LEFT JOIN`,
  matching `attendance::roster_for_section_date`'s shape.
- `src-tauri/src/repository/class_record.rs` gained
  `section_and_period_range_in_school`, a small helper shared by
  `assessment_item`/`learner_score`.
- `src-tauri/src/auth/mod.rs` gained `SessionManager::require_active_session`
  (returns `(user_id, school_id)`; `require_active_school_scope` now
  delegates to it) so a score's `recorded_by_user_id` can come from the
  session, never a client-supplied parameter.
- `src-tauri/src/commands/{assessment_category,assessment_item,
learner_score}.rs`: `school_id`/`recorded_by_user_id` derived only from
  the session; other ids client-supplied and verified downstream.
- TS: `src/domain/{assessment,learner-score}.ts`, matching
  `domain/ports/*`, `infrastructure/tauri/*`, `application/*-service.ts`
  (score-range validation duplicated here as a `ValidationError` with a
  specific message — a UX nicety, not the real security backstop, which
  is the Rust `None`), `src/ui/ClassRecordWorkspace.tsx` (opened via a
  new "Open workspace" action added to the Class Records list: item
  creation form, item list, and a per-item roster scoring table with
  status buttons and a score input revealed only for "Scored").

Verified: `cargo test` 163 lib tests (up from 141) + 6 new
`tests/assessment.rs` integration tests (cross-school rejection for both
items and scores, "requires a session" for both new commands, an
explicit test proving a recorded score is attributed to the session's
own `user_id` and not a client-supplied one) + 3 new
`db::migrations::tests::migration_8_*` tests (seed data, default-set
uniqueness, the `scored`-requires-non-null-score `CHECK`) — all green.
`cargo clippy --all-targets -D warnings` clean. `npm run quality` clean
(39/39 test files, 221/221 tests — up from 189/34), `npm run build`
clean, `npm run check:architecture` clean.

**Independent review**: `security-reviewer` dispatched for this
milestone, chosen over `architecture-reviewer` per advisor guidance —
M12b introduces the first mutable, teacher-attributed numeric data in
this schema, closer to the auth/persistence surface that has caught real
bugs before (M4, M6, M10) than to a layering concern. Outcome not yet
returned as of this writing; record it here (or supersede this note)
once available.

Not implemented (deliberately out of scope, see ADR-0012):
keyboard-efficient entry, mobile-specific layout beyond ordinary
responsive CSS, a full mutation-history/audit log beyond
`recorded_at`/`updated_at`, editing/deleting an assessment item once
created, per-category weighting/grade computation, a UI for adding a
third category set, an FK constraining which category set pairs with
which grading policy.

## M12c Score-Entry Keyboard, Mobile, and Audit Polish — Complete (2026-08-24)

Goal: turn M12b's assessment-item/score workspace
(`src/ui/ClassRecordWorkspace.tsx`) into a reusable, production-quality
pattern for high-frequency teacher data entry — not a prettier version of
the same interaction, a genuinely faster one. UI-only change: no
application-service, domain, repository, or Rust command changes were
needed or made, since `user_id`/`school_id` were already session-derived
(verified below) and `updated_at` already existed on `learner_scores`
(M12b) for the audit-surfacing requirement.

**Before starting**: per the handoff's own instruction, checked whether
M12b's dispatched `security-reviewer` had returned. It had not (same
agent-resume issue as every other episode this session) — the standing
self-review fallback finding was: `record_learner_score`
(`src-tauri/src/commands/learner_score.rs:31-42`) takes only
`assessment_item_id`/`learner_id`/`status`/`score` as parameters;
`user_id` and `school_id` come from `sessions.require_active_session(&conn)`,
never from the client. Re-verified directly against the current file this
session (not just trusted from the prior note) — confirmed accurate, no
change needed. No new `security-reviewer` dispatch was warranted for a
UI-only milestone that touches no authorization surface.

**Keyboard-efficient entry — redesigned interaction model:**

- The score `<input>` is now always visible and always the primary
  control for every roster row, instead of being hidden behind an
  explicit "Scored" button click (M12b's original gate). Typing a number
  always means "Scored" — this matches how the domain already treated a
  non-null score (`LearnerScoreApplicationService.recordScore` requires
  `status === "scored"` for any numeric value), so no new domain rule was
  invented, only surfaced earlier in the interaction.
- **Enter** or **ArrowDown** in a score field commits the value (if
  changed) and moves focus to the next learner's score field — spreadsheet-
  style column navigation, the single highest-leverage change for a
  teacher entering many scores down one column. **ArrowUp** does the same
  moving backward. **Escape** discards an in-progress, uncommitted edit
  and restores the last-saved value, without saving — the "recovery from
  a mistake" the milestone asked for. **Blur** (Tab away, or clicking
  elsewhere) also commits, so nothing is silently lost by moving on.
- **Safe commit semantics, two deliberate rules**: (1) a value identical
  to what's already saved is never re-sent — this avoids a no-op write
  bumping `updated_at` and showing a misleading "just saved" time; (2) an
  emptied score field is never committed as a change — clearing the box
  does not erase a previously recorded score, since "blank" isn't a real
  status in this domain (Excused/N/A must be chosen explicitly via their
  own buttons). This directly satisfies "prevention of accidental
  destructive changes."
- Excused/N/A remain explicit buttons (native `<button>`, already fully
  keyboard-operable via Tab+Enter/Space, needed no new code) — DepEd's
  attendance-status precedent (`AttendanceStatus`, ADR-0008) already
  established that exceptional states need deliberate marking, not
  inference from an empty field; the same reasoning applies here.
- **A real bug was found and fixed during this milestone, by its own test
  suite**: moving focus programmatically after Enter (to the next row)
  fires a synchronous native `blur` on the field being left, which
  re-entered the same commit function for that same learner _before_ the
  first call's cleanup had run — a naive React-state dirty-check does not
  reliably catch this, because the state update from the first commit may
  not have re-rendered by the time the synchronous blur fires. Caught by
  a new test (`saves on Enter and moves focus to the next learner's score
field`) that asserted exactly one `record` call, which failed with two
  identical calls on the first implementation. Fixed with an imperative
  `useRef<Set<string>>` in-flight guard (`committingRef`) that closes the
  re-entrancy window regardless of render timing — a plain state flag
  would not have been reliable here for the same reason the dirty-check
  wasn't.

**Mobile-aware responsive layout:**

- No responsive breakpoint existed anywhere in `src/ui/theme/styles.css`
  before this milestone (verified by grep) — this is the first
  deliberately mobile-specific CSS in the app, not an extension of an
  existing pattern.
- At `max-width: 640px`, the roster `<table>` re-flows from a grid to one
  stacked, full-width block per learner (each `<tr>` becomes a card-like
  block; the `<thead>` is visually hidden but stays in the accessibility
  tree via a standard clip-rect technique, not `display:none`, so the
  column semantics survive for screen readers) — chosen over shrinking
  the desktop table's cells, which the milestone brief explicitly warned
  against ("unusably tiny score cells... shrinking the Windows interface
  onto a phone"). Score inputs and Excused/N/A buttons grow to a 44px
  minimum touch target and larger font at this width. The keyboard
  interaction model (Enter/Arrow/Escape/blur) is unchanged at any width —
  same component, same handlers, only the CSS layout changes, so there is
  one reusable pattern, not a second mobile-specific implementation.
- **Verification limit, disclosed honestly**: this environment's Browser
  pane could load the app's `vite dev` bundle (confirmed it builds and
  serves — reached the login screen, which correctly reported "Could not
  load the list of schools" since a plain browser has no Tauri IPC
  bridge) but could not render/screenshot the page (`the Browser pane is
not displayed, so the page is not compositing frames` — an environment
  limitation, not a code issue) and, even if it could, cannot reach
  `ClassRecordWorkspace` without a real backend session behind a section/
  subject/grading-period/class-record/assessment-item chain. This is the
  same standing visual-verification gap recorded since M5 — the 640px
  breakpoint's actual rendered appearance is **not** visually confirmed
  this session; only the CSS itself and the jsdom-based interaction
  behavior (which does exercise real DOM focus/blur/keyboard semantics,
  and did catch the re-entrancy bug above) were verified. `.claude/launch.json`
  was added this session (`npm run dev`, port 5173/1420) so a future
  session with a working Browser pane, or a human, can pick this up
  immediately.

**Auditability polish:**

- Each row now shows a "Saved HH:MM" note derived from the roster entry's
  existing `updatedAt` field (already returned by `roster_for_item` since
  M12b — no new column, no new command). Hidden gracefully
  (`formatSavedTime` returns `null`) rather than showing "Invalid Date"
  for any value that doesn't parse as a real timestamp.
- Actor identity (`recordedByUserId`) was already trustworthy
  (session-derived, verified above) before this milestone; this milestone
  did not add a "last edited by [teacher name]" display, since
  `LearnerScoreRosterEntry` does not currently carry a resolved teacher
  display name (only `LearnerScore.recordedByUserId`, a raw id) — adding
  that would mean a join across `users`/`learner_scores` the roster query
  doesn't currently do, which is schema/repository-layer work, not UI
  polish, and wasn't requested with enough specificity to justify
  expanding scope here. Recorded as a candidate for a future
  audit-visibility milestone, not implemented now.

**Verification actually run this session**: `npm run typecheck` clean;
`npm run lint` clean; `npm run format:check` clean (after `prettier
--write` on the three touched files); `npm run check:architecture`
clean; `npm run test` — 39 files, 226 tests, all passing (up from 221 —
one M12b test was split into six more specific interaction tests, net
+5). `cargo test`/`cargo clippy` not re-run (no Rust files touched this
milestone — confirmed via `git status` before starting and again before
finishing). Real-browser check attempted and partially completed (see
above); did not reach pixel-level confirmation.

**Independent review**: not dispatched — this milestone touches no
authorization/persistence/tenant-isolation surface (the area this
session's agent-resume issue has made expensive to keep re-attempting),
and the one security-relevant fact (actor identity) was re-verified
directly against source rather than re-reviewed. A `teacher-ux-reviewer`
pass on the new interaction model would still be genuinely valuable and
is recorded as owed below, alongside the existing M7-M11 review debt.

Not implemented (deliberately out of scope): a full mutation-history/
audit log beyond the single "last saved" note, a resolved teacher display
name on the roster (see above), bulk score entry/paste-from-spreadsheet,
column-level (all-learners-one-item) vs. row-level (one-learner-all-items)
alternate grid orientations, offline-conflict UI (two devices editing the
same score — sync doesn't exist yet), any change to the Excused/N/A
button semantics.

## M13 DepEd Grade Computation — Complete (2026-08-24, continuation session)

Goal: compute an actual numeric term grade from the assessment items/
scores M12b built, replacing the M11/M12a/M12b placeholder note that this
was deferred pending real research. **Compliance-sensitive** — research
used the primary source directly, not a secondary summary.

**Research**: `WebSearch` found a citation for DepEd Order No. 015, s.
2026 with a direct link to the order's own PDF on `deped.gov.ph`. That
PDF (`DO_s2026_015r.pdf`, 60 pages, scanned/image-based — `pypdf` text
extraction returned only whitespace, no text layer) was downloaded
(`curl`) and read by rendering pages to PNG (`pymupdf`) and visually
transcribing the specific tables in Annex D — not trusted from a
blog/aggregator summary alone, though three independent secondary
sources (depedclub.com, depedtambayanph.net, tchersden.blogspot.com) were
also checked and agreed with the primary source on every figure. Full
findings, including what's DepEd-required vs. this app's own
interpretation vs. still-uncertain, are in
`docs/adr/0013-deped-grade-computation.md` — summarized:

- `IG = Σ(PS × weight%)` per category, `PS = pooled raw scores / pooled
max scores × 100` (points-pooled, not item-averaged — confirmed against
  the Order's own worked example).
- One weight group implemented: English, Filipino, Mathematics, Science,
  Araling Panlipunan, GMRC/Values Education (Grades 4-10) — Written Works
  20%, Performance Tasks 50%, Examinations 30%. Examinations is itself
  composed of Summative Test 1 (30%), Summative Test 2 (30%), and Term
  Examination (40%) — not a flat pooled bucket like the other two
  categories.
- SY 2026-2027 uses the Order's own 41-band Adjusted Transmutation Table
  (IG 0.00-100.00 → TG 60-100); SY 2027-2028 onward uses the Zero-Based
  Grading System (`TG = round(IG)` directly, no transmutation) — selected
  from the grading period's existing `school_year` field, no new table
  needed. A floor of 60 applies to the final reported grade either way
  (structural under transmutation; an explicit clamp under zero-based).
- Two of the Order's own worked examples (Science KS2 IG 85.8→TG 88,
  transmuted; Mathematics KS3 IG 83.6→TG 84, zero-based) are reproduced
  exactly end-to-end by `compute_term_grade` — the strongest available
  proof this implementation matches the Order, not just its transcribed
  numbers.

**10-scenario architecture decision** (the one genuinely new structural
question ADR-0010's existing versioned-policy pattern didn't already
settle): how to model Examinations' internal ST1/ST2/TE sub-structure.
Ten scenarios scored against the project rubric; **Recommended and
implemented**: a nullable self-referencing `parent_category_id` on the
existing `assessment_categories` table — ST1/ST2/TE become ordinary child
category rows, reusing 100% of M12b's `assessment_item`/`assessment_category`
machinery unchanged. **Next Best**: a separate `category_components` join
table (better if a future Order nests other categories too; not needed
for what DO 015 currently specifies). Full scoring in ADR-0013.

**Implementation**:

- Migration 10: `parent_category_id` column + 3 seeded child categories
  (Summative Test 1/2, Term Examination) under "Examinations";
  `grading_weight_policies`/`grading_weight_components` tables (same
  "at most one default" unique-partial-index pattern as migrations 5, 6, 9) with one seeded policy for the implemented weight group.
- `assessment_item::create` now rejects creating an item directly under a
  parent category (one that has children) — an item must go under a leaf.
- `assessment_category::list_categories_for_set` now excludes parent
  categories from its result, so a teacher's item-creation dropdown never
  offers a selection that would be rejected.
- `src-tauri/src/repository/grading_computation.rs` (new): the full
  algorithm, the 41-band transmutation table (Rust constant data, not
  DB-seeded — a disclosed simplification, see ADR-0013), and
  `compute_term_grade(conn, school_id, class_record_id, learner_id)`.
  Returns `None` — this app's own interpretation, not DepEd's — until
  every weighted category has at least one `Scored` item for that
  learner, rather than fabricating a grade from incomplete data (matches
  `AttendanceRosterEntry`/`FieldDisclosure`'s existing "disclose, don't
  fabricate" precedent).
- New command `compute_learner_term_grade`; new TS `ComputedTermGrade`
  domain type, port method, Tauri implementation, and application-service
  method; `ClassRecordWorkspace.tsx` gained a "Show term grades" section
  (on-demand — a per-learner Tauri round trip, not recomputed
  automatically on every keystroke/item-selection) with a Guided-mode
  disclosure of exactly which weighting is in use and which subjects
  aren't yet supported.

**Two real bugs found and fixed by the tests themselves during
development** (not present in the final code, recorded because the
process is worth remembering):

1. The zero-based worked-example test fixture used the wrong max scores
   for the ST1/ST2/TE items (20/20/40 instead of the Order's own 25/20/50)
   — caught immediately because the test failed with a `None` result
   instead of the expected grade (one item's score exceeded its declared
   max and was silently rejected by the existing `learner_score::record`
   validation).
2. `LearnerScoreApplicationService.computeTermGrade` was not declared
   `async`, so its validation `throw`s were synchronous instead of
   promise rejections — the exact same bug class already documented from
   M8's `monthlySummary`, caught here the same way, by a test asserting
   `.rejects.toBeInstanceOf(ValidationError)`.
3. (Rust side) The original floor test used the SY 2026-2027 transmutation
   regime, where the table's own lowest band already floors at 60
   structurally — meaning it could never actually exercise the separate
   `apply_minimum_floor` clamp. Split into two tests, one per regime, once
   this was understood.

**Verification actually run this session**: `cargo test` — 184 lib tests

- 51 integration tests across 9 test binaries, all green (re-run twice
  after one transient/flaky failure in an unrelated pre-existing test file,
  `learner_management.rs`, which passed cleanly both in isolation and on a
  full-suite re-run — not a regression from this milestone's changes,
  confirmed by `git status` showing no learner-related files touched).
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  typecheck, lint, format, architecture-boundary check, 233 TS tests, all
  green (up from 226). Real-browser check: same standing limitation as
  M12c (no Tauri IPC bridge in a plain browser); not re-attempted this
  session since M12c already established and documented the exact gap.

**Independent review**: not dispatched. This milestone's new command
(`compute_learner_term_grade`) follows the identical authorization
pattern every existing command already uses
(`require_active_school_scope`, resolve-within-school-first) with no new
pattern introduced, so a `security-reviewer` dispatch was judged
lower-value here than for M12b's genuinely new mutation surface. A
`teacher-ux-reviewer` pass on the new "Show term grades" UI is recorded
as owed, alongside M12c's standing one.

Not implemented (deliberately out of scope, see ADR-0013's Scope
section for the full reasoning): the EPP/TLE & MAPEH weight group, any
Senior High School (Key Stage 4) weight group, GMRC/VE's internal
Cognitive/Affective/Behavioral domain split, Key Stage 1 descriptive
grading, Grade 12's DO 8, s. 2015 carryover weights (that order's exact
percentages could not be confirmed from a primary source this session),
Subject-level or class-record-level weight-group selection UI, report
cards/official grade output (M14).

## M14 Report Card / Official Grade Output — Complete (2026-08-24, same continuation session as M13)

Goal: turn M13's `ComputedTermGrade` into a file a teacher can keep or
hand to a school head, reusing M10's `export::csv`/`FieldDisclosure`
architecture. Full research/decision record in
`docs/adr/0014-report-card-export.md`.

**Scope correction made during implementation** (recorded here because
the reasoning matters, not just the outcome): the M13 session's
end-of-turn scope proposal considered gating this export to only the one
DepEd weight group M13 implements. On inspection this isn't buildable
without new scope — `Subject` carries no DepEd weight-group
classification, and `compute_term_grade` already applies the single
seeded policy uniformly to every class record, so there is nothing to
gate on. Building a `Subject`-to-weight-group mapping would itself
require guessing how this app's free-text subject names correspond to
DepEd's own categories — exactly the inference the `deped-compliance`
rule warns against. Corrected to inherit M13's own already-accepted
choice instead: disclose prominently, don't silently refuse.

**Implementation**:

- `FieldDisclosure`/`OmittedField` relocated from `export::sf2` to the
  shared `export::mod` (non-breaking — `sf2.rs` re-imports them, its own
  9 tests unchanged and still passing) — the reusable "official-form
  engine" piece `sf2.rs`'s own doc comment already anticipated a second
  export would need.
- New `src-tauri/src/export/report_card.rs`: one CSV row per learner on
  the class record's section roster (composed from
  `section_membership::roster_for_section_over_range` +
  `grading_computation::compute_term_grade`, the same composition
  `learner_score::record` already uses), an explicit "Not yet available"
  row for a learner whose grade isn't computable yet rather than a
  silent drop.
- New `class_record::find_detail_by_id_in_school` (the single-record
  counterpart to the existing `list_by_school`, same join) and
  `export_class_record_report_card` command — `class_record_id`
  client-supplied the same legitimate way `section_id` already is for
  the SF2 export; `school_id` from the session only; writes to
  `<Documents>/LIKHA-SIS/ReportCard_<section>_<subject>_<period>.csv`,
  reusing `sanitize_filename_component` (same NTFS-ADS/reserved-character
  hardening the SF2 export already has, not re-implemented).
- New TS: `ReportCardExportResult`,
  `ExportRepository.exportClassRecordReportCard`,
  `ExportApplicationService.exportClassRecordReportCard`;
  `exportService` threaded through `App.tsx` → `ClassRecordsScreen` →
  `ClassRecordWorkspace` (new prop on both). `ClassRecordWorkspace.tsx`
  gained an "Export report card (CSV)" button beside "Show term grades,"
  with an **always-visible** (not Guided-mode-only) warning that the
  export assumes core K-10 weighting for every subject — deliberately
  not gated behind Guided mode since it's correctness-affecting for
  every teacher mode.
- Also newly disclosed as omitted, more conservatively than strictly
  required by this milestone's own scope: DepEd's Qualitative Descriptor
  table (Order Table 11), since M13's research only read it at low
  resolution during the initial contact-sheet scan, not the same
  full-resolution rigor as the tables actually implemented (Tables 4, 9, 10) — omitted rather than risk exporting a wrong label.

**Verification actually run this session**: `cargo test` — 192 lib tests
(up from 184; +8 new in `export::report_card` and
`class_record::find_detail_by_id_in_school`) + 51 integration tests, all
green. `cargo clippy --all-targets -- -D warnings` clean. `npm run
quality` — typecheck, lint, format, architecture-boundary check, 239 TS
tests (up from 233; +6 new), all green. `npm run build` succeeds. Visual
verification not attempted — same standing gap as M12c/M13 (no Tauri IPC
bridge in a plain browser).

**Independent review**: not dispatched. This milestone's new command
follows the identical authorization pattern every existing
export/read command already uses, with no new pattern and no new
file-write surface beyond what `export_section_monthly_sf2` already
established and was reviewed for (CSV/formula-injection and NTFS-ADS
hardening, both reused verbatim). A `teacher-ux-reviewer` pass on the
new "Export report card" button is recorded as owed, alongside M12c's
and M13's standing ones.

Not implemented (deliberately out of scope, see ADR-0014): per-subject
gating (not currently buildable without new `Subject` schema — see
Scope Correction above), Qualitative Descriptors, Grade 12 DO 8
carryover, General Average/multi-subject aggregation, an
official-template-exact `.xlsx` reproduction, printing/PDF rendering, a
user-chosen save location.

## M15 Expand DepEd Grading Policy Coverage — Complete (2026-08-24, same continuation session as M13/M14)

Goal: close the specific architectural gap M14 identified (a class record
had no way to say which DepEd weight group applies to it — every one
silently shared whichever policy was marked default) and use the newly
explicit mechanism to add a second weight group. Full record in
`docs/adr/0015-expand-grading-policy-coverage.md`. **Note this resolves
M14's "per-subject gating not currently buildable" line above**: the fix
was not a `Subject`-level classification (still not built, still would
require guessing a subject-name-to-DepEd-group mapping) but an explicit
per-_class-record_ pin, which a teacher sets when opening the class
record — the same "explicit, not inferred" pattern already used for
`grading_period_id`/`category_set`.

No new 10-scenario process — ADR-0010/0013's versioned-reference-data
pattern already settled "how to represent a policy a teacher picks from";
this milestone applies it to a field it hadn't reached yet.

**Implementation**:

- Migration 11: `class_records.weight_policy_id` (nullable — an existing
  class record predating this migration is left `NULL`, preserving its
  exact prior "use the default" behavior rather than guessing which
  policy it should retroactively have; `class_record::create`'s new
  parameter is required for every record created since, validated to
  exist, `None` on an unknown id). A second seeded policy: EPP/TLE &
  MAPEH (20%/60%/20%, DO 015 s.2026 Table 9's second row) — reuses the
  _same_ Examinations/ST1/ST2/TE category structure migration 10 already
  seeded (no new category rows, only new weight rows against existing
  categories).
- `class_record::resolved_weight_policy_id_in_school`: the
  COALESCE-to-default lookup — the class record's own pinned policy if
  it has one, the current default otherwise. `grading_computation::compute_term_grade`
  now calls this instead of unconditionally querying `is_default = 1` —
  the one behavioral change that makes the new column matter. Proven
  with two dedicated tests, not just inspection: one confirming the
  pinned (non-default) policy is actually used, and one giving
  _identical_ raw scores to both policies and asserting the computed
  grades differ (60 under K-10's 20/50/30 vs. 70 under EPP/TLE & MAPEH's
  20/60/20, for the same inputs) — the strongest available proof the
  pinned policy is genuinely applied, not silently ignored.
- New `GradingWeightPolicy` type + `list_weight_policies`/
  `list_grading_weight_policies` (repository/command), mirroring
  `grading::list_policies`'s exact shape.
- UI: `ClassRecordsScreen`'s create form gained a required "DepEd grading
  weighting" picker, always shown (never hidden or auto-submitted),
  defaulting to the current default policy but requiring the teacher to
  see and confirm it — the create button stays disabled until a policy
  is selected, same disabled-until-complete pattern the section/subject/
  grading-period fields already use. The class-records list table gained
  a "Weighting" column. `ClassRecordWorkspace` now receives the resolved
  `weightPolicyName` from `ClassRecordsScreen` (which already holds the
  joined detail) and shows it in the term-grades section and the report-
  card export warning, replacing M14's hardcoded (and, once this
  milestone shipped, inaccurate) "assumes core K-10 weighting for every
  subject" text with the actual policy in effect plus an honest note that
  SHS/Grade 12/KS1 subjects still have no correct option in the picker at
  all.

**Correction to the record, found while scoping this milestone**:
ADR-0013 and ADR-0014 both listed "GMRC/VE's internal Cognitive/
Affective/Behavioral domain split" as an unimplemented gap affecting
grade _correctness_. Re-reading Table 9: GMRC/Values Education is already
inside the K-10 core weight group (identical 20/50/30 to English/
Filipino/Math/Science/AP) — the domain split (Table 3) is a within-item
assessment-_design_ guideline for how a teacher should distribute WWs/
PTs/EXs items across Cognitive/Affective/Behavioral aspects, not a
different weighting formula. GMRC/VE grades computed by this app have
been DepEd-compliant on the weighting front since M13; only the domain-
_tagging_ feature (marking which aspect an item addresses) remains
unimplemented, and it does not affect any grade already computed. This
correction is recorded in ADR-0015, not silently absorbed — the prior
ADRs' gap lists should be read with this correction applied.

**Verification actually run this session**: `cargo test` — 201 lib tests
(up from 192; +9: 2 migration tests, `resolved_weight_policy_id_in_school`
coverage, `list_weight_policies` + the two policy-differentiation proofs)

- 51 integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 242 TS tests (up from 239, +3),
  typecheck/lint/format/architecture-boundary all clean. `npm run build`
  succeeds.

**Independent review**: not dispatched. The new command
(`list_grading_weight_policies`) follows the identical pattern every
existing reference-data command already uses; `class_record::create`'s
new parameter is validated the same way its existing three already are.
No new authorization surface. A `teacher-ux-reviewer` pass on the new
picker/column/display text is recorded as owed, alongside M12c's,
M13's, and M14's standing ones.

Not implemented (deliberately out of scope, unchanged from ADR-0013/
0014): all Senior High School (Key Stage 4) weight groups, Key Stage 1
descriptive grading, Grade 12's DO 8 carryover (still no primary source
located), GMRC/VE's domain-tagging UI (does not affect grade
correctness — see Correction above), a `Subject`-level default-weight-
group suggestion (would require guessing a subject-name-to-DepEd-group
mapping).

## M16 SHS + Exceptional Grading Policies — Complete (2026-08-24, same continuation session as M13-M15)

Goal: per the user's directed roadmap (M15 → M16 → M17 → M18 → Roles &
Permissions, stated in one message this session), close the SHS/Key
Stage 4 weight-group gap ADR-0015 left explicitly deferred — and, in
doing so, empirically test ADR-0015's own prediction that every further
DepEd weight group would now be purely additive. Full record in
`docs/adr/0016-shs-and-exceptional-grading-policies.md`.

**Research**: no re-fetch of the primary-source PDF — Table 10 (Key
Stage 4) and Annex D paragraphs 46-47/49 were already transcribed and
verified at full resolution during M13's original reading (recorded in
that session's context and ADR-0013), and were cross-checked once more
against this session's own record before writing migration 12.

**Six weight groups, three structural shapes**:

- Full three-part Examinations (ST1/ST2/TE 30/30/40, identical shape to
  both K-10 policies): Core Subjects & Other Academic Electives
  (20/50/30), Arts/Sports/Health and Wellness Electives (20/60/20),
  TechPro Electives (15/65/20).
- Examinations present but composed of a Term Examination only (Annex D
  paragraph 46a) — no Summative Tests: Field Exposure/Arts
  Apprenticeship/Creative Production and Innovation (15/70/15). Modeled
  as a single child weight row (Term Examination at 100% within
  Examinations) instead of three; `compute_term_grade`'s existing
  "roll up whichever children a policy actually has" logic required no
  changes.
- No Examinations component at all (Annex D paragraph 46b/46c): Research
  Electives & Design and Innovation (40/60, WWs/PTs only) and Work
  Immersion (20/80, where WWs is the learner's portfolio and PTs is the
  workplace supervisor's industry evaluation — not ordinary classwork).
  Modeled by seeding no weight row for Examinations in that policy;
  `compute_term_grade`'s top-level loop simply never visits it.

Both structurally exceptional shapes are proven correct with new
end-to-end tests
(`compute_term_grade_handles_a_policy_where_examinations_is_term_examination_only`,
`compute_term_grade_handles_a_policy_with_no_examinations_component`),
not just asserted from the migration's data.

**Zero code changes outside the migration and its own tests.** No
changes to `grading_computation.rs`'s algorithm. No TS/UI changes at
all — `ClassRecordsScreen`'s weighting picker and `ClassRecordWorkspace`'s
policy-name display are already fully data-driven from
`list_grading_weight_policies`, so all eight policies (2 from M15 + 6
from this milestone) appear automatically. This is the strongest
available confirmation of ADR-0015's "purely additive" prediction — not
just that it was theoretically true, but that implementing two genuinely
different structural shapes (TE-only, no-Examinations) still required no
algorithm changes.

**Caveats disclosed in every new policy's own citation text**: DepEd
itself defers detailed SHS item-level specifications to a separate,
not-yet-obtained "implementation guidelines of the Strengthened SHS
Curriculum" issuance (Annex D paragraph 47) — the weight percentages are
DepEd's own stated figures, not a guess, but the guidance behind
applying them item-by-item is incomplete. These six policies apply to
Grade 11 and to Grade 12 only once it adopts the Strengthened SHS
Curriculum (Annex D paragraph 49) — Grade 12 under the prior curriculum
still needs DO 8, s. 2015 weights, still unimplemented, still no primary
source located.

**Verification actually run this session**: `cargo test` — 208 lib tests
(up from 201; +7: 4 new migration tests, 3 new `grading_computation`
end-to-end tests) + 51 integration tests, all green. `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` — 242 TS tests
(unchanged from M15 — confirms zero TS/UI impact), typecheck/lint/
format/architecture-boundary all clean. `npm run build` succeeds.

**Independent review**: not dispatched. Purely additive seed data
against an already-reviewed schema and algorithm (M13/M15); no new
command, no new authorization surface, no new TS/UI code path to review.

Not implemented (deliberately out of scope, unchanged from ADR-0013/
0015): Key Stage 1 descriptive grading (a structurally different
computation — rubric evidence, not weighted numeric scores — explicitly
deferred by the user's own roadmap, not folded into M16), Grade 12's DO
8, s. 2015 carryover (still no primary source located), GMRC/VE's
domain-tagging UI (does not affect grade correctness — see ADR-0015's
correction), a `Subject`-level default-weight-group suggestion (a
teacher must still pick explicitly for SHS subjects, same as every other
policy).

## M17 Learner Profile Enrichment (LRN + Sex only) — Complete (2026-08-24, same continuation session as M13-M16)

Goal: per the user's directed roadmap, "M17 — Learner Profile Enrichment,
when required by report cards/forms." First milestone run under
Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`) — no fresh user pick was
requested for scope inside M17, only evidence-based judgment against the
qualifier already given. Full record in
`docs/adr/0017-learner-reference-number-and-sex.md`.

**Scoping check, done before any schema change**: this app's own
already-shipped exports were checked for what they actually disclose as
missing. `export::report_card` (M14) discloses five gaps, none of them a
learner-profile field. `export::sf2` (M10) discloses one profile-shaped
gap, bundled into dropout/transfer statistics ("does not track learner
gender... at all"). Neither export had ever named LRN, birthdate, or
guardian contact as missing before this milestone — so the "when
required" qualifier did not automatically select the original M9-era
field list, and building that full list would have been unverified PII
expansion.

**Research**: two independent secondary sources per field (the bar
already established by M10 for SF2's own field layout, since the primary
DepEd Order PDFs were not available as machine-readable text this
session): SF2's per-learner roster requires LRN and Sex (teacherph.com's
template walkthrough + ilovedeped.net's independent guide, in agreement);
the SF9-style report card header requires LRN (openeducat.org's SF9
field inventory). Birthdate and guardian contact were checked against
the same sources and found in neither — deliberately not added.

**Decision**: add exactly `learners.lrn` (12-digit, DB `CHECK`-enforced,
partial-unique per school) and `learners.sex` ('M'/'F', DB `CHECK`-
enforced) via migration 13, both nullable — no honest default exists for
either. No new architecture decision (extends the established
"add-a-nullable-column" shape, same as M15's `weight_policy_id`).
`SectionRosterMember`/`MonthlyLearnerAttendance` both carry the new
fields through the existing roster queries so both exports can populate
them without a second query. `export::sf2` now renders LRN/Sex columns
and corrected its stale "does not track gender at all" disclosure text
(Sex is now tracked; only dropout/transfer _events_ and their by-sex
breakdown remain untracked). `export::report_card` now renders an LRN
column. `LearnerApplicationService` validates LRN format
(`/^\d{12}$/`) before calling the repository — this app can verify LRN
_shape_, never real-world correctness. `LearnerListScreen`'s enrollment
form gained optional LRN/Sex fields with a Guided-mode hint.

**Verification actually run this session**: `cargo test` — 217 lib tests
(up from 208; +9: 6 new migration tests, 3 new `learner.rs` repository
tests) + 51 integration tests, all green. `cargo clippy --all-targets --
-D warnings` clean. `npm run quality` — 249 TS tests (up from 242),
typecheck/lint/format/architecture-boundary all clean. `npm run build`
succeeds.

**Independent review**: not dispatched — no new authorization surface or
command pattern (`create_learner`/`update_learner` already existed, only
their parameter lists grew). Because LRN/Sex are new PII fields, an
inline security self-check was still performed: confirmed every new
field still resolves `school_id` only from `require_active_school_scope`,
confirmed the format `CHECK` constraints are enforced by SQLite itself
(not just the TS validation layer, which a compromised or bypassed
frontend could not evade), and confirmed no LRN/Sex value is logged,
echoed in an error, or placed in a URL/query string anywhere touched.

Not implemented (deliberately out of scope, disclosed not overlooked):
birthdate and guardian contact (no shipped export names either as
missing — revisit only if a future export's own disclosure does); a
`LearnerListScreen` edit affordance for an _existing_ learner's LRN/Sex
(`updateProfile`/`updateLearnerProfile` plumbing exists and is tested,
just unused by any screen — a learner enrolled before this migration has
no way to gain the fields until such a screen exists).

## M18 Bulk Attendance / Teacher Productivity — Complete (2026-08-24, same continuation session as M13-M17)

Goal: per the user's directed roadmap, "M18 — Bulk Attendance / Teacher
Productivity." First milestone continued fully autonomously under
Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`) — no fresh user instruction
was given between M17's completion and M18's start. Directly closes the
concrete example `docs/PROGRESS-MAP.md`'s own Out of Scope list had
already named: "bulk attendance actions (e.g. 'mark all present')." Full
record in `docs/adr/0018-bulk-attendance-mark-all-present.md`.

**Scoping check, done before implementing**: verified whether an
unmarked attendance day already behaves like Present anywhere in this
app, since if so the feature might be purely cosmetic.
`export::sf2::status_code` renders `None` and `Some(Present)` identically
(blank), and the SF2 export only prints Absent/Tardy totals, never a
Present total — so an unmarked day is already indistinguishable from a
marked-Present day in every export this app produces. The feature's real
value is therefore auditability (a `recorded_at` timestamp proving a
day was actually checked, not silently defaulted), and raw teacher
productivity (not clicking "Present" once per learner every day) — not
a DepEd-compliance fix.

**Decision**: `repository::attendance::bulk_mark_present` marks every
roster learner who does **not** already have a status for the date as
Present, and leaves any already-marked learner (Present, Absent, or
Tardy) untouched — a safety guarantee proven by a dedicated test
(`bulk_mark_present_does_not_overwrite_an_already_marked_learner`), not
just claimed. This matters because a teacher who already flagged one
absence before clicking "Mark all present" must never have that
overwritten back to Present. Implemented by reusing `record()` (the
same isolation-checked write every individual mark already goes
through) and `roster_for_section_date` (the same read the screen already
uses) — no new query pattern, no new architecture decision.
`AttendanceScreen` gained a "Mark all present" button, disabled once
every roster row already has a mark, with a Guided-mode hint stating the
never-overwrites guarantee explicitly (a teacher should not have to
trust that silently next to a button that writes for the whole class at
once) and a confirmation banner distinguishing "marked N learners" from
"everyone already had a mark — nothing changed."

**Verification actually run this session**: `cargo test` — 220 lib tests
(up from 217; +3: `bulk_mark_present_marks_every_unmarked_learner_present`,
`bulk_mark_present_does_not_overwrite_an_already_marked_learner`,
`bulk_mark_present_does_not_mark_a_learner_outside_the_callers_school`)

- 54 integration tests (up from 51; +3, mirroring the existing
  `record_attendance`/`roster_for_date` isolation coverage pattern
  exactly), all green. One `authorize_school_membership_grant_allows_a_session_scoped_to_the_same_school`
  failure appeared under full-suite parallel execution; passed both in
  isolation and on an immediate full-suite rerun, matching the transient
  flakiness class already documented in `docs/PROJECT-MEMORY.md`'s M12b
  note — confirmed not a regression from this change, not just assumed.
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  256 TS tests (up from 249), typecheck/lint/format/architecture-boundary
  all clean. `npm run build` succeeds.

**Independent review**: not dispatched. No new authorization surface
(`bulk_mark_attendance_present` follows the identical session-derived-
scope pattern as every existing attendance command) and no new write
path (`record()` itself was already reviewed via M7's `security-reviewer`
episode).

**Visual verification**: not attempted, same standing gap as every UI
milestone since M5/M12c — this environment has no browser/screenshot
tool for the compiled native Tauri app, and a plain `vite dev` browser
preview has no Tauri IPC bridge and cannot reach an authenticated
screen. `npm run build` confirms the bundle compiles; the button's
actual rendered appearance is not visually confirmed.

Not implemented (deliberately out of scope): a bulk action for
Absent/Tardy (no teacher-workflow justification made for it the way
"assume present, flag exceptions" has — a wrong-status bulk action is a
much larger footgun without an offsetting case); full section-roster
management UI, bulk enrollment (unrelated to attendance marking itself).

## Account Lockout After Failed Logins — Complete (2026-08-24, same continuation session as M13-M18)

Goal: the first milestone selected entirely autonomously under
Autonomous Continuous Development Mode, once Roles & Permissions was
asked about directly and resolved as "deferred, not built." Selected
from `docs/product/M8-DECISION.md`'s own pre-existing 20-scenario
candidate list (scenario #12, Security-first, ~5.8) — not disqualified
from autonomous selection the way Roles & Permissions was, since a
lockout threshold/duration is a standard security-engineering default
(OWASP's Authentication Cheat Sheet), not an organizational policy only
the user can set. Full record in `docs/adr/0019-account-lockout.md`.

**Gap confirmed before implementing**: `auth::login` had zero
brute-force mitigation beyond Argon2id's own hashing cost. Given this
app's own documented deployment model (shared school computers,
multiple teacher accounts, no 1:1 Windows-account assumption —
ADR-0004), a colleague/student at the same physical machine repeatedly
guessing a coworker's password is a real local threat this schema had
no defense against.

**Decision**: migration 14 adds `users.failed_login_attempts`/
`users.locked_until`. `repository::user::verify_credentials` now checks
lockout state before password verification for a known username (never
for an unknown one — that path is completely untouched), locks after 5
wrong attempts for 15 minutes with immediate feedback on the triggering
attempt (not a delayed reveal on the next attempt), and resets the
counter on any successful login. A locked account is rejected without
running Argon2id at all. New `AppError::AccountLocked` variant,
serialized to the same generic-category-only convention as every other
variant. `LoginScreen` shows a distinct, specific message for this case
rather than folding it into the generic failure text.

**A disclosed trade-off, not an oversight**: once locked, the response
does reveal the username exists (distinguishable from
`AuthenticationFailed`) — but only after 5 wrong guesses already
targeted at that specific username, a real cost paid first. This exact
trade-off exists in effectively every real lockout system; recorded
explicitly in code comments and ADR-0019 rather than left implicit.

**Verification actually run this session**: `cargo test` — 226 lib
tests (up from 220; +6 new `repository::user` tests covering
lock-after-threshold, locked-rejects-even-correct-password,
successful-login-resets-counter, unknown-username-never-locks,
lock-expires-and-a-fresh-attempt-succeeds; +1 new migration test) + 54
integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 262 TS tests (up from 259; +3,
including a new `LoginScreen` test asserting the lockout message is
visibly distinct from the generic one), typecheck/lint/format/
architecture-boundary all clean. `npm run build` succeeds.

**Independent review**: dispatched, but findings not retrievable — see
"Independent-review agent-resume issue recurred" in
`docs/CURRENT-HANDOFF.md`'s Status section. A careful self-review was
performed instead (full checklist in ADR-0019's Consequences section):
confirmed lockout check precedes password verification, confirmed the
unknown-username path is byte-for-byte unchanged, confirmed lockout
state lives in the persisted `users` table (not `SessionManager`'s
in-memory state, so it survives a process restart as a lockout must
to be meaningful).

**Same-session side effect**: while self-reviewing the M12c-M18 UI
(after the same agent-resume issue affected the two reviewers
dispatched specifically for that sweep), found and fixed two real,
unrelated UX/accessibility gaps in `LearnerListScreen.tsx`'s M17/
this-session edit affordance: no focus management when entering edit
mode (focus silently fell to the document body), and clicking "Edit" on
a second learner while a first edit was in progress silently discarded
the first learner's unsaved changes. Both fixed and covered by new
tests; full detail in ADR-0019's addendum. **The broader M12c-M18 UI
sweep those two reviewers were asked to cover remains real,
undischarged review debt** — the self-review only caught what it
happened to touch while implementing something else, not a systematic
pass over the full UI surface.

Not implemented (deliberately out of scope): idle-timeout/session
hardening (a related but distinct candidate from the same
20-scenario list — a fixed-TTL session already exists per ADR-0004;
idle tracking is a separate change), an admin "unlock early"
affordance (no roles/permissions system exists yet to define who
"admin" is), a configurable threshold/duration (no evidence yet that
different schools need different policies).

## Out of Scope (current milestones)

- cloud sync
- roles/permissions beyond "session scoped to a school" — requires a
  human product decision on what roles exist (see `docs/product/M8-DECISION.md`)
- password reset, account lockout, idle-timeout, cloud authentication
- grade computation for any weight group beyond the eight M13/M15/M16
  implemented (core K-10 English/Filipino/Math/Science/AP/GMRC, EPP/TLE
  & MAPEH, and all six Senior High School groups) — Key Stage 1
  descriptive grading and Grade 12's DO 8 s. 2015 carryover are still
  unimplemented; see
  `docs/adr/0016-shs-and-exceptional-grading-policies.md`. GMRC/VE's
  Cognitive/Affective/Behavioral domain _tagging_ (not its weighting,
  which is already correct — see ADR-0015's correction) is also still
  unimplemented.
- a full mutation-history/audit log beyond "last saved HH:MM",
  editing/deleting an assessment item, Senior High School's separate
  semester structure as it applies to assessment — see
  `docs/adr/0012-assessment-items-and-scores.md`. Keyboard-efficient entry
  and mobile-aware responsive layout for score entry **are** now done —
  see M12c above.
- full section-roster management UI (removing/editing a membership,
  viewing a section's roster as its own screen), bulk enrollment. "Mark
  all present" **is** now done (M18) — see
  `docs/adr/0018-bulk-attendance-mark-all-present.md`; a bulk action for
  Absent/Tardy remains out of scope, deliberately (no teacher-workflow
  justification made for it yet).
- learner profile enrichment beyond LRN/Sex (birthdate, guardian
  contact) — M17 added exactly LRN and Sex, the two fields this app's
  shipped exports actually need (see
  `docs/adr/0017-learner-reference-number-and-sex.md`); birthdate/
  guardian remain out of scope until a shipped export discloses either
  as missing. Also out of scope: a UI affordance to add LRN/Sex to a
  learner enrolled before M17 (the repository/service plumbing exists,
  no screen calls it yet).
- Excel/PDF export, a user-chosen export save location, a generic
  form-definition framework — see `docs/adr/0009-sf2-export-and-official-form-engine.md`
- editing/deleting a saved grading period, a third grading policy beyond
  the two seeded ones, Senior High School's separate semester structure
  — see `docs/adr/0010-grading-period-foundation.md`
- Android-specific workflows
