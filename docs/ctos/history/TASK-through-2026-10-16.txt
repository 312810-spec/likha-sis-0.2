# Current task — CTOS v3

## Current slice — M11 assigned-subject coverage

Read `docs/ctos/checkpoints/m11-assigned-subject-coverage-2026-10-16.md`.
PR136 calendar build repair is pushed; require its exact-head Quality/Security.
The next slice includes configured assignments in annual SF5/SF6/SF10 subject
lists so an assigned subject without records cannot disappear from completeness.
SQL checks passed; native tests/format/Clippy await CI. Then continue versioned
required-subject/policy reconciliation and immutable issuance/amendments.
M10/M11 and external acceptance remain incomplete. No deployment.

## Current active slice — M11 annual calendar scope

PR135 is merged as `7aa4790d22dd97a88a2a8f9ef22ac4f3816f95ff`.
Read `docs/ctos/checkpoints/m11-annual-calendar-scope-2026-10-15.md`.
SF5/SF6 now require real configured calendar bounds instead of guessed roster
windows; lookup errors propagate. Native tests/format/Clippy await exact-head CI.
Next: source-aware annual reconciliation and issuance/amendments. M10/M11 and
external acceptance remain incomplete. No deployment.

## Current active slice — M11 configured annual-period coverage

PR134 merged as `9961a7c59a2f37a9b24f9f3f90086a36c0ac55ae` after current-head
Quality/Security passed. Read
`docs/ctos/checkpoints/m11-configured-period-coverage-2026-10-15.md` next.
New shared SF5/SF6/SF10 guard requires exact nonempty configured period coverage
and a single canonical subject identity. Duplicate transfer or same-name subject
ambiguity stays unavailable/PENDING. Native regressions await exact-head CI;
configured coverage is not official completeness or issuance authorization.
Next: source-aware annual reconciliation, issuance/amendments. M10/M11 and
external acceptance remain incomplete; no deployment.

## Current active slice — M11 final-projection completeness repair

PR133 passed Quality/Security at `82c139e0b1ec0a3cb4c7d4cdedfe9741e321b9ea`
and merged as `ec4fbe25bc36e35212d99f1b0ef75d68e56040a7`. Active branch:
`ctos/m11-final-projection-completeness-20261015`; read
`docs/ctos/checkpoints/m11-final-projection-completeness-2026-10-15.md` next.
Inspection found SF5/SF6/SF10 aggregation accepting `Some(grade)` even when
`grade.complete` was false, contrary to the local grading contract. All three now
use one eligibility/average helper that returns unavailable for any missing or
provisional supplied term, preserving existing PENDING/no-average semantics.
Complete supplied terms preserve rounding; empty/missing is not zero-filled.
This is a cross-form projection consistency repair, not proof that every required
period exists or any grade is professionally approved. No grading policy, schema,
authorization, raw score or official-source status changed. Require exact-head
native Quality/Security before merge. Next finish required-period/source-aware
reconciliation and issuance/amendment implementation; existing readiness fingerprints
must not be reused as annual-form or issue authorization. External official-source,
device and professional acceptance remains parked; M10/M11 incomplete. No deployment.

## Current active slice — M11 retained-review freshness viewing

PR132 passed Quality/Security at `03e7bcfa22436854c3255d9034ec67293b683edb`
and merged as `981204d11d528bdee7c1d8a17aa6504c1bd0625b`. Active branch:
`ctos/m11-review-freshness-ui-20261015`; read
`docs/ctos/checkpoints/m11-review-freshness-ui-2026-10-15.md` next.
Retained preparation-review details now offer an explicit native input check.
Matches, changed, unsupported, missing and failed evidence remain distinct;
review/draft/record hashes, source protocol, timestamp, non-issuance scope and
unverified fidelity must match the expected contract before display. Results
invalidate on service/review/revision/disabled changes and stale async replies
are discarded. No raw source JSON, write, approval or issuance action introduced.
Local quality 158 files / 1,565 tests, build and preview isolation PASS. Require
current-head applicable Quality/Security before merge; native unchanged from
verified PR132. Next implement issuance-time source/authority validation, immutable
issued snapshots, append-only amendments and cross-form reconciliation in M11.
Official-source, installed-device and professional acceptance remains parked;
M10/M11 incomplete. No deployment.

