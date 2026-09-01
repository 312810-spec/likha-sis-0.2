npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

# Wave 3H — Fresh Roadmap Survey and Next-Slice Selection

Decision record, added 2026-08-31. This is a **planning wave only** — no
product source, Rust source, tests, dependencies, migrations, workflows,
or harness metadata were touched. Full requesting context: GitHub issue
#6.

## Repository truth verified first

- Branch: `claude/issue-6-20260831-1042`.
- `HEAD` = `9ff7c09` — exactly the checkpoint the issue named as expected
  (`9ff7c09fc926b229c787f5b92b439767a4864e39`), confirmed via
  `git merge-base --is-ancestor` (reported itself as `HEAD`, not merely
  an ancestor).
- Working tree clean, `main` not fetched/switched/merged/modified, no new
  branch created.
- Wave 3G (Section Adviser Management UI) and the whole Section
  Advisory/Adviser View/Subject Attendance feature line (Waves 2V-3G)
  are confirmed **complete, integrated onto `main`, and independently
  security-reviewed with no blocking or should-fix findings** — see
  `docs/CURRENT-HANDOFF.md`'s "Wave 3E/3F/3G individual review debt —
  closed" and "Integration Review" entries. Not reopened here.
- The single most recent entry in `docs/CURRENT-HANDOFF.md` ("Section
  Adviser browser-rendered verification") explicitly recorded **no
  candidate pre-selected** for the next slice — this wave is that
  evaluation.

## Survey performed

Read in full or in relevant part: `CLAUDE.md`, `.claude/rules/*.md`,
`docs/CURRENT-HANDOFF.md` (top ~250 lines, covering every 2026-08-31
entry), `docs/ACTIVE-PLAN.md` (Wave 3A-3G detail), `docs/PROJECT-MEMORY.md`
(in full, both the "Current Foundation" milestone ledger and every dated
section through the current "Current Milestone" pointer),
`docs/PROGRESS-MAP.md` (in full), `docs/product/PRODUCT-CONTRACT.md` (in
full), `docs/VERIFICATION-DEBT.md` (top ~300 lines, covering every wave
since Wave 2Y), `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`
(the authoritative Wave 0-7 sequencing table),
`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`,
`docs/product/M8-DECISION.md`, `docs/adr/0004`, `docs/adr/0044`, and a
direct source-code grep of `src-tauri/src` for password-reset/change and
`Capability::` gates to confirm current implementation state rather than
trusting a doc summary.

## Candidates evaluated (11)

Every candidate the issue named, plus one the survey itself surfaced
(admin-assisted password reset), each checked against the live repo, not
assumed from memory.

| #   | Candidate                                                                                                                                                               | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Actionable now?                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **Adviser View browser-rendered fixture/verification debt**                                                                                                             | `AdviserViewScreen` has jsdom+axe coverage only; needs a `SubjectAttendanceApplicationService` dev-preview fixture (doesn't exist yet) before Playwright can drive it. Also still unwired in dev-preview: Subject Attendance, Subject Monitor, Teacher Load, Teaching Assignments, Schedule Meetings, SF1 Import (`docs/VERIFICATION-DEBT.md` top entry).                                                                                                                                                                   | Yes — bounded, no research blocker, this session's environment already proved Chromium works.                      |
| 2   | **Wave 5 Sync 10-scenario decision only (no deployment)**                                                                                                               | No sync ADR or code exists (`PRODUCT-CONTRACT.md` §12); the Cloudflare Worker+D1/Durable-Object target is only a stated hypothesis, never ratified.                                                                                                                                                                                                                                                                                                                                                                         | Decision-shaped, not implementation-shaped — see "Why not selected" below.                                         |
| 3   | **SF5 (Promotion & Learning Progress)**                                                                                                                                 | Not built at all (`PRODUCT-CONTRACT.md` §5 table). Seasonal EOSY workflow; exact template/criteria not yet sourced from an authoritative document in this repo.                                                                                                                                                                                                                                                                                                                                                             | No — needs a DepEd research pass first.                                                                            |
| 4   | **Authoritative-template SF9**                                                                                                                                          | `report_card.rs`/Wave 2T ship a disclosed CSV only. The authoritative half (Tauri → sidecar → Apache POI/HSSF → real `.xls` template) needs an actual template source and a new cross-language sidecar architecture (Wave 3 in ADR-0035) — a substantially larger undertaking than one bounded slice.                                                                                                                                                                                                                       | No — needs authoritative template evidence plus its own architecture decision.                                     |
| 5   | **Native NVDA/Narrator verification**                                                                                                                                   | Repeatedly disclosed as genuinely infeasible in this remote Linux session across many prior waves (no Windows/screen-reader hardware available here).                                                                                                                                                                                                                                                                                                                                                                       | No — hard environment blocker, unchanged.                                                                          |
| 6   | **Key Stage 1 descriptive grading research**                                                                                                                            | `PRODUCT-CONTRACT.md` §4: "blocked on missing primary sources... do not re-attempt from a web search alone."                                                                                                                                                                                                                                                                                                                                                                                                                | Not yet — needs a primary DepEd source not currently available.                                                    |
| 7   | **Grade 12 DO 8 primary-source research**                                                                                                                               | Same section: weights are now known but the transmutation table differs from DO 015's and needs its own research + architecture pass.                                                                                                                                                                                                                                                                                                                                                                                       | Not yet — same evidence gap.                                                                                       |
| 8   | **Password-reset/account-recovery policy decision**                                                                                                                     | Previously scored 4.20 (2026-08-25) and explicitly recorded as blocked because a safe admin-reset flow "needs the deferred Roles & Permissions decision." **RBAC has since shipped** (`docs/adr/0036`, Wave 1: Teacher/Registrar/School Head + `Capability` gates, confirmed live in `src-tauri/src/auth/mod.rs`). Grep of `src-tauri/src` confirms **zero** password-reset/change command exists today — a signed-in teacher who forgets their password has no recovery path at all.                                       | **Yes — the original blocker no longer holds.** See recommendation below.                                          |
| 9   | **Remaining independent UX/accessibility review debt**                                                                                                                  | `teacher-ux-reviewer`/`accessibility-reviewer` have hit the same agent-resume/retrieval failure on every dispatch since M7 (5+ occurrences), each time substituted with a self-review that found and fixed at least one real issue. Debt is open across UX-03, UX-04, and Waves 2Y-3D.                                                                                                                                                                                                                                      | Executable, but past dispatches have failed identically every time; no new evidence the harness issue is resolved. |
| 10  | **Raw-database backup/security design**                                                                                                                                 | `docs/VERIFICATION-DEBT.md`: "no safe cross-device/cross-profile key recovery exists... a deliberate, disclosed design tradeoff." Explicitly rejected once already (2026-08-25 reassessment) from a routine feature pass as "its own unresolved security design question" — the safe mechanism itself (raw key export? recovery passphrase? printed code?) is not yet decided.                                                                                                                                              | Decision-shaped, not implementation-shaped — see "Why not selected" below.                                         |
| 11  | **Admin-assisted password reset** (School Head resets a teacher's LIKHA login password within their own school) — surfaced by this survey, not in the issue's seed list | Directly implementable: reuses `Capability::ManageSchoolMembership` (already gates account/membership commands per `.claude/rules/security-privacy.md`), reuses the existing Argon2id hashing path (`auth::login`/account creation), reuses `require_active_school_scope`, reuses the existing `audit_log` table for a new event type. **Distinct from and unrelated to** the Windows-DPAPI/SQLCipher key-recovery question in ADR-0044 — LIKHA's own app-level username/password is independent of the OS-level DPAPI key. | Yes.                                                                                                               |

## Why the two decision-shaped candidates (#2, #10) were not selected

Both Wave 5 Sync and the raw-database backup/recovery question are real
and important, but neither is a **narrow implementation slice** as this
issue asks for — each first needs its own dedicated 10-scenario
architecture-decision pass (Sync's own ADR-0035 entry says this
explicitly; backup/recovery was explicitly pulled out of a routine
feature pass for the same reason on 2026-08-25) before any code should be
written. Running a full scenario process _and_ implementing a
representative slice in the same bounded wave risks exactly the
"researching under time pressure on something safety-sensitive" pattern
this project has deliberately avoided before (see ADR-0031's fixture
decision). Recording both here as strong candidates for their own
future decision-focused wave, not dropped.

## Recommendation

### Recommended: Admin-assisted password reset (School Head resets a colleague's LIKHA password)

**Scored against LIKHA's priority order** (privacy/security → correctness
→ DepEd compliance → teacher usability → offline reliability →
maintainability → zero billing → performance → speed):

- **Privacy/security — high.** Today, a teacher who forgets their
  password has _no_ legitimate recovery path in the product at all. The
  only way to "recover" access today would be direct, unaudited database
  manipulation outside the app — a materially worse security posture
  than a properly gated, audited, in-app admin-reset command. Closing
  this is a net security improvement, not a new risk surface, provided
  the reset stays school-scoped and capability-gated exactly like every
  other tenant-mutating command.
- **Correctness/DepEd compliance — neutral.** No DepEd form or
  compliance surface touches authentication.
- **Teacher usability — high.** A teacher permanently locked out of
  their own account (distinct from the existing 15-minute lockout, which
  already self-clears) is a severe, currently-unaddressed usability
  failure with no workaround for the teacher themselves.
- **Offline reliability — neutral/positive.** No cloud dependency; fits
  the shared-school-computer, no-email/SMS deployment model already
  established in ADR-0004.
- **Maintainability — positive.** Reuses four already-proven patterns
  end to end (Capability gate, Argon2id hashing, school-scoping,
  audit-log event) rather than inventing a new one.
- **Zero billing — satisfied.** No new dependency, no external service.
- **Evidence readiness — the deciding factor.** Every other
  higher-scored-on-paper candidate (Sync, backup/recovery, SF5,
  authoritative SF9, KS1/DO8 research, NVDA/Narrator) is blocked on
  something this session cannot resolve today: missing primary sources,
  an unratified architecture decision, or unavailable hardware. This
  candidate has no such blocker — it was blocked, is now evidenced as
  unblocked by RBAC's completion, and was never re-evaluated since.

This is exactly the kind of "newly discovered evidence changes the best
sequence" case `.claude/rules/autonomous-development.md` calls out — the
original blocking condition on record no longer holds, and the roadmap
was never revisited to reflect it.

### Runner-up: close the Adviser View dev-preview/Playwright verification debt

The most recently and explicitly named "recommended next slice, not
started" already on record in `docs/CURRENT-HANDOFF.md`'s own top entry.
Bounded, low-risk (verification only, no behavior change), and completes
a debt this project has been carrying since Wave 3F. **Switch condition**:
pick this instead of the recommended slice if a fresh scoping pass at
Wave 3N's start finds the admin-reset mechanism needs more product-policy
judgment than expected (unlikely, per the reasoning above, but the
10-scenario process should still be run explicitly, not skipped, given
`CLAUDE.md`'s standing rule for auth-touching decisions).

## Wave 3N — exact scope for the next implementation wave

**In scope:**

- Run the project's own 10-scenario decision process for the exact reset
  mechanism (expected shortlist: School-Head-sets-new-password-directly;
  School-Head-generates-a-temporary-password-with-forced-change-at-next-login;
  self-service security questions — reject, weak; email/SMS OTP —
  reject, no channel exists; a printed recovery code issued at account
  creation — likely too large a scope change for this slice). Record the
  decision in a new ADR.
- A new Rust command (e.g. `admin_reset_teacher_password`), gated by
  `Capability::ManageSchoolMembership`, target user resolved and verified
  to belong to the caller's own school before any write — mirroring every
  existing `authorize_*` pattern, never trusting a client-supplied school
  id.
- Reuse the existing Argon2id hashing path unchanged.
- A new `audit_log` event type for the reset action (e.g.
  `password_reset_by_admin`), attributed to the acting School Head's
  session, distinct from the account's own future login events.
- Add the new command to `invoke.ts`'s
  `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` set in the same commit
  it ships in (Wave 3B's own recorded debt — every new
  `Capability`-gated command must be added by hand or it silently
  reintroduces the false-positive-logout bug).
- A small School Head UI affordance (e.g. from the existing school-member
  list) to trigger the reset, following this app's established
  generic-error/no-client-side-enforcement convention
  (`SectionAdviserScreen`/`TeachingAssignmentsScreen` precedent).
- Command-boundary tests: same-school success, cross-school denial,
  non-School-Head denial, target-not-found handling, audit-log entry
  written.

**Non-goals for Wave 3N specifically:**

- No self-service ("forgot password" from the login screen) flow — no
  out-of-band channel exists to make that safe; this remains
  admin-assisted only.
- No forced-password-change-at-next-login flag/schema addition unless the
  10-scenario process actually selects that option — do not assume it.
- No change to account lockout (ADR-0019) or idle-timeout (ADR-0020)
  behavior — those are already-closed, separate mechanisms.
- No change to DPAPI/SQLCipher key handling, `src-tauri/src/crypto/`, or
  `src-tauri/src/db/` — this is entirely LIKHA's own app-level auth,
  unrelated to the Windows-OS-level key-recovery question in ADR-0044.
- Does not touch Wave 5 Sync or the raw-database backup/recovery
  question — both remain open, separately tracked candidates.

**Risks:**

- A School Head could abuse admin-reset to lock a teacher out of their
  own account against their will — mitigated by the audit-log entry
  (visible, attributable) and by this already being true of the
  School-Head-manages-all-teachers'-data authority model the user already
  confirmed (`PRODUCT-CONTRACT.md` §3); not a new risk class.
- If the reset sets a School-Head-chosen password directly, the School
  Head learns the teacher's new password — worth explicitly deciding in
  the scenario process whether a forced-change-at-next-login flag is
  worth the added scope, rather than silently accepting or silently
  rejecting it.

**Privacy/authorization boundaries:** target account resolution must
independently re-verify `school_id` server-side (never client-supplied);
capability check must use the existing `authorize_capability` gate
unchanged; no new privilege tier; synthetic data only in tests/fixtures
as always.

**Evidence requirements before implementation:** none outstanding — RBAC,
Argon2id, the audit-log table, and the school-scoping pattern all already
exist and are already tested. This is the key difference from the
research-blocked candidates above.

**Acceptance checks:** `npm run quality:full` green; new command-boundary
tests green; independent security review dispatched (this is an
auth-touching milestone per `.claude/rules/security-privacy.md` — not
optional); `npm run harness:verify` still 100/100; the new command present
in `invoke.ts`'s exemption set (verified by test or explicit code review,
not assumed).

## Current overall LIKHA 0.2 completion percentage

Using this project's own authoritative Wave 0-7 sequencing
(`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`) as the
denominator, since it is the only durable, repository-recorded roadmap
covering the full product:

| Wave | Scope                                                                                                               | Status                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Repository truth + roadmap reconciliation                                                                           | Complete                                                                                                                                |
| 1    | RBAC + curriculum versioning + school branding                                                                      | RBAC ✓, curriculum versioning ✓, school branding not started (`PRODUCT-CONTRACT.md` §8: "HYPOTHESIS, no code exists yet") — roughly 2/3 |
| 2    | Learner Core: search, section editing, roster export, bulk import/reconciliation, learner photo, enrollment history | All shipped except learner photo (`PRODUCT-CONTRACT.md` §5: "Remaining scope includes learner photo") — roughly 5/6                     |
| 3    | Authoritative-template Form Engine (one representative form)                                                        | Not started — only the disclosed-CSV half exists                                                                                        |
| 4    | Teacher Load + Class Schedule foundation                                                                            | Complete for its own defined foundation-plus-representative-proof scope (ADR-0039, Waves 2Y-3C)                                         |
| 5    | Sync + cloud auth + session hardening                                                                               | Not started — no ADR, no code                                                                                                           |
| 6    | Teacher Creation Studio + Android critical workflows                                                                | Not started                                                                                                                             |
| 7    | Cross-app finish/accessibility/performance/regression gate                                                          | Not started as a formal closing gate (though every wave runs its own verification continuously)                                         |

Rough arithmetic mean across the 8 waves (100+67+85+0+100+0+0+0)/8 ≈
**44%** of the originally-planned Wave 0-7 roadmap. This is a coarse,
evidence-derived estimate, not a precise metric — do not quote it as
more exact than "roughly two-fifths of the planned roadmap."

**Not counted in that denominator**: the entire Subject Attendance +
Section Advisory feature line (Waves 2V-3G) — a full additional,
owner-supplied feature line delivered, reviewed, and verified outside
the original 8-wave plan. Counting it would raise the true delivered-value
percentage somewhat above the roadmap-coverage number alone, but there is
no repository-recorded formula for weighting an out-of-plan feature line
against the original plan, so it is disclosed separately rather than
folded into one invented composite number.

## Current mock-pilot readiness percentage

Two distinct readiness questions, kept separate per
`.claude/rules/security-privacy.md`'s own PII gate list:

- **Windows-only, synthetic-data, facilitator-guided mock/UAT pilot**
  (no real learner PII, CSV-form output accepted as sufficient for
  workflow feedback): the core teacher-daily-use surface (attendance,
  sections, class records/grading, learner records, forms as disclosed
  CSV, RBAC, audit log, session hardening) is built, tested, and mostly
  independently reviewed. Roughly **55-65%** ready in the sense of
  "a facilitator could run a structured mock session today without
  hitting a missing-core-workflow wall" — held back mainly by the
  still-open UX/accessibility review debt (candidate #9 above) and the
  newly-identified password-reset gap (a mock pilot with real
  participants would hit the same "forgot password, no recovery" wall).
- **Production readiness with real learner PII**: substantially lower,
  roughly **20-25%**, gated by items `.claude/rules/security-privacy.md`
  and `PRODUCT-CONTRACT.md` §16 both name as prerequisites and that
  remain open: no safe key-recovery/backup path (candidate #10), Android
  secure key storage not started (Android not started at all), and the
  general independent-review debt (candidate #9) not yet closed.

Both figures are this session's own reasoned estimate from repository
evidence, not a previously-recorded metric — treat them as directional,
not authoritative.

## Recommended exact Wave 3N implementation prompt

```
Execute exactly one bounded LIKHA implementation wave: Wave 3N —
Admin-Assisted Password Reset.

Read docs/product/WAVE-3H-DECISION.md in full first — it is this wave's
scope contract. Read docs/CURRENT-HANDOFF.md and docs/ACTIVE-PLAN.md for
current state.

1. Run this project's own 10-scenario decision process for the exact
   reset mechanism (School-Head-sets-new-password-directly vs.
   generates-a-temporary-password-with-forced-change-at-next-login vs.
   the other options WAVE-3H-DECISION.md lists). Record the decision as
   a new ADR.
2. Implement exactly the "In scope" list from WAVE-3H-DECISION.md's Wave
   3I section: the new capability-gated Rust command, the audit-log
   event, the invoke.ts exemption-set addition, the School Head UI
   affordance, and the command-boundary tests it names.
3. Respect every item in that section's "Non-goals" list — do not build
   self-service reset, do not touch DPAPI/SQLCipher/crypto code, do not
   touch lockout/idle-timeout, do not touch Sync or backup/recovery.
4. Dispatch an independent security review before marking this complete
   (auth-touching milestone, not optional per
   .claude/rules/security-privacy.md). If the reviewer harness fails,
   follow the established self-review-substitute + retained-debt
   protocol in .claude/rules/autonomous-development.md — do not treat it
   as an automatic stop.
5. Run the "Acceptance checks" WAVE-3H-DECISION.md's Wave 3N section
   lists. Record real results only.
6. Update docs/CURRENT-HANDOFF.md, docs/ACTIVE-PLAN.md,
   docs/PROJECT-MEMORY.md, docs/VERIFICATION-DEBT.md, and
   docs/product/PRODUCT-CONTRACT.md §13 as appropriate. Produce the wave
   completion report and relay it per CLAUDE.md.
7. Identify the exact next slice (re-evaluate fresh — do not assume the
   Wave 3H runner-up is still correct without checking) and stop.
```
