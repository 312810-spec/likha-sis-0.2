# CURRENT HANDOFF

## Active Task (2026-08-25, this session)

**UX-03 — Daily Attendance + Monthly Attendance Summary Polish — ◐ In
Progress.** Baseline SHA `f02bce5`. Full checklist in
`docs/ACTIVE-PLAN.md`'s "UX-03" section; decisions in
`docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`. Fixing
three confirmed correctness defects found by direct code inspection
before implementation (stale context after a failed section/date/month
change; overlapping same-learner writes with no ordering guard;
"Mark all present" not serialized against concurrent individual
writes), then the hierarchy/keyboard/mobile/legend/transition polish
work the milestone brief specifies. Working on branch
`claude/likha-sis-ux03-plan-plv80c` per this session's harness
assignment, not `origin/main` directly.

**Naming note**: verified this session (grep across the whole repo,
case-insensitive) that no "LIKHA-SIS 2.0"/"LIKHA SIS 2.0" naming errors
exist anywhere in the repository — the product has always been recorded
correctly as **LIKHA-SIS 0.2** in every durable document. Nothing to
correct.

## Account-Transition Note (2026-08-25)

This session is at ~97% of its weekly usage limit and is handing off to
a fresh Claude Code account/session. **Verified remote state at
handoff**: branch `main`, local and `origin/main` both at `14e7e5d`
(confirmed via `git fetch origin` + `git log`/`git status --short
--branch`; clean working tree apart from long-standing harmless 0-byte
junk files — `(String`, `ComputedTermGrade`, `MonthlyAttendanceReport`,
`src-tauri/MonthlyAttendanceReport`, `button`, `repomix-output.xml` —
untracked, not real changes; leave them as-is). **UX-02 is complete**,
not in progress — a handoff request received mid-session assumed the
remote HEAD was still at `2418099` (UX-02's start commit), which was
already three commits stale by the time it arrived; see
`docs/PROJECT-MEMORY.md`'s "UX-02 Complete; Account-Transition
Verification Note" entry for the full correction. **First action for
the next account: read this file, `docs/ACTIVE-PLAN.md`, and
`docs/PROGRESS-MAP.md`, verify the current remote HEAD for real via
`git fetch origin` before trusting any SHA stated in a prompt, then
begin UX-03 — Daily Attendance + Monthly Summary** (queued, not
started — see `docs/PROGRESS-MAP.md`'s UI-First Tranche table). Keep
the Browser pane visible for real screenshot verification, per the same
contract UX-01/UX-02 used. Impeccable remains project-local and
hook-free — do not enable or modify its hook. Preserve the
`src/dev-preview/` synthetic-fixture safety architecture (isolated
entry point, throw-guards, two automated isolation proofs) rather than
rebuilding it for future UX milestones.

**Durable future direction recorded this session** (not yet
actionable): after UX-00 through UX-08 all complete, run an
evidence-based reassessment and begin a Forms, UI, and Interaction
Deepening Program focused on making real teacher workflows easier,
faster, safer, and more pleasant — full scope and exclusions recorded
in `docs/PROJECT-MEMORY.md`'s "Post-UX-08 Direction" entry. This does
not change UX-03's scope or start any new milestone numbering now.

## Active Task (2026-08-25)

**UX-02 — Teacher Workspace Polish — complete.** Start SHA `826bf7d`
(UX-01's completion commit). See `docs/adr/0032-teacher-workspace-polish.md`
for full decisions and verification record. Built the safety-hardened
dev-only visual fixture (`src/dev-preview/`) as the first slice, then
redesigned `TeacherWorkspaceScreen` into a three-level hierarchy
(priority-ranked "Today's attendance" rail with direct one-click
actions, compact overview line, quiet recent-activity list), split
resilient data loading (a failure on either the overview or activity
path never erases the other's already-loaded content — verified
symmetric in both directions), and section preselection into
Attendance. `npm run quality` 352/352, real browser-rendered visual
verification performed across 3 viewports/2 color schemes/3 teacher
modes via the fixture. **Next queued milestone: UX-03 — Daily
Attendance + Monthly Summary** (not yet started).

**Previously completed**: UX-01 — Design Tokens, Shared Components, and
App Shell (start `cb644ef`, completion `826bf7d`) — see
`docs/adr/0031-design-system-and-app-shell.md`. UX-00 (start `603863b`,
completion `fcf26ca`) — see `docs/adr/0030-ui-first-program-and-ux00.md`.
`PRODUCT.md` and `DESIGN.md` exist at the repo root.

## Status

**Proptest pilot on the account-lockout invariant — complete
(2026-08-25)**, fourth pick from the post-sequence scoring pass (score
4.85, see `docs/adr/0029-proptest-lockout-pilot.md`). Resumes
Compounding Engineering's own deferred Phase B: two property tests in
`repository::user`'s `lockout_properties` module generalize the
existing example-based lockout tests into real invariants — lock state
exactly matches the threshold for any attempt count, and an unknown
username never locks regardless of content or attempt count. Kept to 8
cases per property (proptest's default is 256) since every case runs
real, deliberately-expensive Argon2id verification, not a mocked
lighter one — measured ~20-25s combined, not assumed. `cargo nextest
run` 312/312 (up from 310), `cargo clippy -D warnings` clean, plain
`cargo test` (the stable-checkpoint gate) also green with 0 doctest
failures. `cargo deny check` unavailable on this machine's PATH this
session — same disclosed per-machine gap noted in prior sessions, not
new. No independent-review dispatch — reasoning in the ADR (dev-
dependency-only test code, no production-code or authorization-surface
change).

**Teacher Workspace: currently-open grading period per section —
complete (2026-08-25)**, third pick from the post-sequence scoring pass
(score 5.70, see `docs/adr/0028-workspace-grading-period-status.md`).
Closes the deliberate gap ADR-0024 disclosed: each section on the
Workspace screen now shows its own currently-open grading period (e.g.
"1st Term is open") or "no grading period currently open," resolved per
section's own school year — no new Rust command, purely a frontend join
of `listSections()` and `listPeriodsBySchoolYear()`, both already used
elsewhere. `npm run quality` 316 TS tests (up from 313) green,
typecheck/lint/format/architecture clean; `npm run build` succeeds;
`npx knip` shows the same 5 pre-existing findings, zero new; no Rust
change. No independent-review dispatch — self-review only, reasoning in
the ADR (re-dispatching immediately after two failed retrieval attempts
this session wasn't a good use of the review budget for a small,
read-only, no-new-authorization-surface change).

**M12c-M26 UI review pass — complete (2026-08-25)**: both
teacher-ux-reviewer and accessibility-reviewer were dispatched, and both
attempted and failed to return retrievable findings (the same recurring
agent-resume issue documented since M7) — one resume attempt each, per
the established escalation rule, before falling back to self-review.
The two self-reviews together found and fixed two real gaps: (1) raw
ISO timestamps shown to teachers in `AuditLogScreen`/
`TeacherWorkspaceScreen`; (2) `IdleTimeoutWarning`'s `role="alertdialog"`
overclaiming modal semantics it doesn't have, fixed to `role="alert"`.
Full detail: `docs/adr/0027-audit-timestamp-readability-fix.md`. Real,
non-self review debt for this UI sweep remains open — see "Next Action"
below.

**Idle-Timeout Warning Before Logout — complete (2026-08-25)**, second
pick from the post-sequence evidence-based scoring pass (score 6.30 —
see `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` and
`docs/adr/0026-idle-timeout-warning.md`). Closes the disclosed gap
ADR-0020 left: a teacher's session now warns 2 minutes before ADR-0020's
30-minute idle timeout, with a one-click "Stay signed in" button, instead
of silently expiring on the next click. `CurrentSession` gained
`idleExpiresAtUnixMs` (a pure peek — computed, never itself slides the
idle window); a new `extend_session` command lets a teacher explicitly
renew without needing to navigate anywhere; the new
`IdleTimeoutWarning.tsx` component polls the peek every 30 seconds and
shares the same "return to sign-in with a clear reason" path
(`onExpired`) ADR-0022's `onSessionExpired` handler already uses. `cargo
nextest run` 310/310 (up from 308), `cargo clippy -D warnings` clean;
`npm run quality` 310 TS tests (up from 302) green, typecheck/lint/
format/architecture clean; `npm run build` succeeds; `npx knip` shows
the same 5 pre-existing findings, zero new. Browser-pane visual
verification attempted and unavailable this session (navigation denied
even on retry) — disclosed, not glossed over, same standing gap since
M5/M12c. No independent-review dispatch (standing agent-resume note
below); self-review performed instead, full checklist in ADR-0026.

**Learner Roster CSV Export — complete (2026-08-25)**, selected by a
fresh evidence-based 20-scenario-style scoring pass run after the
user-directed sequence's own "reassess" checkpoint (see
`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for the full
scoring table, and `docs/adr/0025-learner-roster-export.md` for the
implementation). Closes item #15 ("data export/backup") from
`docs/product/M8-DECISION.md`'s original candidate list — deliberately
scoped to a CSV export of already-visible learner data (Given Name,
Family Name, LRN, Sex, Enrolled On) via a new "Export learner list
(CSV)" button on `LearnerListScreen`, reusing M10/M14's `export::csv`/
`FieldDisclosure` architecture exactly. **Not** a raw database/
encryption-key backup — that interpretation was considered and
deliberately rejected this pass as its own unresolved security design
question (SQLCipher's key is DPAPI machine/user-bound; see the ADR's
"Decision" section). `cargo nextest run` 308/308 (up from 305), `cargo
clippy -D warnings` clean; `npm run quality` 302 TS tests (up from 295)
green, typecheck/lint/format/architecture clean; `npm run build`
succeeds; `npx knip` shows the same 5 pre-existing findings, zero new.
No independent-review dispatch (standing agent-resume note below);
self-review performed instead, full checklist in ADR-0025.

**Teacher Workspace / home screen — complete (2026-08-25)**, fourth and
final named item in the user-directed sequence. See
`docs/adr/0024-teacher-workspace.md`. `TeacherWorkspaceScreen.tsx` is
now the default landing tab after sign-in — a greeting, learner/section
counts, today's attendance-marking status per section ("not yet marked
today" / "N of M marked" / "all M marked," the single most useful
at-a-glance fact for a teacher's morning), and recent sign-in activity
(reusing the audit log from earlier this session). Built entirely from
data other screens already fetch — no new Rust command, no new
migration. Deliberately did not attempt showing "currently open grading
period(s)": correctly resolving that per section would need a
non-trivial school-year-aware join this session had no evidence was
worth building yet — recorded as a real, deliberate gap. `npm run
quality` 295 TS tests (up from 286) green, typecheck/lint/format/
architecture clean; `npm run build` succeeds; `npx knip` shows the same
5 pre-existing findings, zero new (confirms the wiring is real); no
Rust change. No independent-review dispatch (standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0024.

**This closes the user-directed sequence (Audit Log → Global Session
Expiry Handling → Learner Search → Teacher Workspace → reassess).**
Per the user's own instruction, the next step is to reassess rather
than autonomously picking a fifth item — see "Next Action" below.

**Learner Search / filter for large rosters — complete (2026-08-25)**,
third item in the user-directed sequence. See
`docs/adr/0023-learner-search.md`. A client-side search box above
`LearnerListScreen`'s roster filters by given name, family name, or LRN
— case-insensitive substring match, no new backend query (M17's own
test already proves the data layer stays correct at 500 rows, so this
is purely a UI filtering problem). Three deliberate small choices: the
search box only appears once a learner exists, "no matches" is a
distinct message from "no learners enrolled yet," and the search box
disables while an edit is in progress (so it can never filter the
row being edited out of view, leaving the edit orphaned). `npm run
quality` 286 TS tests (up from 280) green, typecheck/lint/format/
architecture clean; `npm run build` succeeds; no Rust change. No
independent-review dispatch (standing agent-resume note below);
self-review performed instead, full checklist in ADR-0023.

**Global Session Expiry Handling — complete (2026-08-25)**, second item
in the user-directed sequence (Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess). See
`docs/adr/0022-global-session-expiry-handling.md`. Closed the exact gap
ADR-0020 flagged: every screen used to fail its own in-flight request
with a generic error when a session expired for any reason (idle,
absolute TTL, revocation) — a teacher had no idea why. A centralized
`invoke` wrapper (`src/infrastructure/tauri/invoke.ts`, all 13
repository files now import through it) notices any `Unauthorized`
rejection (except `login`'s own, a different, already-handled case) and
returns the app to `LoginScreen` with a clear "Your session has expired.
Please sign in again." banner. A real bug was caught mid-implementation
by the test suite itself: the wrapper's first draft always forwarded
`args` even as `undefined`, an observably different call shape than
omitting it, breaking 12 existing tests — fixed and recorded as a
durable lesson (`docs/learning/ERROR-PATTERNS.md`). `npm run quality`
280 TS tests (up from 271) green, typecheck/lint/format/architecture
clean; `npm run build` succeeds; `npx knip` shows no new dead code
(confirms the wiring is real); `cargo nextest run` 299/299 unaffected
(TS-only change). No independent-review dispatch (standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0022.

**Audit Log (authentication events) — complete (2026-08-25)**, first
item in the user-directed sequence: Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess. See
`docs/adr/0021-authentication-audit-log.md`. Scoped tightly to
authentication events only (`login_success`/`login_failed`/
`account_locked`/`logout`) — not a general data-mutation trail, a
separate future milestone. Migration 15 (`audit_log` table),
`repository::audit_log` (`record`/`list_for_school`),
`auth::login`/`auth::logout` instrumented to record every real outcome,
`commands::auth::list_audit_log` (session-scoped, 200-row cap, same
convention as every other command), and a new "Sign-in Activity" tab
(`AuditLogScreen.tsx`). A real ordering bug was caught by a genuine test
failure during development (millisecond-precision `created_at` ties
among rows written in the same test), fixed with `id DESC` as a
UUIDv7-based tiebreaker — not assumed correct, verified. `cargo nextest
run` 299/299 green (up from 288), `cargo clippy -D warnings` clean;
`npm run quality` 271 TS tests (up from 262) green; `npm run build`
succeeds. No independent-review dispatch (same standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0021.

**Compounding Engineering tooling pass complete (2026-08-25)** — see
`docs/product/COMPOUNDING-ENGINEERING-DECISION.md` for the full
20-scenario evaluation of a large external-tooling shortlist (Nextest,
cargo-mutants, proptest, Impeccable, Playwright/native-UI-regression,
Ponytail, Compound Engineering plugin, awesome-llm-apps components,
Beads, Serena, SQLCipher/key-storage, and more). Followed the directing
prompt's own phasing discipline strictly: executed only Phase A
(low-risk productivity, no architecture change, no hooks) this session,
deferred the rest with documented resumption criteria rather than
rushing a partial attempt at everything. **Adopted**: `cargo-nextest`
(measured ~26% faster than `cargo test` on this crate's suite, 17.5s →
13.0s post-build — fast inner loop; `cargo test` remains the
stable-checkpoint command since nextest skips doctests, of which this
crate currently has zero); `knip` v6.32.2 (ran against the real project
first per "investigate first" — found 2 genuine unused exports + 3
unused exported types, wired as `npm run check:deadcode`, deliberately
**not** in the blocking `quality` gate since findings need human
triage). **Adapted as project-local skills** (not plugins):
`.claude/skills/scope-drift-review/` (Ponytail + Scope Creep Detector
concepts) and `.claude/skills/commit-archaeology/` (git/ADR-history
research method before touching unfamiliar old code). **Started**
`docs/learning/ERROR-PATTERNS.md` — a small, deliberately non-transcript
registry of generalized lessons, each pointing at its real prevention
(a test, a constraint, an ADR) rather than duplicating detail.
Confirmed already-adopted: cargo-deny, gitleaks (2026-08-24), SQLCipher

- Windows DPAPI key protection (ADR-0003) — the directing prompt's
  Production PII Security Track item was already substantially resolved,
  not a gap. **A real bug was found and fixed by simply running actual
  verification**: `AttendanceScreen.test.tsx`/`MonthlySummaryScreen.test.tsx`
  each inject a fixed clock into their service but not into the
  component's own `new Date()` call, so the two "today"s silently drifted
  apart when the real date advanced mid-session — 3 tests failed, root-
  caused, fixed with `vi.useFakeTimers`/`vi.setSystemTime` in both files,
  and recorded as a durable lesson (not just patched and forgotten). `cargo
nextest run` 283/283 passing, `npm run quality` 262/262 passing, `npm
run build` succeeds — all actually run this session, not assumed.
  Security tooling (gitleaks/cargo-deny/osv-scanner) confirmed missing
  from this machine's `PATH` again (same disclosed per-machine gap as the
  2026-08-24 note below) — not fixed, out of scope for this pass.

**Operating mode (2026-08-24): Autonomous Continuous Development.** See
`.claude/rules/autonomous-development.md` for the full rule. Milestone
completion is a checkpoint, not a stopping point — verify, record,
autonomously select the next highest-value work, and continue. Stop only
for a genuine human approval gate or a session/context boundary, both
defined in that rule. This supersedes any older text below implying
"stop and ask which milestone is next."

**Roadmap directed by the user (2026-08-24)**: M15 (mainstream K-10
grading-policy coverage) → M16 (SHS + exceptional grading policies) →
M17 (Learner Profile Enrichment, when required by report cards/forms) →
M18 (Bulk Attendance / Teacher Productivity) → Roles & Permissions once
the needed human product decisions are settled. This supersedes the
prior "no milestone pre-selected, pick a candidate" note — M16 is next
after M15, not an open choice. **Roadmap now complete**: Roles &
Permissions was asked about directly and resolved as "deferred, not
built" (see `docs/product/M8-DECISION.md`'s follow-up section) — the
user then confirmed (2026-08-24) that for any future recommended-vs-
alternatives decision, Claude should pick the recommended option
automatically and continue, rather than pausing to ask, with the user
reviewing/adjusting afterward. Work since then is autonomously selected
from `docs/product/M8-DECISION.md`'s existing 20-scenario candidate
list and current evidence, per `.claude/rules/autonomous-development.md`.

**The `Stop` hook that echoed a verification reminder as a stopping
point was removed (2026-08-24)**, per explicit user instruction. It
lived in `.claude/settings.json`'s `hooks.Stop` array; deleted entirely.
The substantive rule it existed to enforce — never claim complete
without the checks actually having run — is unaffected and still lives,
non-blocking, in `.claude/skills/completion-verification/SKILL.md`.
Confirmed via direct file read: the JSON is well-formed and no `Stop`
key remains in `hooks`. (One intermediate manual edit briefly left the
file with invalid JSON — missing closing braces and a trailing comma;
caught and fixed before continuing.) No other hook (SessionStart,
PreToolUse, PostToolUse, PreCompact, SubagentStop) was touched.

**Account Lockout After Failed Logins is complete (2026-08-24, same
continuation session as M13-M18)** — see
`docs/adr/0019-account-lockout.md`. Autonomously selected: this was
already scenario #12 in `docs/product/M8-DECISION.md`'s original
20-scenario scoring (Security-first, ~5.8) and — unlike Roles &
Permissions — is not disqualified from autonomous selection, since a
lockout threshold/duration is a standard security-engineering default
(OWASP), not an organizational policy only the user can set. Closes a
real, previously-undefended gap: `auth::login` had no brute-force
mitigation at all, and this app's own documented deployment model
(shared school computers, multiple teacher accounts) makes local
password-guessing a real threat, not hypothetical. Five wrong passwords
against one known username locks it for 15 minutes, with immediate
feedback on the triggering attempt; a locked account rejects even the
correct password without running Argon2id at all (saves CPU on an
attempt that can't succeed); a successful login resets the counter; an
unknown username is completely unaffected by any of this and always
returns the same generic failure it always has. `LoginScreen` now shows
a distinct, specific message for a lockout rather than folding it into
the generic "couldn't sign you in" text. `cargo test` 226 lib (up from 220) + 54 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 262 TS tests (up from 259) green; `npm run build`
succeeds. No independent-review dispatch — see the agent-resume note
below; a careful self-review was performed instead (full detail in
ADR-0019), which also caught and fixed two real, unrelated UX/
accessibility gaps in M17's `LearnerListScreen` edit affordance (no
focus management when entering edit mode; a second "Edit" click could
silently discard a first learner's unsaved changes).

**Idle-Timeout Session Hardening is complete (2026-08-24, same
continuation session)** — see
`docs/adr/0020-idle-timeout-session-hardening.md`. The other half of the
shared-school-computer threat model ADR-0004 explicitly deferred
("[a session is] valid for this long after login regardless of
activity"): a session now also expires after 30 minutes of no
protected-command activity, independent of and in addition to the
existing fixed 8-hour absolute cap — both must hold. Only the one check
every protected command already goes through
(`SessionManager::require_active_session`) counts as activity and
slides the window forward; `commands::auth::current_session` (a
session-status peek) deliberately does not touch it, or polling session
state would itself defeat idle timeout. No schema change, no new
command, no frontend change (an idle-expired session fails the same
generic `Unauthorized` path every other session failure already does —
a pre-existing UX gap this milestone doesn't newly introduce, not
overlooked). `cargo test` 229 lib (up from 226) + 54 integration tests
green, `cargo clippy -D warnings` clean; `npm run quality` 262 TS tests
(unchanged — confirms zero frontend impact) green; `npm run build`
succeeds. No independent-review dispatch (same standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0020.

**Independent-review agent-resume issue recurred this session
(2026-08-24)**: `teacher-ux-reviewer` and `accessibility-reviewer` were
both dispatched in parallel for the M12c-M18 UI (real, previously-owed
review debt). Both completed real work (17 and 16 tool uses
respectively per their own usage reporting), but neither returned
retrievable findings text via the normal completion path or a resume
attempt — the same class of issue already documented for `security-reviewer`/
`architecture-reviewer` episodes across M7/M8/M12a/M12b. Per this
session's own established escalation rule, no further retry was
attempted; a self-review was performed instead for the account-lockout
work (see above) but **not yet for the broader M12c-M18 UI sweep those
two agents were originally asked to cover** — that remains real,
undischarged review debt, distinct from (and larger in scope than) the
two specific findings the self-review incidentally caught while working
on something else. Re-run both reviewers for real once agent-resume
behavior is confirmed working in a future session.

**M18 Bulk Attendance / Teacher Productivity is complete (2026-08-24,
same continuation session as M13-M17)** — see
`docs/adr/0018-bulk-attendance-mark-all-present.md`. Directly closes the
concrete example `docs/PROGRESS-MAP.md` had already named as
out-of-scope: "bulk attendance actions (e.g. 'mark all present')."
Before implementing, checked whether an unmarked day already behaves
like Present anywhere in this app (it does, in the SF2 export's blank
rendering and its totals) — the real value of an explicit mark is
auditability (a `recorded_at` timestamp proving the day was actually
checked), not export correctness, so the feature is genuinely about
teacher productivity, not a compliance fix. `AttendanceScreen` gained a
"Mark all present" button that marks every currently-unmarked learner on
the roster Present and **never overwrites an existing mark** — a
teacher who already flagged one Absent before clicking the bulk button
keeps that mark, proven by a dedicated repository test, not just
asserted. Reuses the existing `record()`/`roster_for_section_date`
isolation-checked read/write paths — no new query pattern, no new
authorization surface. `cargo test` 220 lib (up from 217) + 54
integration tests (up from 51) green — one transient parallel-execution
flake in an unrelated pre-existing auth test, confirmed not a regression
by an isolated rerun and a full-suite rerun, matching the flakiness
class already documented in `docs/PROJECT-MEMORY.md`'s M12b note.
`cargo clippy -D warnings` clean; `npm run quality` 256 TS tests (up
from 249) green; `npm run build` succeeds. No independent-review
dispatch (no new authorization surface or write path). Visual
verification not attempted, same standing gap as every UI milestone
since M5/M12c.

**M17 Learner Profile Enrichment (LRN + Sex only) is complete
(2026-08-24, same continuation session as M13-M16)** — see
`docs/adr/0017-learner-reference-number-and-sex.md`. Scoped strictly to
the roadmap's own "when required by report cards/forms" qualifier: this
app's already-shipped exports (`export::report_card`, `export::sf2`)
were checked first, and neither had ever disclosed LRN, birthdate, or
guardian contact as missing before this milestone. Research (two
independent secondary sources per field, matching the bar M10 already
set for SF2's own field layout) confirmed LRN and Sex are the only two
fields those two exports actually need — SF2's per-learner roster lists
both, and the SF9-style report card header needs LRN. Birthdate and
guardian contact are **not** added — no shipped export discloses either
as missing, so adding them now would be exactly the "expand PII
collection unnecessarily" the security-privacy rule prohibits. Both new
`learners` columns (`lrn`, `sex`, migration 13) are nullable with DB-
level format enforcement (`CHECK` constraints for the 12-digit LRN shape
and the M/F domain, plus a partial unique index on `(school_id, lrn)` —
a data-entry sanity check within one school's own visible data, not a
claim of verified national uniqueness). `export::sf2` and
`export::report_card` now populate LRN/Sex when present and disclose
per-row (not globally) when a specific learner doesn't have one yet;
SF2's old "does not track learner gender... at all" disclosure text was
corrected, since that stopped being true (drop-out/transfer _events_,
and the by-sex breakdown DepEd's statistics need from them, remain
untracked — Sex itself is now tracked). `cargo test` 217 lib (up from 208) + 51 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 249 TS tests (up from 242) green; `npm run build`
succeeds. No independent-review dispatch (no new authorization surface
or command pattern — `create_learner`/`update_learner` already existed);
an inline security self-check confirmed no new field bypasses session-
derived school scope and no LRN/Sex value is ever logged or placed in a
URL. **Disclosed gap, not an oversight**: the repository/service/command
plumbing to edit an _existing_ learner's LRN/Sex (`updateProfile`/
`updateLearnerProfile`) is built and tested, but no UI screen calls it
yet — a learner enrolled before this migration, or without LRN/Sex
filled in at enrollment, has no way to gain them until such a screen
exists. Worth closing alongside a future learner-detail-UI milestone,
not worth a rushed addition here.

**M16 SHS + Exceptional Grading Policies is complete (2026-08-24, same
continuation session as M13-M15)** — see
`docs/adr/0016-shs-and-exceptional-grading-policies.md`. Confirms
ADR-0015's own prediction empirically, not just by inspection: all six
DepEd Order No. 015, s. 2026 Table 10 (SHS/Key Stage 4) weight groups
were added as pure seed data (migration 12) against the _existing_
schema and algorithm — zero changes to
`grading_computation::compute_term_grade`, zero TS/UI changes at all
(`ClassRecordsScreen`'s picker and `ClassRecordWorkspace`'s policy-name
display are already fully data-driven, so all 8 policies now appear
automatically). Two of the six groups are structurally exceptional, not
just different percentages: Field Exposure/Arts Apprenticeship/Creative
Production weights Examinations as a Term Examination only (no Summative
Tests); Research Electives/Design and Innovation and Work Immersion have
no Examinations component at all. Both shapes are proven correct with
new end-to-end tests, not assumed. Source data reused from M13's
original primary-source PDF reading (not re-fetched — already fully
transcribed and verified at full resolution). Caveats carried into every
new policy's own citation text: DepEd itself defers detailed item-level
SHS specifications to a separate, not-yet-obtained implementation-
guidelines issuance (Annex D paragraph 47), and these policies apply to
Grade 11 (and Grade 12 only once it adopts the Strengthened SHS
Curriculum — Grade 12 under the prior curriculum still needs DO 8, s.
2015 weights, still unimplemented, still no primary source located).
`cargo test` 208 lib (up from 201) + 51 integration tests green, `cargo
clippy -D warnings` clean; `npm run quality` 242 TS tests (unchanged —
confirms no TS/UI impact) green; `npm run build` succeeds. No
independent-review dispatch (purely additive seed data against an
already-reviewed schema, no new command or code path). Visual
verification not attempted, same standing gap as M12c-M15.

**M15 Expand DepEd Grading Policy Coverage is complete (2026-08-24, same
continuation session as M13/M14)** — see
`docs/adr/0015-expand-grading-policy-coverage.md`. A class record now
explicitly pins which DepEd weight policy applies (`class_records.weight_policy_id`,
migration 11) instead of every class record silently sharing whichever
policy happens to be marked default — the real architectural gap
ADR-0014 identified. A second policy is now seeded: EPP/TLE & MAPEH
(20%/60%/20%, DO 015 s.2026 Table 9's second row, verified against the
same primary-source PDF reading M13 already did — not re-fetched).
`grading_computation::compute_term_grade` now resolves each class
record's own pinned policy; proven not just by inspection but by a test
giving the _same_ raw scores to both policies and asserting the results
differ. `ClassRecordsScreen`'s create form gained a required, always-
visible "DepEd grading weighting" picker (never inferred from a subject
name), and `ClassRecordWorkspace` now shows the actual policy in effect
in place of M14's hardcoded (and now-inaccurate) "assumes core K-10 for
everything" text. **Correction to the record**: ADR-0013/0014 both
over-flagged "GMRC/VE's domain split" as a grade-correctness gap — on
re-check, GMRC/VE is already inside the K-10 core weight group (same
20/50/30), so those grades were already DepEd-compliant since M13; the
domain split is an assessment-design tagging feature, not a different
formula. `cargo test` 201 lib (up from 192) + 51 integration tests
green, `cargo clippy -D warnings` clean; `npm run quality` 242 TS tests
(up from 239) green; `npm run build` succeeds. No new independent-review
dispatch (identical authorization pattern to every existing
reference-data command). Visual verification not attempted, same
standing gap as M12c/M13/M14.

**M14 Report Card / Official Grade Output is complete (2026-08-24, same
continuation session as M13)** — see `docs/adr/0014-report-card-export.md`.
A teacher can now export a class record's computed term grades as CSV
(`export_class_record_report_card`), reusing M10's `export::csv`/
`FieldDisclosure` architecture exactly (that struct was relocated from
`export::sf2` to the shared `export::mod`, since a second export now
needs it — a non-breaking move, `sf2.rs`'s own tests unchanged). Every
learner on the class record's roster gets a row — an explicit "Not yet
available" marker if their grade isn't computable yet, never silently
dropped. **Scope correction made during implementation**: the M13
session's end-of-turn proposal to "gate" this export to only the one
DepEd weight group M13 implements turned out not to be buildable without
new scope — `Subject` has no DepEd weight-group classification, and
`compute_term_grade` already applies the single seeded policy uniformly
to every class record, so there is nothing to gate on. Corrected to
inherit M13's own already-accepted choice instead: disclose the
limitation prominently (an always-visible warning in
`ClassRecordWorkspace.tsx`, not just a Guided-mode hint, since it's
correctness-affecting for every mode), don't silently refuse. Also
newly disclosed as omitted, more conservatively than strictly required:
DepEd's Qualitative Descriptor table, since M13's research only read it
at low resolution, not the same rigor as the tables actually
implemented — full detail in ADR-0014. `cargo test` 192 lib (up from 184) + 51 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 239 TS tests (up from 233) green; `npm run build`
succeeds. No new independent-review dispatch (identical authorization
pattern to every existing export command, no new pattern introduced).
Visual verification not attempted, same standing gap as M12c/M13.

**M13 DepEd Grade Computation is complete (2026-08-24, continuation
session)** — see `docs/adr/0013-deped-grade-computation.md` for the full
research record and architecture decision, `docs/ACTIVE-PLAN.md`'s "M13"
section for the verification record. Compliance-sensitive: researched
against the primary source directly (downloaded and visually transcribed
the actual DepEd Order No. 015, s. 2026 PDF — a 60-page scanned document
with no text layer — not a secondary summary), verified two independent
worked examples from the Order reproduce exactly end-to-end through this
implementation. Grade computation lives in
`src-tauri/src/repository/grading_computation.rs`, pure and DB-touching
functions coexisting in one file (matching `attendance.rs`'s existing
convention): `Percentage Score = pooled raw/max × 100` per category,
`Weighted Score = PS × weight%`, `Initial Grade = sum of WS`, then either
the Order's own 41-band Adjusted Transmutation Table (SY 2026-2027) or
direct rounding under the Zero-Based Grading System (SY 2027-2028
onward, selected from the already-existing `grading_periods.school_year`
field — no new "policy effective year" table needed). A real architecture
decision — how to model Examinations' internal Summative Test 1/2 + Term
Examination sub-weighting — was resolved via the 10-scenario process:
chose a nullable self-referencing `parent_category_id` on the existing
`assessment_categories` table (reuses 100% of M12b's item/category
machinery unchanged) over a separate join table. Implements exactly one
DepEd weight group (the core K-10 English/Filipino/Math/Science/AP/GMRC
cluster, 20/50/30) — explicitly disclosed as not covering EPP/TLE/MAPEH,
any SHS group, GMRC/VE's domain split, KS1 descriptive grading, or Grade
12's DO 8 carryover (that order's exact percentages could not be
confirmed from a primary source this session and were deliberately not
guessed at). `cargo test` 184 lib + 51 integration tests green, `cargo
clippy -D warnings` clean; `npm run quality` 233 TS tests green (two real
bugs caught by the tests themselves during development: a worked-example
fixture transcription slip, and `computeTermGrade` missing `async` —
same bug class already documented from M8's `monthlySummary`). No new
independent-review dispatch (no new authorization pattern introduced);
`teacher-ux-reviewer` on the new "Show term grades" UI is additional owed
debt alongside M12c's standing one. Visual verification not possible,
same standing gap as M12c.

**M12c Score-Entry Keyboard, Mobile, and Audit Polish is complete
(2026-08-24, prior continuation session)** — see `docs/ACTIVE-PLAN.md`'s
"M12c" section. Summary retained below for continuity; full detail there.

**M8 Monthly Attendance Summary is complete (2026-08-24, this session)**
— see `docs/ACTIVE-PLAN.md`'s "M8 Monthly Attendance Summary" section
and `docs/product/M8-DECISION.md` (the 20-scenario decision record) for
full detail. Selected via an autonomous evidence-based product-decision
process, not user-picked. A real DepEd `CONSO SF v2025.xlsx` the user
provided was used to verify SF2's actual structure — corrected the
milestone's scope to a school-wide overview (not section-level) with an
honest on-screen disclaimer, rather than an unverified guess at an
official template. **↺ INDEPENDENT REVIEW REQUIRED** for M8:
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted this milestone; one `security-reviewer` attempt hit
the same agent-resume issue described below and was not retried
further (self-review performed instead — see `docs/ACTIVE-PLAN.md` for
what it covered).

**M7 Attendance Tracking is complete (2026-08-24, this session)** — see
`docs/ACTIVE-PLAN.md`'s "M7 Attendance Tracking" section for full detail.
Independent review (`security-reviewer`, `architecture-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer`) was launched in parallel
and all four agents did real, substantial work, but their findings text
was not retrievable via the normal completion-notification/resume path —
a session-wide agent-harness issue (also hit earlier this session with
the Windows-migration checkpoint's `reliability-reviewer`). Per this
session's own escalation rule (attempt once more, don't repeatedly
retry), one fresh single-attempt re-run of `security-reviewer` was made
afterward — that one **did** surface a usable summary this time: **no
blocking findings**; tenant scoping and the ownership pre-check were
confirmed correct (matches this project's `require_active_school_scope`
invariant, no TOCTOU, no recurrence of the M4/M6 bug classes), plus two
non-blocking informational notes, both fixed on the spot: (1) `record()`'s
post-write re-fetch `SELECT` didn't filter by `school_id` (safe in
practice, since `learner_id` alone already resolves to one school, but
inconsistent with this codebase's explicit-scoping convention — added
`AND school_id = ?3`); (2) `AttendanceStatus::from_db_str` used
`unreachable!()` for a value outside the DB `CHECK` constraint — changed
to return a `rusqlite::Result` so a hypothetical constraint-bypass (a
dropped constraint, a manual DB edit) fails one command with an
`AppError::Database`, not the whole process with a panic. Re-verified
after these fixes: `cargo test` 98/98, `cargo clippy -D warnings` clean.
**`architecture-reviewer`, `teacher-ux-reviewer`, `accessibility-reviewer`
remain ↺ INDEPENDENT REVIEW REQUIRED** — replaced with the careful
self-review recorded in `docs/ACTIVE-PLAN.md`, not a substitute for a
real second set of eyes. Re-run these three for real once agent-resume
behavior is confirmed working in a future session.

M0–M6 are all complete and verified. `git log` shows `a70915b` (harness
upgrade) as HEAD, matching `origin/main` — the M0–M6 + harness work is
committed. A pre-existing uncommitted change to `src-tauri/Cargo.toml`
(adds `features = []` to the `tauri`/`tauri-build` dependency entries,
disabling their default features) was present at the start of this
session, is unrelated to this session's work, and was left as-is for the
user to review — verified (by temporarily stashing it and doing a full
clean rebuild) that it is **not** load-bearing for anything fixed this
session.

**Windows machine-migration checkpoint (2026-08-24), this session:**
verified this is the canonical repo on a new/re-set-up Windows PC, fixed
a real cross-machine reproducibility defect and a real local build defect
found in the process. Summary below; full verification record in
`docs/ACTIVE-PLAN.md`.

- **Line-ending reproducibility, fixed.** No `.gitattributes` existed.
  This machine's global `git config core.autocrlf` is `true` (the common
  Windows default) but this specific repo's local `core.autocrlf` was
  already `false`, so the defect wasn't reproducing on this exact clone —
  but a fresh clone without that local override would hit it: CRLF
  checkout of LF source, failing `prettier --check` (part of `npm run
quality`) across nearly the whole repo. Added `.gitattributes`
  (`* text=auto eol=lf`, with `.cmd`/`.bat` pinned to CRLF and binary
  assets marked `binary`) — verified with `git ls-files --eol`: sampled
  text files now show `attr/text=auto eol=lf`, `.ico` shows `-text`. No
  `.cmd`/`.bat` files are currently tracked, so that guard is
  forward-looking, not yet exercised.
- **Stale absolute-path build cache, fixed.** `src-tauri/target/`
  contained cached Rust build-script `output` files (e.g. for
  `openssl-sys`, `tauri`) whose embedded absolute paths pointed at a
  different directory name (`...\likha-sis-0.2-lf\...` — evidently a
  sibling directory from an earlier line-ending-migration clone, per the
  session's own briefing). This produced a cryptic `cargo build`/`cargo
test` failure: "failed to read plugin permissions... file not found"
  referencing the wrong directory, because a dependency's build script
  had cached output describing a location that no longer exists — cargo
  doesn't always rerun a build script if it doesn't detect an input
  change, so it kept reusing the stale cached path. Fix: delete
  `src-tauri/target/` entirely and do a full clean rebuild — this makes
  every build script rerun, and their reported OUT_DIR/paths get
  recomputed against the actual current directory. (Two of three deletion
  attempts this session still hit the stale error immediately after
  deleting — the first two `cargo`/`cargo build` invocations were launched
  as overlapping background processes racing on the same freshly-deleted
  target dir; only a fully sequential delete-then-build, waited on to
  completion before starting anything else against the same directory,
  actually cleared it.) Verified clean afterward: `cargo test` 85/85 (up
  from 72 recorded in M6 — see below), `cargo clippy --all-targets -D
warnings` clean, twice, including once with the pre-existing
  `Cargo.toml` diff temporarily stashed out to confirm that diff wasn't
  the actual fix.
- Added `scripts/verify-dev-environment.ps1` (read-only PASS/WARN/FAIL
  doctor: Git, Node/npm, Rust/Cargo, MSVC Build Tools + Windows SDK via
  `vswhere`, Strawberry Perl, the `.gitattributes` line-ending policy, and
  a regression check that scans `src-tauri/target/debug/build/*/output`
  for cached absolute paths referencing a `src-tauri` directory other than
  the current repo root — the exact class of bug just described. Run
  clean on this machine: 0 FAIL, 2 WARN (cargo and perl are correctly
  installed and on the persistent Windows User `PATH`, but were not on
  _this shell session's_ `PATH` — a real, reproducible distinction: a
  fresh terminal picks them up, the terminal used mid-session did not).
  Also added `scripts/setup-windows.ps1` (idempotent `winget install` for
  the same prerequisite list; diagnosis-only philosophy — does not
  auto-verify, tells the user to run the doctor script from a fresh
  terminal afterward). Both independently reviewed
  (`security-reviewer`: no blocking findings, two should-fix items in
  `setup-windows.ps1` fixed — pin `--source winget`, and a failed winget
  install now sets a failure flag and causes a non-zero exit instead of
  silently exiting 0; `reliability-reviewer`: two independent attempts
  both entered a confused state — misinterpreting genuinely new follow-up
  messages as repeated automated hook reminders and returning no usable
  findings — replaced with rigorous self-review, the same fallback M6
  used when an independent review hit a session limit. Self-review
  covered: the stale-build-cache regex was actually run against this real
  repo and caught a real false positive (see next sentence); the
  cargo/perl PATH-vs-installed distinction was verified empirically
  (`[Environment]::GetEnvironmentVariable(...,"User")` confirms both are
  on the persistent Windows User `PATH`; `$env:PATH` in the actual running
  shell confirms they were absent from it); `setup-windows.ps1`'s
  `$script:hadFailure` exit-code logic was reasoned through against
  PowerShell scoping rules (a top-level `foreach` doesn't create a new
  scope, so the explicit `$script:` prefix is correct-but-redundant, not
  broken) but not executed, since running it installs software and wasn't
  warranted for this checkpoint. `architecture-reviewer` not invoked — no
  application code changed, only new scripts and repo config. The
  doctor script itself caught and helped fix a real bug in its own first
  draft: the stale-build-cache regex initially flagged a false positive
  against OpenSSL's own C-escaped (doubled-backslash) path strings in its
  build output — fixed by normalizing double backslashes before
  comparing.
- Rust/Perl/MSVC toolchain: all present and working (`cargo 1.98.0`,
  `rustc 1.98.0`, Strawberry `perl 5.42.2`, VS 2022 Build Tools with the
  C++ workload, Windows SDK `10.0.26100.0` via `vswhere`) — this machine's
  winget installs from a prior session did carry over correctly; only the
  PATH-visibility-per-shell-session gap above was new.
- Security tooling gap, disclosed: Gitleaks/OSV-Scanner/cargo-deny are
  **not** currently on this machine's PATH — `npm run quality:security`
  was not run this session (would only report "tool missing", not real
  coverage). `docs/PROJECT-MEMORY.md`'s prior claim that they're
  "installed" describes the repo-side wiring (`scripts/check-security.mjs`,
  `.gitleaks.toml`, `src-tauri/deny.toml`, `osv-scanner.toml`), which is
  still correct and unchanged — it does not mean the binaries are present
  on every machine that clones this repo. Not reinstalled this session
  (out of scope for the environment checkpoint; `setup-windows.ps1`
  deliberately does not include them, since Phase 3 was scoped to build
  prerequisites, not the separate security-tooling list).

Previously recorded harness-upgrade context (2026-08-24, prior session):

A Claude Code development harness upgrade is also complete (2026-08-24):
see `docs/adr/0007-claude-code-harness-architecture.md` and
`docs/PROJECT-MEMORY.md`'s "Claude Code Development Harness" section for
what exists (`.claude/rules/`, `.claude/skills/` — 16, `.claude/agents/`
— 8 read-only, `.claude/settings.json` + hooks, security tooling). This
was infrastructure work, not an application milestone — no M0–M6
application behavior was changed, one line was added to
`src-tauri/Cargo.toml` (`publish = false`, a real `cargo deny` finding).
Independently reviewed (security/architecture/reliability agents, then a
fresh `evaluator` pass) — the evaluator's first pass correctly FAILed on
a claim that had been recorded as adopted (the `security-guidance`
plugin) before any config for it actually existed; that's now fixed
(declared in `.claude/settings.json`) and disclosed with the same
not-yet-runtime-verified caveat as the hooks below.

**Known, disclosed gap**: `.claude/settings.json` (hooks and the
`security-guidance` plugin declaration) did not exist when this session
started, so neither was observed actually active in this same session —
the settings-file watcher only watches directories that existed at
session start. Run `/hooks` once, or start a fresh session, to activate
them, then spot-check: e.g. try a destructive-looking Bash command and
confirm it prompts instead of running silently.

**Graphify code-graph tool — evaluated and REJECTED (2026-08-24), no
installation occurred.** Independently verified via `gh api` (not just
the research summary): 109,806 stars / 10,675 forks on a repo created
4.5 months prior — a ~245x gap over the next most-starred same-named
project, consistent with fake-star reputation laundering — plus the
maintainers explicitly declining to fix a live, acknowledged PyPI
typosquat vector on their own install path. No code from that project
was downloaded, cloned, or executed. Full writeup:
`docs/SOURCE-REGISTRY.md` and `.planning/graphify-eval/findings.md`. No
harness change resulted from this beyond documenting the rejection —
`.claude/`'s skill/agent/hook set is unchanged from the prior session.

## Current Goal

**M12c Score-Entry Keyboard, Mobile, and Audit Polish is complete
(2026-08-24, continuation session)** — see `docs/ACTIVE-PLAN.md`'s "M12c"
section for full detail. UI-only: `ClassRecordWorkspace.tsx`'s score
entry now commits on Enter/blur (dirty-checked, so an unchanged value is
never re-sent), Enter/ArrowDown/ArrowUp move focus between learners'
score fields spreadsheet-style, Escape reverts an uncommitted edit, and a
narrow-width (≤640px) layout re-flows the roster into stacked
full-width/44px-touch-target rows instead of shrinking the desktop
table — the first deliberately mobile-specific CSS in this app. Each row
also now shows a "Saved HH:MM" note from the existing `updatedAt` field
(no schema change). Before starting, re-verified directly against
`src-tauri/src/commands/learner_score.rs` (not just trusted from the
prior note) that `record_learner_score` takes `user_id`/`school_id` only
from `sessions.require_active_session`, never as a client parameter —
confirmed accurate. `npm run quality` clean (226 tests, up from 221). A
real double-save bug (programmatic focus-move firing a synchronous
native `blur` that re-entered the commit function before the first
call's cleanup ran) was found by a new test and fixed with an imperative
in-flight guard — a plain React-state dirty-check could not have caught
it reliably. Attempted real-browser verification via the Browser pane
(added `.claude/launch.json` for `npm run dev`): confirmed the bundle
builds/serves and the login screen renders correctly (with the expected
"no backend" message, since a plain browser has no Tauri IPC bridge), but
could not screenshot/render the page in this session ("the Browser pane
is not displayed") and could not reach `ClassRecordWorkspace` without a
real backend session chain — the 640px breakpoint's actual rendered
appearance is **not** visually confirmed, same standing gap as M5. No
independent reviewer dispatched (no authorization/persistence surface
touched); `teacher-ux-reviewer` on the new interaction model is owed, see
below.

**M12b Assessment Items and Learner Scores is complete (2026-08-24, prior
session)** — see `docs/adr/0012-assessment-items-and-scores.md`. Inline
research (same method as M10/M11) found DepEd Order No. 8, s. 2015
(Written Work/Performance Task/Quarterly Assessment) has been repealed
by DepEd Order No. 015, s. 2026, which renames the categories to Written
Works/Performance Tasks/Examinations — so, per M11's own precedent and
advisor guidance, category names are seeded reference data (two sets,
DO 015 default), never a hardcoded enum. A teacher can now add
assessment items to a class record and record each learner's score
(Scored/Excused/Not Applicable), with eligibility checked against the
grading period's actual date range and every score attributed to the
session's own `user_id` (never client-supplied). `cargo test` 163 lib +
6 new integration tests + 3 new migration tests green, `cargo clippy -D
warnings` clean, `npm run quality`/`npm run build` clean (221 TS tests,
39 files). **Independent review**: `security-reviewer` was dispatched
(per advisor guidance) but hit the same agent-resume issue on both the
initial attempt and one resume-retry (real work done — confirmed via
token/tool-use counts — but no retrievable findings text either time).
Per this session's established escalation rule, a careful self-review
was performed instead — **no blocking findings** across the four areas
checked (`recorded_by_user_id` cannot be spoofed — traced the actual
Tauri command parameters, confirmed only session-derived; the
`max_score` bound and status/score pairing are enforced before any
write; roster eligibility genuinely blocks an ineligible learner; no new
injection surface); full detail in ADR-0012. Still owed: a real
(non-self) `security-reviewer` pass for M12b once agent-resume behavior
is confirmed reliably working.

**M12a Gradebook/Class Record Foundation is complete (2026-08-24, this
session)** — see `docs/adr/0011-gradebook-class-record-foundation.md`.
User directed the full M12/M13/M14 roadmap in one message; per advisor
consultation before implementation, M12 was split into phases (M12a
Subject+ClassRecord foundation now, M12b assessment items/scores next,
M12c keyboard/mobile/audit polish after that) so M13's computation work
doesn't force a rework of a schema built in one pass. A teacher can now
open a class record (one section + one subject + one grading period);
`ClassRecord` stores no `school_year` of its own — the section's and the
grading period's `school_year` are verified to match at creation instead,
so there is one source of truth, not three copies that could drift.
`cargo test` 141 lib + 5 new integration tests green, `cargo clippy -D
warnings` clean, `npm run quality`/`npm run build` clean (189 TS tests,
34 files). **Independent review**: `architecture-reviewer` was
dispatched (owed since M7) but hit the same agent-resume issue on both
the initial attempt and one resume-retry (real work done — confirmed via
token/tool-use counts — but no retrievable findings text either time).
Per this session's established escalation rule, a careful self-review
was performed instead — **no blocking findings** across the four areas
checked (layering, the school-year single-source-of-truth logic,
isolation/session-derivation convention, M12b setup risk); full detail
in ADR-0011. Still owed: a real (non-self) `architecture-reviewer` pass
for M12a once agent-resume behavior is confirmed reliably working.

**M11 Grading-Period Foundation is complete (2026-08-24, this
session)** — see `docs/ACTIVE-PLAN.md`'s "M11" section for the full
verification record and `docs/adr/0010-grading-period-foundation.md` for
the technical decision, source citations, and scope boundaries.
User-directed (named as the explicit next-best in the same message that
directed M10). Schools can now record grading periods per school year,
instantiated from a versioned, DepEd-sourced policy — the current
default cites DepEd Order No. 9, s. 2026 (four quarters → three terms),
chosen deliberately over hardcoding either structure once research
showed DepEd's own terminology is genuinely in transition. No grade
computation or gradebook yet.

**Independent review for M11**: one `security-reviewer` episode,
succeeded on the **first attempt** — no resume-retry needed, no
findings. `architecture-reviewer`/`teacher-ux-reviewer`/
`accessibility-reviewer` still not attempted, same standing debt as
M7/M8/M9/M10.

**M10 Local Section-Level SF2 Export + Reusable Official-Form Engine
Foundation is also complete (2026-08-24, this session)** — see
`docs/ACTIVE-PLAN.md`'s "M10" section and
`docs/adr/0009-sf2-export-and-official-form-engine.md`. A teacher can
export a section's monthly attendance as a DepEd-SF2-inspired CSV to
`Documents\LIKHA-SIS\`, with every field the schema can't honestly
populate disclosed (not fabricated) via a `FieldDisclosure` struct
shared between the CSV's trailing comment block and the on-screen
disclaimer. Independent review found and fixed two real should-fix
issues (CSV/formula injection; an unstripped `:` enabling a Windows/NTFS
alternate-data-stream filename) — see ADR-0009.

**Superseded (historical, kept for record only — do not act on this
paragraph):** "Next milestone not yet chosen... No candidate is
pre-selected — ask the user for a pick, or run a fresh evidence-based
scoring pass, before implementing." This was written when M12 candidates
were still open; the roadmap has since been directed (see "Status"
above) and the project now operates in Autonomous Continuous Development
Mode (`.claude/rules/autonomous-development.md`, adopted 2026-08-24) —
milestone completion is a checkpoint, not an automatic stop, and the
next milestone is selected autonomously from current evidence rather
than asked for. See "Next Action" below for the actual current
direction.

## Constraints

- Do not import or depend on old application code.
- Use synthetic data only.
- Keep dependencies minimal.
- Do not add paid services or billing-enabled infrastructure.
- Preserve architecture boundaries from `PROJECT-MEMORY.md`.
- **Commit and push after every completed milestone (2026-08-25,
  standing instruction, supersedes the prior "do not commit" default)**:
  once a milestone is verified and its ADR/handoff docs are updated,
  commit it with a descriptive message and push before continuing to
  the next autonomously-selected milestone — not a separately-requested
  action anymore.

## Environment Notes

- **Development resource assumption (revised 2026-08-24)**: two Claude
  Pro accounts are now available for this window, not one — see
  `docs/PROJECT-MEMORY.md`'s "Development Resource Assumption" for the
  full statement and what it does/doesn't change. In short: more budget
  for review/testing/research depth, not more concurrent scope.
- Rust `stable-x86_64-pc-windows-msvc`, Visual Studio Build Tools 2022
  (C++ workload), and Strawberry Perl (needed to compile vendored OpenSSL
  for SQLCipher) are all installed on this machine via winget.
- `tauri.conf.json` uses a placeholder identifier `org.likhasis.app` —
  fine for local development; revisit before any real distribution or
  code signing.
- `npm run quality` is the canonical local TS check (typecheck, lint,
  format:check, an architecture-boundary check, test). For Rust:
  `cargo test`, then `cargo clippy --all-targets -- -D warnings`. New
  tiers from the harness upgrade: `npm run quality:security` (Gitleaks +
  cargo-deny + OSV-Scanner, via `scripts/check-security.mjs` — explicitly
  distinguishes "tool missing" from "tool ran clean"), `npm run
quality:ui` (currently an honest placeholder — no Playwright UI-smoke
  suite exists yet), `npm run quality:full` (adds the Rust checks). All
  four security tools (Gitleaks, cargo-deny, OSV-Scanner,
  `@playwright/cli`) require a fresh shell/session to be on `PATH` after
  this session's winget/cargo/npm installs.
- The working SQLite database is encrypted (SQLCipher) and keyed via
  Windows DPAPI — see `docs/adr/0003-encryption-at-rest.md`.
- All SQL lives in Rust (`src-tauri/src/repository/`); the frontend never
  constructs SQL — see `docs/adr/0002-local-database-foundation.md`.
- **Authentication/authorization** — see
  `docs/adr/0004-authentication-and-local-session.md` before touching
  `src-tauri/src/auth/`, `commands/{auth,user,learner}.rs`, or any TS
  `AuthApplicationService`/`LearnerApplicationService` usage. Any Tauri
  command reading/writing tenant data must derive scope from
  `sessions.require_active_school_scope(&conn)`, never accept it as a
  parameter; any command creating accounts/memberships must go through an
  `authorize_*` gate in `auth/mod.rs`. This exact gap (unauthenticated
  bootstrap commands with no limit) was found and fixed once already —
  don't reintroduce it.
- **UI** — see `docs/adr/0005-app-shell-and-first-ui-slice.md` and
  `docs/adr/0006-first-run-bootstrap.md`. New screens go in `src/ui/`,
  receive their `*ApplicationService`s as props (never import
  `composition.ts` directly, so they stay testable with fakes), and
  should check `useTeacherMode()` before assuming `Guided`-only content
  isn't needed. `src/composition.ts` is the only file allowed to import
  concrete `infrastructure/tauri/*` classes — enforced by
  `npm run check:architecture` now, not just convention.
- **Visual verification gap, standing**: this environment has no
  browser/screenshot/rendering tool for the compiled native app. Every
  future UI milestone will hit the same limitation M5/M6 did — plan to
  flag it the same way (verify everything objectively checkable, state
  plainly what wasn't), not to work around it by guessing. `@playwright/cli`
  (adopted this session) can partially help for the browser-rendered
  `vite dev` surface only — it cannot attach to the compiled Tauri
  webview. See `docs/VERIFICATION-DEBT.md`.
- `vitest-axe` was tried and dropped (unmaintained, v0.1.0, types don't
  match Vitest 4.x) in favor of a direct `axe-core` wrapper at
  `src/test/a11y.ts` — use `expectNoAccessibilityViolations(container)`
  for new screens' structural accessibility tests.

## Next Action

**Post-sequence evidence-based scoring pass complete (2026-08-25)** —
see `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for the full
table. Top two picks are both implemented: Learner Roster CSV Export
(8.10, ADR-0025) and Idle-Timeout Warning Before Logout (6.30,
ADR-0026). Per the user's own standing preference ("just select the
recommended automatically, will adjust after all milestone has
achieved"), the next-highest-scoring runner-up remains the default next
pick:

1. **teacher-ux-reviewer/accessibility-reviewer dispatched (2026-08-25)**
   on the M12c-M26 UI sweep. **`teacher-ux-reviewer` outcome**: hit the
   same recurring agent-resume/retrieval failure this project has
   documented since M7 — real work done (26 tool uses, ~94k tokens
   across the initial run and one resume attempt), but no findings text
   ever retrievable, even after the one resume this project's
   escalation rule allows. Per that rule, a careful self-review was
   performed instead — see `docs/adr/0027-audit-timestamp-readability-fix.md`.
   It found and fixed one real, concrete gap: `AuditLogScreen.tsx` and
   `TeacherWorkspaceScreen.tsx` were both showing a teacher a raw ISO
   timestamp (`2026-08-25T08:00:00.000Z`) instead of a readable date,
   the same class of bug M12c already fixed once for
   `ClassRecordWorkspace.tsx`'s "Saved HH:MM" note but never carried
   forward to the screens added after it. Fixed in both places; 4 new
   tests. **`accessibility-reviewer` outcome**: hit the identical
   agent-resume/retrieval failure (real work, 31 tool uses, ~124k
   tokens across the initial run and one resume, no retrievable
   findings text either time). Per the same escalation rule, another
   self-review was performed, covering contrast, focus management,
   keyboard operability, ARIA correctness, and touch-target sizing. It
   found and fixed one real issue: `IdleTimeoutWarning.tsx` used
   `role="alertdialog"`, which per ARIA authoring practices implies
   modal focus-trapping behavior the component never actually provides
   (it's a dismissible, non-blocking banner, same as every other banner
   in this app) — changed to `role="alert"`, matching the
   `error-banner`/`confirmation-banner` convention already established.
   Hand-computed contrast for the new `--color-warning` tokens passed
   comfortably in both light (≈5.3:1) and dark (≈7.7:1) mode — no fix
   needed there. `npm run quality` 313 TS tests (up from 302 before
   this dispatch) green throughout. **Both `teacher-ux-reviewer` and
   `accessibility-reviewer` remain owed a real (non-self) pass** on
   this UI sweep once agent-resume behavior is confirmed reliably
   working in a future session — recorded as standing debt, not
   discharged by the self-reviews above.
2. **Grading-period-aware Teacher Workspace enhancement — complete
   (5.70)**. See `docs/adr/0028-workspace-grading-period-status.md`.
3. **Proptest pilot on auth/lockout invariants — complete (4.85)**. See
   `docs/adr/0029-proptest-lockout-pilot.md`.

**All scored candidates from the post-sequence pass above the ~4.0
threshold are now complete.** The two remaining entries in that pass's
table — password reset/account recovery (4.20) and a Trail of Bits
second-opinion pilot (3.25) — both scored low specifically because
they're blocked on something other than raw implementation effort
(password reset needs a genuine product/security decision this app has
no out-of-band recovery channel for yet; the Trail of Bits pilot needs
external-tool research this session didn't do). Per the same "reassess
rather than default to whatever's next on a now-stale list" discipline
this project has used at every real checkpoint, this is another
legitimate point to run a fresh evidence-based scoring pass (or ask the
user for direction) before picking a fifth item, rather than reaching
for password reset or Trail of Bits just because they're what's left on
an old list. Real candidates worth weighing in that fresh pass: the
still-open `teacher-ux-reviewer`/`accessibility-reviewer` review debt
(once agent-resume behavior can be spot-checked as healthy first), the
remaining Compounding Engineering Phase B/C/E/F/G items, data
export/backup's original raw-database-backup interpretation (explicitly
deferred as its own security-design question in ADR-0025), and any
newly-relevant DepEd research if a primary source for KS1/DO 8 surfaces.

Still-standing context, unchanged since the last reassessment:

- The shared-computer/session-security thread (Account Lockout →
  Idle-Timeout → Audit Log → Global Session Expiry) remains coherent
  and closed — no known open gap.
- Password reset/account recovery (scored 4.20 — low specifically
  because this local-only, no-email/SMS app has no safe out-of-band
  recovery channel without either an admin-reset flow, which needs the
  still-deferred Roles & Permissions decision, or a weak
  security-question mechanism this project's posture shouldn't adopt)
  needs a genuine product/security decision before it's actionable.
- DepEd weight-group work remains genuinely blocked, not deprioritized:
  Key Stage 1 descriptive grading and Grade 12's DO 8 carryover both
  still lack a usable primary source — see "Remaining DepEd weight-group
  work" below before attempting either again.
- The Compounding Engineering tooling pass
  (`docs/product/COMPOUNDING-ENGINEERING-DECISION.md`) deliberately
  deferred Phases B-H (proptest — scored 4.85 this pass, cargo-mutants,
  UI regression testing, agent-regression suite, Trail of Bits second
  opinion — scored 3.25 this pass, Beads/Serena piloting) with
  documented resumption criteria.

Other done/available items, none blocking:

- **Done (2026-08-24)**: Account Lockout After Failed Logins — see
  `docs/adr/0019-account-lockout.md`.
- **Done (2026-08-24)**: Idle-Timeout Session Hardening — see
  `docs/adr/0020-idle-timeout-session-hardening.md`. Closes both
  shared-computer threat-model gaps ADR-0004 originally deferred
  (lockout for the login step, idle timeout for an already-authenticated
  abandoned session).
- **Done (2026-08-25)**: Audit Log — see
  `docs/adr/0021-authentication-audit-log.md`.
- **Done (2026-08-25)**: Global Session Expiry Handling — see
  `docs/adr/0022-global-session-expiry-handling.md`.
- **Done (2026-08-25)**: Learner Search / filter for large rosters —
  see `docs/adr/0023-learner-search.md`.
- **Done (2026-08-24)**: a `LearnerListScreen` edit affordance closing
  M17's disclosed gap, plus two self-review-caught fixes (focus
  management entering edit mode; a second "Edit" click could silently
  discard a first learner's unsaved changes).
- Dispatch a fresh `teacher-ux-reviewer` and `accessibility-reviewer`
  pass on the M12c-M21 UI sweep once agent-resume behavior is confirmed
  working — real, undischarged review debt, not blocking.
- Other candidates from `docs/product/M8-DECISION.md`'s original
  20-scenario list, not yet built and not in the current directed
  sequence: a teacher dashboard/home screen (#6, though this overlaps
  with the directed "Teacher Workspace" item — reconcile when reached
  rather than building twice), data export/backup (#15), password
  reset/account recovery (#17).
- Remaining DepEd weight-group work, **not** purely additive after
  further research (2026-08-24): Key Stage 1 descriptive grading (a
  structurally different computation — rubric evidence, not weighted
  scores). Grade 12's DO 8, s. 2015 carryover was re-investigated this
  session — the weight percentages ARE now findable (multiple
  corroborating secondary sources: Languages/AP/ESP 30/50/20,
  Science/Math 20/60/20, MAPEH 40/40/20 for grades 1-10; SHS Core/Track
  25/50/25 for grades 11-12 — the last being the only one actually
  relevant, since DO 015 already supersedes the K-10 figures). **But
  this is not purely additive like the SHS groups were**: DO 8's own
  1.6-point-increment transmutation table is a structurally different
  curve from DO 015's Adjusted Transmutation Table already implemented
  in `grading_computation::ADJUSTED_TRANSMUTATION_TABLE` (different
  floor behavior even — one secondary source claimed DO 8 floors 60→75,
  another claimed 60→60 matching DO 015's own table; these directly
  contradict each other, which is itself a sign neither should be
  trusted without a primary source). `compute_term_grade` currently
  selects a transmutation approach purely from `grading_periods.school_year`
  (SY2026-2027 → DO 015's Adjusted Table; SY2027-2028+ → Zero-Based
  rounding) — there is no third path for "this class record uses DO 8's
  own transmutation table," and adding one is a real architecture
  decision (how does a class record signal it's under DO 8, not just
  which weight percentages it uses?), not a seed-data-only change.
  **Do not implement the weight percentages alone and reuse the existing
  transmutation logic** — that would silently apply the wrong curve to
  Grade 12's grades. Needs a dedicated research pass to pin down DO 8's
  actual transmutation table from a primary or clearly-reliable source,
  followed by the 10-scenario process for the selection mechanism,
  before any schema change. **Two further research attempts this
  session (2026-08-24) still failed to produce a trustworthy full
  table**: secondary sources disagree even on the transmuted-grade
  range itself (one claims 60-99, another 60-100), a page specifically
  about "D.O. No. 8 s.2015" cites only a Facebook post as its source
  (not the Order), and no page reproduces the full ~40-row table. Per
  `.claude/rules/autonomous-development.md` gate #6, this is now a
  confirmed stop: do not attempt DO 8's transmutation table again from
  a web search — it needs the actual primary-source PDF (the way M13
  obtained DO 015's), which was not locatable this session.

If DepEd-specific research is needed for any of the above, prefer doing
it inline with `WebSearch`/`WebFetch` in the main session over spawning
`deped-researcher` — inline research (including, in M13, downloading and
visually transcribing the actual DepEd Order PDF, and in M17,
cross-checking two independent secondary sources before adding any
learner-profile field) has worked cleanly since M10, while this
session's agent-resume path remains inconsistent.

Also **owed from M7/M8/M9/M10/M11/M12a, not blocking but should be
revisited**: a real (non-self) `architecture-reviewer`/
`teacher-ux-reviewer`/`accessibility-reviewer` pass for M7, all four
review types for M8, all four for M9, and
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
for M10 and M11 (both milestones' `security-reviewer` episodes did
succeed — see ADR-0009/0010), once agent-resume behavior is confirmed
reliably working in a session. M12a's `architecture-reviewer` self-review
fallback and M12b's dispatched `security-reviewer` (which never returned
usable output — self-review fallback recorded in ADR-0012, re-verified
directly against source in the M12c session) are the first two of these
actually attempted; none of M12c, M13, M14, M15, M16, M17, or M18 added
new review debt beyond the `teacher-ux-reviewer` note above — M17
touched a new PII field but no new authorization surface, and got its
own inline security self-check recorded in ADR-0017 rather than a full
dispatch; M18 reused an already-reviewed write path (`record()`) and
introduced no new authorization surface — see
ADR-0011/0012/0013/0014/0015/0016/0017/0018.

If instead asked to continue harness work: the harness itself is
complete per `docs/adr/0007-claude-code-harness-architecture.md`. An
`evaluator` pass FAILed once on a real gap (the `security-guidance`
plugin was documented as adopted before it was actually configured, plus
two stray junk files) — both fixed; see
`.planning/harness-upgrade/progress.md` for the full log and confirm a
re-run evaluator PASS is recorded there before treating this as settled.
Remaining optional/deferred items, not blockers:
piloting the `@wdio/tauri-service` native-binary smoke test (currently
just researched and adopted-as-PILOT, not yet executed — see
`docs/SOURCE-REGISTRY.md`), and confirming the hooks/`security-guidance`
plugin are actually live after a `/hooks` reload or restart.

## Completion Gate

An application milestone is complete only when: it's reachable from the
actual app (not just callable in isolation), `npm run quality`/
`cargo test` stay clean, an independent reviewer agent has checked it,
and — as with M5/M6 — the visual-verification limitation is reported
honestly rather than glossed over.