## Current active slice — M11 native retained-review freshness

PR131 passed Quality/Security at `2c18c34143faf81bb1e6fda5fcda03bf25eff4b6`
and merged as `224f37ef22517d55134c5afd6a7f3d722bfd7e64`. Active branch:
`ctos/m11-review-freshness-20261015`; read
`docs/ctos/checkpoints/m11-review-freshness-2026-10-15.md` next.
Native read-only review source check reauthorizes current access, fetches the exact
school/record/review and verifies its parent/source fingerprint bindings before
reporting current input state in one transaction. Missing review remains distinct
from unauthorized or corrupt evidence. Returned scope is explicitly read-time
preparation evidence, never issue authorization; official fidelity stays unverified.
No raw source JSON or review notes are returned by this check, no data is mutated.
Require exact-head native Quality/Security before merge; no native tests claimed
locally without Cargo. Next expose review freshness, then implement issuance-time
validation, immutable issuance/amendments and reconciliation in M11. External
official-source/device/professional acceptance remains parked. No deployment.

## Current active slice — M11 teacher preparation-review controls

PR130 passed Quality/Security at `0164ceb34d0fb2563b2236a3f08c0336400128d4`
and merged as `205cac2ecb7c029727ffe110f6859a46088d4256`. Active branch:
`ctos/m11-preparation-review-ui-20261015`; read
`docs/ctos/checkpoints/m11-preparation-review-ui-2026-10-15.md` next.
Each retained draft offers an explicit input check, bounded notes, preparation-only
confirmation and retained review history. Actual native write revalidates current
authority and fingerprints. Confirmation resets on notes/context/revision changes;
unsaved notes survive revision changes within the mounted draft. Uncertain writes
are never automatically retried and remain blocked in that mounted draft view;
history resolves only the exact request/fingerprints/notes. Latest-50 absence is not
proof of no write. Review is not approval, professional acceptance or issuance.
Require current-head applicable Quality/Security before merge. Native code is
unchanged from verified PR130. Next implement issue-time revalidation, immutable
issuance/amendments and cross-form reconciliation; continue remaining milestones.
Official-source, installed-device and professional acceptance remain parked;
M10/M11 incomplete. No deployment.

## Current active slice — M11 native preparation-review evidence

PR129 passed Quality/Security at `39837c076e2c84969497bd097a563b0d5753e458`
and merged as `bbe47574b8a193e5058e6e7a00c0f3c03a19d4b1`. Active branch:
`ctos/m11-preparation-review-20261015`; read
`docs/ctos/checkpoints/m11-preparation-review-2026-10-15.md` next.
Explicit confirmed review writes require current scoped authority and exact draft
and source fingerprints, revalidated in the write transaction. Events retain
native actor/time and immutable notes; identical requests return the original
event, altered reused identities fail. Review history reauthorizes each read.
This records preparation review only, even for incomplete evidence; no grade
approval, issuance, professional acceptance or official-source verification.
Require exact-head native Quality/Security before merge. Next implement explicit
review UI, then issue-time revalidation, append-only amendments and cross-form
reconciliation. External source/device/professional acceptance remains parked;
M10/M11 incomplete. No deployment.

## Current active slice — M11 readiness input evidence viewing

PR128 passed Quality/Security at `03f221281258ef6ed80317872011216737456aaf`
and merged as `5885032d1b66e8b0943f86eda42d38dc4b3c9bdd`. Active branch:
`ctos/m11-source-check-ui-20261015`; read
`docs/ctos/checkpoints/m11-source-check-ui-2026-10-15.md` next. Each retained draft
offers an explicit native source check. Matches, changed inputs/implementation,
legacy absence and unsupported protocol remain distinct; no raw learner input JSON
crosses IPC, no write/review/approval occurs. A match is read-time evidence only.
Require applicable verified-head Quality/Security before merge. Next implement
atomic native review/issue with actual user confirmation and issue-time source
revalidation, then append-only amendments and cross-form reconciliation. Never
authorize issuance from this UI verdict or legacy/unsupported evidence. M10/M11
and official-source/installed-device/professional acceptance incomplete. No deployment.

## Current active slice — M11 native readiness source fingerprints

