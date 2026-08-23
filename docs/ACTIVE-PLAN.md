# ACTIVE PLAN

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

## Out of Scope (current milestones)

- cloud sync
- roles/permissions beyond "session scoped to a school"
- password reset, account lockout, idle-timeout, cloud authentication
- attendance, grading, school forms (beyond the M5 learner slice)
- Android-specific workflows