PR127 passed Quality/Security at `b3b93011267272aeb63bcb802ec618ae221825b8`
and merged as `1bac457279eb7ce7d2a9dc4bc60ca3eb35933f8c`. Active branch:
`ctos/m11-source-lock-20261015`; read
`docs/ctos/checkpoints/m11-source-lock-2026-10-15.md` next. New drafts atomically
retain raw readiness inputs and exact implementation/dependency/schema identity.
Legacy drafts have no backfilled lock. Native read-only checks verify integrity
and current authorization; matches/changed/legacy/unsupported are distinct.
This is not an atomic issue authorization or official-source approval. Require
exact-head native/Security gates before merge. Next expose source-check evidence,
then implement atomic native review/issue behavior, append-only amendments and
cross-form reconciliation. Unavailable official-source, installed-device and
professional acceptance remains parked; M10/M11 incomplete. No deployment.

## Current active slice — M11 comparison viewing

PR126 passed Quality/Security at `754773336d2c696ddedcbe3616bb816f9cfddfbc`
and merged as `f238142642aac214340d384b792086957e03dff5`. Active branch:
`ctos/m11-draft-comparison-ui-20261014`; read
`docs/ctos/checkpoints/m11-draft-comparison-ui-2026-10-14.md` next. Teachers can
explicitly compare a retained draft with current projected evidence; identity/hash,
scope/fidelity and result consistency checked, stale results dropped. This performs
no writes or review/approval. Require applicable exact-head Quality/Security gates
before merge. Next: full source-input locking and atomic native review/issue
semantics, append-only amendments and cross-form reconciliation. Projection matches
must never substitute for source freshness or professional approval. Official
sources, installed-device and professional acceptance remain pending. No deployment.

## Current active slice — M11 retained/current projection comparison

PR125 passed Quality/Security at `bf2b2fcd76abafdf0cfa446baf97f9b2c548e71c`
and merged as `26925df1662770213a681c242d4f01f32fbdece0`. Active branch:
`ctos/m11-draft-freshness-20261014`; read
`docs/ctos/checkpoints/m11-draft-comparison-2026-10-14.md` next. Native read-only
comparison reauthorizes the exact draft and verifies its stored hash, then compares
current projected evidence excluding only checkedAt. It is explicitly NOT a
raw-source lock, professional review or issuance clearance. No source-input lock
has been implemented; identical projected grades can mask changed raw scores.
Require exact-head native/Security gates before merge. Next wire comparison UI,
then complete full source-input locking and review/issue/amendment semantics and
cross-form reconciliation. External acceptance still parked; no deployment.

## Current active slice — M11 teacher-facing retained drafts

PR124 passed Quality/Security at `aad6bbaec035b4ed00149f6e52803d79c76ef02b`
and merged as `1d9669e85fb84ccc5ee04430781c03d584e55cde`. Active branch:
`ctos/m11-report-draft-ui-20261014`; read
`docs/ctos/checkpoints/m11-report-draft-ui-2026-10-14.md` next. Explicit native
capture requires fresh draft-only confirmation; retained history shows native
snapshot evidence without recomputing. Failed/interrupted capture may already
have persisted; inspect history before another capture. No automatic retries,
professional review or issuance. Require exact-head applicable Quality/Security
before merge. Next: reviewed issued-snapshot/amendment lifecycle with stable
source-freshness rejection, then cross-form reconciliation. Official sources,
installed-device and professional acceptance remain pending. No deployment.

## Current active slice — M11 immutable preparation drafts

PR123 passed Quality/Security at `9c470f7acba1c97cfff0970cfaf901b783b92b7b`
and merged as `105e7c6b7cfeee2787d62d0efd5275bc4a3c6d53`. Active branch:
`ctos/m11-report-drafts-20261014`; read
`docs/ctos/checkpoints/m11-report-drafts-2026-10-14.md` next. Native preparation
drafts capture current server-derived JSON, hash, actor/time and explicit draft
stage. History reads reauthorize and verify integrity without recomputing grades.
No client payload, professional review or issuance is accepted. Require exact-source
native/Security gates before merge. Next: teacher-facing draft capture/history,
then reviewed issued-snapshot/amendment lifecycle with source-freshness rejection
and cross-form reconciliation. Do not claim M10/M11 complete; M10 external acceptance parked.
Official sources, installed devices and professional acceptance remain pending.
No deployment.

## Completed prior slice — stored source integrity

PR117 passed Quality/Security at `a521f0ec55030d79e847f2622783e6414896010d`
and merged as `10b189d26217de06e2d1397fd1b1ccbd2f6ee141`. Active branch:
`ctos/m10-source-integrity-20261014`; read
`docs/ctos/checkpoints/m10-source-integrity-2026-10-14.md` next. Source metadata
reads and links verify stored bytes against their hash; the teacher can inspect
file identity without an official-approval claim. Require exact-source gates before
merge. Next: declared term/cohort applicability and durable draft-review lineage.
Device, official-source and professional acceptance remain pending. No deployment.

## Completed prior slice — local planning-draft review

PR116 passed Quality/Security at `aa9eeb5cf26191ccc90d241c253cce07b3e8b974`
and merged as `c2ccb996890474051c72e57e1fbd53c8792c7212`. New branch:
`ctos/m10-draft-review-20261014`. Read
`docs/ctos/checkpoints/m10-draft-review-2026-10-14.md` next. This is offline
teacher-pasted staging/review/application only, not live AI generation or durable
AI provenance. Require exact-source applicable Quality/Security before merge;
local Chromium crashes before execution. Continue declared term/cohort rules,
source verification workflow and durable review lineage. No deployment.

## Completed prior slice — classroom lesson origin

PR115 passed Quality/Security at `ffd647800f57aaa09d39b86ee0ea372aa236f0e7`
and merged as `30cfd9df08072d83c331b5ab000e0ba74a71f50b`. Classroom lesson
origin is the next isolated slice on `ctos/m10-classroom-lesson-origin-20261014`.
Read `docs/ctos/checkpoints/m10-classroom-lesson-origin-2026-10-14.md` next.
Require exact-source Quality/Security before merge. Continue provider-independent
teacher-confirmed AI draft ingestion next; live generation needs the deferred
provider/privacy decision. Official-source and installed-device acceptance remain
pending. No deployment.

## Active slice — exact lesson source ingestion

PR114 passed exact-head Quality and Security and merged as
`e5f4c74c11dd6a81ce15278ae68b39f6e4614459`. The next isolated M10 slice is on
`ctos/m10-source-ingestion-20261014`: exact PDF/DOCX/XLSX bytes, SHA-256 integrity
identity, authenticated actor/time, same-school deduplication and a school-scoped
link from the declared source reference. Read
`docs/ctos/checkpoints/m10-source-ingestion-2026-10-14.md` next.

This evidence identifies exact bytes only; official approval, applicability and
competency accuracy remain unverified. Require exact-source Quality/Security before
merge, then continue teacher-confirmed AI drafts and classroom linkage. No deployment.

## Completed prior slice — source provenance amendments

PR112 merged as `c18383d442af3bd3cdbbe80b15605eab68ff19a9` from verified
head `f9f3ae82c6a05c6dcf47f2f0912a97b857b3e7d7`. PR113 passed Quality
and Security at `240c97ad125c0e396a20e318e246c99b0b8bcfb1`, then merged as
`4c365f117846ad1bd724d5189816f97676a9d794`.

The next slice is implemented through `7f9909788e3cff97c8021c67750c940087bf8893`:
append-only lesson source corrections preserve previous/new metadata, reason,
authenticated teacher and timestamp. Read
`docs/ctos/checkpoints/m10-source-amendments-2026-10-13.md` next. It is reconciled
to main at `58d554997fe228b5dcc5386023b9090b096e2184` without changing the
candidate tree. Publish with an expected-head lease and require exact-source
Quality/Security before merge.

## Current continuation — 13 October 2026

PR111 merged as `6725ed6998299e05a3fe5ad78934c74c8d61cc95` from
`aeb517e5985e9cc6bd7d43f6e6e9c9ce296f9998` after Quality/Security PASS.
PR112 merged as `c18383d442af3bd3cdbbe80b15605eab68ff19a9` from checkpoint
head `f9f3ae82c6a05c6dcf47f2f0912a97b857b3e7d7` after exact-head gates passed.

PR113 adds teacher-declared source subject/year scope with canonical native mismatch
rejection, retained drafts, immutable saved scope and truthful unknown/declared
labels. See `docs/ctos/checkpoints/m10-source-scope-2026-10-13.md`. Its child adds
append-only provenance amendments; see the active-slice checkpoint above. After both
pass exact-source CI and merge in order, continue verified source ingestion and
teacher-confirmed AI drafts. Term/cohort authority, approved sources, installed-device
evidence and professional acceptance remain external. Broader batches B–G are
incomplete; no deployment.

## Latest continuation — FORGE audit implementation completed, 12 October 2026

All F01–F16 source fixes and bounded Review/encrypted classroom recovery/provenance/shared-token enhancements are implemented and verified. PR #107 merged to main as `a46eba68f3ca36843d9f8bc34ee844993f9348c8`; verified head `684d2c0`, source tree `67d5b2c06e2f88fa223bab37067c5673083c7e88`. Read `docs/ctos/checkpoints/forge-audit-implementation-2026-10-11.md` first.

Quality Gate `38181491187` and Security Gate `38181491210` passed. Frontend: 149 files / 1,441 tests; responsive UI and 49 recovery checks pass. Ubuntu: Rust formatting, 1,452 native tests (1,247 unit + 205 integration), Clippy with warnings denied pass. Windows: app/installer build, 1,461 native tests (1,256 unit + 205 integration), installer artifact upload pass. Security: cargo-deny, gitleaks, osv-scanner pass. Local production build and preview isolation pass. No production records changed and no deployment performed.

Next acceptance work: installed Windows teacher journeys and upgrades/import/export/backup/printing; real two-device assignment changes and backfill; Android Keystore/encrypted startup/process death; manual screen-reader and teacher acceptance. These remain untested and are separate from the completed automated audit implementation. Resume the broader CTOS/M09 work below only as its own task; do not redo this audit or mass-merge historical branches.

Updated: 2026-10-08.

Use CTOS.md as the controlling plan. Current development milestone: **M10 — Curriculum, BOW, Teaching Flow, ILAW**. M09 is complete with applicability deferred to M10.

Read CTOS.md, CTOS-STATE.md, docs/ctos/FORGE-V3-ADAPTER.md, and AGENTS.md before the historical baseline below. Do not mass-merge historical branches and do not convert unverified evidence into readiness claims.

## M05 — Class Folio: COMPLETE (PASS, tag `ctos-m05-complete`)

Five of the six required properties already held and are named with real tests;
one did not, and it is the one the acceptance clause names. The grading period and
DepEd weighting were blanked on every mount of `ClassRecordJourneyScreen`, and the
Class Folio remounts whenever the teacher moves between Dashboard, My Classes and
Class Record — so the term was re-asked every time. They are now held in App
session state keyed by the assignment and recalled on the next visit.

The recall is revalidated rather than guessed: a grading period the school no longer
publishes falls back to an explicit choice instead of being clamped onto whichever
period happens to be first, which is what keeps the recall from silently meaning a
different term. The class record id is still re-derived on every visit, so a deleted
record is never silently restored and a matching record is reopened rather than
duplicated.

Also corrects an M04 evidence claim: **`format:check` was not actually clean at the
`ctos-m04-complete` tag.** Two M04 case files failed Prettier — a table not
re-padded after a row was added, and `*emphasis*` that Prettier writes as
`_emphasis_`. The M04 code, test and lint gates were real and unaffected (1,331
Rust / 1,257 frontend tests), but the checkpoint's "all five gates pass" was wrong
for that one gate. Both files are formatted in the M05 commit.

133 files / 1,261 tests (the delta from M04 is exactly the four new tests); zero axe
findings. See `docs/ctos/checkpoints/m05.md` and `docs/ctos/evals/folio-cases.md`.

## M04 — Today: COMPLETE (PASS, tag `ctos-m04-complete`)

Seven of eight verification items met. Three needed real implementation: the next
class is now derived in Rust (first sorted meeting at or after `now_time`, with a
"Next up" marker making it one action), `has_any_assignments` separates "not assigned
to any class" from "no classes today", and a pending assignment reads as an assignment
with no `schedule_meetings` — computed from existing data, with no new table or status
column, surfaced in the attention rail with no action button because no scheduling
screen exists yet. Three more (no classes today, unfinished attendance, returned
review) were already implemented and re-verified.

Two things recorded rather than claimed. **Stale offline schedule is `Unknown`:**
`schedule_meetings` is absent from the sync allowlist, so a stale schedule has no
transport to arrive through — that is M13's scope, and no freshness timestamp is
shown because none exists to show honestly. And the investigation found a real
staleness bug the item list does not name: `ClassWorkspaceScreen` renders inside
`MyDayScreen` without a tab change, so returning from it never remounted and the
attention rail kept showing an item the teacher had just cleared. `onBackToToday` now
re-fetches, mirroring `ClassRecordsScreen.handleBackToList`.

1,331 Rust tests (delta from M02 is exactly the six new `my_day` tests) and 1,257
frontend tests; zero axe findings. See `docs/ctos/checkpoints/m04.md` and
`docs/ctos/evals/today-cases.md`.

## M03 — CTOS design system: COMPLETE (PASS)

Four structural gaps fixed: a typography and spacing scale derived from their
bases (so density now rescales all type, not just body text), three duplicate
table definitions consolidated into one `.ledger` primitive, six ad-hoc
breakpoints collapsed onto three sanctioned widths, and the shared copy
vocabulary in `src/ui/theme/copy.ts`. The one missing component — a React error
boundary, of which `src/` had none — is added and wraps the tab switch, so a
render failure no longer takes down the shell and navigation.

`emptyCopy` was drafted and removed: all 45 `<EmptyState>` call sites carry real
context a generic string would discard, so the module ships no entry it cannot
justify. The regression fixture is a ten-test static token guard
(`scripts/design-tokens.test.mjs`), deliberately not a pixel baseline — the repo
has no image-comparison dependency, and pixels are not the property CTOS names.

Accessibility is provably intact: the real-browser smoke ran after the refactor
and reports zero axe WCAG A/AA findings across four widths × both appearances ×
three densities, with a no-horizontal-overflow assertion at every width. See
`docs/ctos/checkpoints/m03.md`.

## M02 — Work access and session integrity: COMPLETE (PASS)

One real defect fixed (`auth::login` left a zombie session on account switch);
the other eight items were proven rather than built — recorded work transfers on
reassignment by construction, and the sync queue is school-scoped by design.
See `docs/ctos/checkpoints/m02.md` and `docs/ctos/evals/access-cases.md`.

## M01 — Academic trust: COMPLETE (PASS, tag `ctos-m01-complete`)

Closed with `ComputedTermGrade.complete`: a provisional grade is now visibly
provisional on screen and in both exports. All seven verification items have
executable tests. See `docs/ctos/checkpoints/m01.md`.

## M06 complete — PASS

Outcome: LIKHA supports the actual teaching session rather than only post-class
administration.

Required: start/finish session, actual occurrence state, attendance, current learning
target, quick evidence, notes, learner follow-up marker, summary/review.

Acceptance: planned, changed, cancelled, and delivered occurrences remain
distinguishable — met by a test rendering all four status chips side by side.

What was actually built this milestone: `ClassroomModeScreen` (the §6.3 cockpit) and
the navigation handoff into it from `ClassWorkspaceScreen`, plus the conformance and
verification record. The occurrence stack — Rust repository, ten Tauri commands,
migration 0043, TypeScript domain/port/service/adapter — was already present and
uncommitted in the working tree, and is claimed as verified here, not built here.
Four real defects were found and fixed in the new screen (save loop, blank-slot
deviation, escaped throw, duplicated status text); details in the checkpoint.

Verification: 135 files / 1,284 frontend tests; 1,362 Rust tests; `cargo fmt --check`
and `cargo clippy --all-targets -- -D warnings` clean; `npm run quality:ui` zero axe
findings. See `docs/ctos/checkpoints/m06.md` and `docs/ctos/evals/classroom-cases.md`.

## M07 complete — PASS

Outcome: attendance and scoring are fast enough for real daily use without
sacrificing academic meaning.

Of CTOS.md §M07's thirteen verify items, ten were already implemented and are
re-verified and named in `capture-cases.md`. Three were partial and are what this
milestone closed:

1. **Keyboard attendance.** `SubjectAttendanceScreen` — the surface Classroom Mode
   routes into when attendance is unsettled — had arrow keys but no letter shortcuts;
   it now takes `P`/`A`/`L`/`E`. Neither roster advanced focus after a mark, so a
   keyboard session cost two keystrokes per learner. `handleMark` now returns
   `Promise<boolean>` and focus advances only on success, so a failed save leaves the
   teacher on the row that needs them.
2. **Tab in the score grid.** Native Tab left the grid for the row's Excused/N/A
   buttons. Tab now commits and moves to the next learner, Shift+Tab moves back up,
   on the reason input as well.
3. **Correction history.** The append-only lineage and its whole read stack existed
   since M01, but nothing called `correctionHistory` outside tests — a teacher could
   correct a score and give a reason, then had no way to see any of it back.
   `ScoreCorrectionHistory` is that surface, fetched on expand so a class of forty
   pays zero queries until one is opened.

Author names in the lineage are resolved at the repository by a double
`LEFT JOIN users`, following the `audit_log.actor_username` precedent — never
client-supplied. The schema's non-cascading `REFERENCES users(id)` means the join
cannot be orphaned; a test asserts the DELETE is rejected.

Two defects found and fixed: `setState` in an effect body (rejected by
`react-hooks/set-state-in-effect`; the reset moved to the toggle handler, which is
also where the immediate "Loading…" feedback belongs), and `getByText` unable to
match text spanning an element boundary — the change line renders
`15 → <strong>19</strong>` as separate text nodes, so the tests read the paragraph's
`textContent` instead.

Verification: 136 files / 1,301 frontend tests (up from 135 / 1,284 — exactly the 17
new tests); 1,364 Rust tests (up from 1,362 — exactly the two new lineage tests);
`cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` clean;
`npm run quality:ui` zero axe findings. See `docs/ctos/checkpoints/m07.md` and
`docs/ctos/evals/capture-cases.md`.

Deliberately out of scope: the class-record `markFinal` state machine, which
`grading-cases.md` assigns to M11. "Fast" is claimed as interaction shape (one
keystroke per learner, no per-row fetch), not as a measured latency.

Historical next action (superseded by the M09 checkpoint): execute M09. Current next action: M10. The
M04-recorded duplicated schedule read path remains deliberately untouched and is still
open as a risk; M09 is the natural milestone to reconcile it, since it owns the
scheduling surface.

---

# Historical baseline retained for evidence

# Current task

Updated: 2026-10-03.

## Goal

Make the Windows teacher app manageable and establish a real Android path.
Use current stable tools and preserve teacher work during sync failures.

## Restored implementation

- Full-queue entity conflict checks.
- Retained encrypted rejected incoming records and explicit human review.
- Atomic pull application/version/cursor updates and atomic review resolution.
- Clear local-save vs hub-transfer status with manual/foreground refresh.
- Correct camelCase preview serialization and selected extra entity previews.
- Platform key-store adapter boundary; Android is still unsupported.
- Latest stable npm/Rust dependencies and Windows installer artifact CI.

## Verified on restored source

- Latest Node 26.10/npm 12.2 frontend quality: 126 files, 1,184 tests pass.
- Playwright 1.63 / Chrome Headless Shell 153.0.8010.12 workflow and accessibility
  smoke passes, zero findings. Exact bundled browser fetched from official Google
  storage when the CDN download was unreliable.
- Full native Rust tests pass, including integration suites; new key reopen,
  failed-key preservation and legacy Argon2 hash regressions pass.
- Rust formatting and Clippy all-targets with warnings denied pass.
- Security CI is green after updating the vulnerable brace-expansion dependency.
- Windows installer build/native tests/artifact upload run in PR101 CI.

## Remaining work

Check final Windows CI and exercise its installer on a Windows device.
Implement real Android Keystore/startup integration before claiming Android use.
Portable encrypted backup/recovery is implemented in the Devices and first-run screens.
Installed-device recovery and upgrade tests are pending; Android remains unsupported.
See docs/PORTABLE-BACKUP.md for the format, scope and replacement-device workflow.
The teacher pilot guide is docs/MANAGEABLE-APP.md.

Application edits and test checkpoints are now saved on PR101. The first workspace
reset is recorded as history; verification above was rerun on restored source.

## Portable recovery checkpoint

- Password-protected SQLCipher snapshot includes committed WAL records and schema version.
- Destination keys are freshly generated/reprotected; existing installations are not overwritten.
- Full backup requires School Head authority in every school on the installation.
- First-run recovery is staged and selected on full restart; client sync requires re-enrollment.
- Focused UI tests pass; full frontend suite: 128 files / 1,192 tests.
- Native full suite: 1,099 Linux unit tests plus integration suites pass.
- Browser workflow/accessibility smoke passes with zero findings.
- Formatting of changed files, native formatting and Clippy are checked.
- Local whole-repo formatting encounters a pre-existing uncommitted change in
  docs/SOURCE-REGISTRY.md; it is preserved and excluded from this checkpoint.
- Windows CI must verify DPAPI recovery and build refreshed test installers.

## Approved school class folio redesign

Branch: `design/premium-school-ui-20261003`, based on main through PR101; draft PR102.
The owner requested complete concept fidelity using Prompt Master to establish the
frontend engineer role first. The brief is in docs/design/class-folio.

Dashboard now lists authorized subject assignments beside a worksheet with
Overview, Scores, and Forms. The real grading journey is embedded and preserves
work across worksheet tabs. Desktop has six primary destinations; phone has
Today, Classes, Forms, and Account. School Forms and Calendar use existing real
services. More preserves specialized management tools and the daily planner.
Global school theme includes remembered Light/Dark/System; appearance, density,
and sign-out are in Account. Official advisory attendance stays separate from
subject records. Login starts on Dashboard.

Two independent design/workflow reviews found and resolved the local Back-to-class
no-op, retained login destination, and tab-switch draft loss. Actual screenshots
and implementation boundaries are in docs/design/class-folio/README.md and
ADR-0073. Core frontend quality: 132 files / 1,225 tests pass. Browser checks cover
both appearances, three densities, four widths, context and navigation, with zero
WCAG A/AA findings. Production build and dev-preview isolation pass.

Next release check: exercise the complete redesigned workflow, keyboard use, and
appearance in the installed Windows app. Native Android remains unsupported
pending the native work above. Production is not deployed by this redesign.

## Class folio detail refinement

Continued on the same isolated design branch and draft PR102. The refinement adds
stable keyboard focus in embedded Scores, an announced selected class, a sticky
bounded desktop class index, density-aware reading text, and a bounded Account
panel with a close control. Scoring now has draft-preserving assessment disclosure,
aligned assessment/actions, spaced exports and immediate completion/protection
feedback after score save. Open class record reuses an exact existing match;
multiple matches require teacher choice. Grading rules/native authority are unchanged.

Updated actual desktop/phone/light/dark scoring captures are in the design folder.
Full frontend quality passes: 132 files / 1,233 tests. Production build and
dev-preview isolation pass. Browser smoke covers both appearances, all three
densities and four widths, actual keyboard scoring, sticky index and short-screen
Account, with zero axe WCAG A/AA findings. Independent review caught and resolved
a delayed-save focus leak across class changes.
Next release check remains the installed Windows app workflow. No deployment or
native Android support is implied by browser refinement.

## FORGE UI + UX implementation checkpoint — 2026-10-11

Latest owner instruction: continue audit and verified fixes; do not provide screenshots.
The reconstructed audit implementation is local `1d1edc5`, remote equivalent
`8529094ef1ed1545eb3a823a0cb9da8454e0c47f`, isolated
`recovery/forge-ux-20261010`. Fetched source trees match exactly. Main is not merged.

14 findings implemented: token cycles; truthful confirmed-write/refresh/marker
recovery; scoped drafts; lesson stale-context/late-write protection; boot retry;
private-safe keyed boundary; field read retries; planner operation-specific labels
and confirmations; local dates; real Today routing; source-fresh score/assessment
and SF1 review recovery; confirmed-only idle expiry; responsive shared fields.
Current evidence: 146 files / 1,396 tests; frontend quality, core browser,
49 recovery browser checks, production build and fixture-isolation all pass.
See docs/ux/FORGE-UI-UX-Audit-2026-10-11.md and docs/ux/VERIFICATION.md.

Next pending acceptance: installed Windows exact-source native flows, manual
assistive-technology/teacher-school-head review, then native durable drafts and
Android acceptance. Browser fixtures do not prove those. Cargo/Rust/Android tools
are absent here. CTOS M10 remains a separate pending milestone; no curriculum,
AI generation quality, official workbook or native readiness claim was added.
