# CTOS — LIKHA-SIS Calm Teacher Operating System Master Plan

> **Status:** Master execution handoff and autonomous delivery plan  
> **Repository:** `312810-spec/likha-sis-0.2`  
> **Primary executor:** Atria-CC  
> **Plan name:** **CTOS — Calm Teacher Operating System**  
> **Prepared:** 2026-10-05 (Asia/Manila)  
> **Execution style:** continuous milestone delivery with durable GitHub saves, automated verification, checkpoint handoffs, and screen clearing after every completed milestone

---

## 0. Read this first

This file is the controlling delivery plan for the next LIKHA-SIS program of work.

The outcome is **not** “redesign more screens” and it is **not** “finish SF1–SF10 one by one.”

The outcome is to turn LIKHA-SIS into a **Calm Teacher Operating System**:

> A beautifully calm, offline-first teaching workspace that already understands a teacher’s classes, schedule, learners, curriculum, classroom evidence, school responsibilities, and reporting obligations—and quietly turns everyday teaching work into trusted school records.

The teacher-facing golden path is:

```text
LOGIN
  ↓
TODAY
  ↓
OPEN CURRENT / NEXT CLASS
  ↓
CLASS FOLIO
  ↓
START CLASS / CLASSROOM MODE
  ↓
ATTENDANCE + LEARNING EVIDENCE + QUICK NOTES
  ↓
ASSESSMENT / CLASS RECORD
  ↓
REVIEW COMPLETENESS
  ↓
LEARNING SUPPORT WHEN NEEDED
  ↓
REPORT / FORM PREVIEW
  ↓
REVIEWED SCHOOL REPORTING
```

The system underneath may be complex. The teacher should experience calmness, clarity, speed, and trust.

---

# 1. Current live repository truth

Before Atria-CC changes anything, treat the following as the starting evidence and re-verify it from GitHub/local source.

## Main

At plan creation, `main` includes merged PR #102:

- main commit observed: `62447a1e4328a0bba9be7aedb561d1f1c0fb13b4`
- PR #102: premium school UI / assigned class folio refinement
- current design direction: school class folio, Light/Dark/System, teacher density modes, assigned-class worksheet, refined scoring
- existing stack: React + TypeScript + Tauri 2 + Rust + SQLCipher SQLite
- Windows is the primary workstation
- Android is the intended focused classroom companion

## Open integration work

PR #103 remains open and draft at plan creation:

- branch: `codex/complete-plans-20261004`
- observed head: `da680ff7fcb7f347069865112b4f2788b3396b9e`
- purpose: restore/complete scheduling and school workspaces
- it contains valuable unmerged implementation and an existing `HANDOFF.md`
- it was originally based before PR #102 merged, so it must **not** be blindly merged or discarded

The first CTOS milestone must reconcile `main` and PR #103 deliberately.

## Existing project rules to preserve

- no-evidence-no-assertion
- teacher work is local-first; local save is distinct from transfer/sync
- teacher/adviser responsibility is assignment-scoped
- global learner browsing is not granted to normal teachers
- adviser attendance and subject attendance remain distinct
- missing ≠ zero ≠ excused ≠ not applicable ≠ future work
- calculated ≠ complete/final
- historical issued records must not be silently recalculated
- official-looking output is not proof of official acceptance
- real-device proof is required for native readiness claims
- fresh installation starts without invented school records
- unavailable local/official requirements are parked rather than fabricated
- major implementation work is isolated from `main` until verified
- during active work, preserve durable checkpoints and resumable handoffs

---

# 2. CTOS product thesis

The app should feel like a teacher’s intelligently prepared desk.

It should **not** feel like:

- a generic SaaS dashboard
- an ERP
- a wall of KPI cards
- a sidebar containing every possible feature
- ten disconnected school-form applications
- a spreadsheet clone
- an AI chatbot glued onto school records
- a mobile version made by squeezing the Windows screen smaller

## Teacher mental model

For an ordinary teacher, most daily work should resolve through three ideas:

1. **Today** — what needs attention now?
2. **Class** — what is happening with this class?
3. **Review** — what is incomplete, unusual, returned, or ready to report?

Administrative complexity should be progressively disclosed.

## Design character

Target qualities:

- quiet confidence
- fast orientation
- premium without spectacle
- readable for long working sessions
- strong context identity
- excellent keyboard use on Windows
- excellent touch use on Android
- trustworthy save/transfer status
- graceful empty/error/offline states
- minimal repeated choices
- school identity through restraint, not saturation
- motion only when it explains state or continuity

---

# 3. FORGE execution model for CTOS

Use FORGE inside every substantial milestone.

## F — Feed context

Before editing a subsystem:

- inspect current code, tests, ADRs, `TASK.md`, `HANDOFF.md`, and relevant source only
- identify the teacher/admin role and exact workflow
- identify existing invariants and irreversible data risks
- identify the current implemented state versus researched/proposed state
- reuse established decisions rather than reopening them

## O — Outcome, not task

Every milestone must have a measurable teacher/system outcome.

Before implementation write, in the checkpoint draft:

- who is this for?
- what should they be able to do/understand afterward?
- how will we know it worked?
- what constraints cannot regress?

## R — Reverse interview

Do **not** stop the nonstop program for questions that can be answered by:

- repository evidence
- current confirmed project decisions
- official primary documentation
- safe configurable defaults
- synthetic fixtures

If a missing fact is local/authoritative and cannot be inferred, park it with:

- exact missing evidence
- safe interim behavior
- owner/source needed
- reopening condition

Only stop for a truly blocking action requiring external credentials, irreversible production impact, or a decision that changes product intent.

## G — Generate → Grade → Fix

For architecture/UX decisions with meaningful tradeoffs:

- generate three genuinely distinct approaches
- grade them against CTOS criteria
- select/synthesize the best
- implement
- grade the implemented result again
- fix remaining weaknesses before milestone completion

Do not expose private chain-of-thought. Record concise decision rationale and evidence.

## E — Export the win

At each milestone export durable value:

- implemented code
- tests
- updated ADR/spec if architecture changed
- checkpoint summary
- updated CTOS state
- Git commit
- GitHub push
- milestone tag

---

# 4. Autonomous execution contract

Atria-CC should execute CTOS continuously in milestone order.

## Never wait between milestones merely to ask “continue?”

After one milestone is green:

1. save the checkpoint
2. push it
3. tag it
4. update state
5. clear the terminal screen
6. reload the minimum required state
7. begin the next milestone automatically

## Continue past parked dependencies

Examples that must not stop unrelated work:

- current Mandaue form-checking instructions unavailable
- final LIS SF1–SF4 sample unavailable
- official West 1 TANAW dictionary unavailable
- TANAW Lock authority unavailable
- current official eSF7 details unavailable
- SF8 requirements awaiting health coordinator
- actual Tingub roster/schedule unavailable
- real-device test temporarily unavailable

Implement safe configurable/draft paths and keep unsupported claims disabled.

## Do not merge broken work just to preserve it

Checkpoint on the working CTOS branch. Push the branch even when a milestone is in progress, but only tag a milestone as complete when its acceptance gates pass.

---

# 5. Branch and integration strategy

## Long-lived CTOS branch

At M00, create a new integration branch from the **latest verified main**, for example:

```text
ctos/calm-teacher-os-20261005
```

Do not perform the CTOS program directly on `main`.

## PR #103 recovery rule

PR #103 is evidence and reusable implementation, not automatically truth.

M00 must:

1. fetch latest `main`
2. inspect PR #103 commit/file changes
3. classify each relevant change:
   - already superseded by main/PR102
   - compatible and reusable
   - useful but needs adaptation
   - obsolete
   - unverified
4. integrate only compatible/current work into the CTOS branch
5. preserve useful history and `HANDOFF.md` facts
6. do not restore superseded harness/cloud-automation experiments merely because a branch exists
7. rerun tests on the resulting source

Historic branches are not to be mass-merged.

## Risky experiments

Use short-lived child branches/worktrees only for high-risk work such as:

- migrations
- grading policy changes
- sync protocol changes
- native Android key/recovery work
- schedule solver architecture replacement

Merge those back into the CTOS integration branch only after focused verification.

---

# 6. CTOS milestone-save automation

Atria-CC must implement this automation during M00 rather than relying on memory.

Create:

```text
CTOS-STATE.md
docs/ctos/checkpoints/
scripts/ctos/checkpoint.ps1
scripts/ctos/resume.ps1
```

Optional Bash equivalents may be added if useful, but PowerShell is primary for the Windows Atria workflow.

## checkpoint.ps1 required behavior

The checkpoint command should accept at minimum:

- milestone ID
- milestone title
- status: `in-progress` or `complete`
- verification summary or path

It must:

1. verify the repository and current branch
2. refuse accidental milestone commits directly to `main`
3. detect unresolved merge conflicts
4. capture `git status --short`
5. capture current branch
6. update `CTOS-STATE.md`
7. write/update `docs/ctos/checkpoints/<milestone>.md`
8. include:
   - outcome
   - files/areas changed
   - checks actually run
   - result of each check
   - failures/known debt
   - parked dependencies
   - exact next milestone/action
9. `git add` intended milestone work
10. commit with a predictable message, e.g.
    `CTOS M05: complete class folio golden path`
11. push the current branch to GitHub
12. when status is `complete`, create/push an annotated tag:
    `ctos-m05-complete`
13. verify the remote contains the new commit
14. print a compact completion summary
15. persist any useful command/test output before clearing
16. run `Clear-Host` / `cls`
17. return control so Atria can immediately continue to the next milestone

Do not clear the screen before the durable push is confirmed.

## resume.ps1 required behavior

It must:

1. fetch remotes
2. show current branch and HEAD
3. read `CTOS-STATE.md`
4. locate latest `ctos-m*-complete` tag
5. locate latest checkpoint file
6. show dirty state
7. print the exact next milestone
8. never reset or discard dirty work automatically
9. never checkout another branch over uncommitted work
10. stop and explain if repository state is ambiguous

---

# 7. CTOS state format

`CTOS-STATE.md` should stay short enough to read on every resume.

It should contain:

- current CTOS branch
- current milestone
- last completed milestone
- last pushed checkpoint
- next action
- currently parked external dependencies
- current verification status
- open PR
- whether Windows native proof exists
- whether Android native proof exists
- any dirty/unpushed warning

Do not turn it into a historical report. History belongs in checkpoint files and Git.

---

# 8. Universal milestone acceptance gates

A milestone is not complete just because code exists.

Use applicable gates:

## Frontend

- focused tests for changed behavior
- `npm run quality`
- `npm run build`
- `npm run check:dev-preview-isolation`
- `npm run quality:ui` for UI/layout/interaction changes

## Rust/native

From `src-tauri`:

- `cargo fmt --check`
- focused Rust tests
- `cargo test` when core/native behavior changes
- `cargo clippy --all-targets -- -D warnings`

## Data/migrations

- forward migration
- reopening migrated DB
- compatibility with existing synthetic fixtures
- rollback/recovery strategy documented when destructive rollback is impossible
- historical issued records unchanged unless explicitly migrated through reviewed logic

## UX

For changed teacher workflows:

- keyboard
- mouse
- touch/narrow layout where applicable
- light
- dark
- at least Efficient and Guided density/mode behavior
- loading
- empty
- error/retry
- offline/local-save state
- reduced motion
- 200% zoom/reflow where relevant

## Evidence rule

Record exactly what was run.

Never convert:

- source inspection into device proof
- build success into installation proof
- Rust cross-compile into APK proof
- browser responsive view into Android proof
- screenshot similarity into DepEd acceptance

---

# 9. CTOS quality scorecard

Grade important teacher-facing milestones against this scorecard.

| Dimension | Target |
|---|---:|
| Understandable within 5 seconds | 9/10+ |
| Main action usually ≤2 interactions | 9/10+ |
| Class/subject/year context unmistakable | 10/10 |
| Duplicate encoding avoided | 10/10 |
| Core work usable offline | 10/10 |
| Save/transfer state understandable | 10/10 |
| Keyboard efficiency | 9/10+ |
| Touch usability | 9/10+ |
| Visual calm / low cognitive load | 9/10+ |
| Accessibility | WCAG 2.2 AA floor |
| Data correctness / auditability | no known silent corruption path |
| Historic record protection | mandatory |
| Unsupported official claims | zero |

If a milestone scores below the bar in a material dimension, fix it before tagging complete or explicitly carry a named debt to a later milestone with justification.

---

# 10. Milestone map

The order below is deliberate. Do not start with more cosmetic polish while core context/correctness remains uncertain.

---

## M00 — Source truth, PR103 reconciliation, and autonomous runner

### Outcome

A clean, current CTOS integration branch exists, no valuable recent work is lost, obsolete branch work is not accidentally resurrected, and Atria has durable checkpoint/resume automation.

### Work

- fetch/pull current main
- inventory open PRs and relevant branches
- inspect PR #103 against current main
- integrate reusable work deliberately
- create CTOS branch
- create CTOS state/checkpoint structure
- implement checkpoint/resume scripts
- update root continuation guidance only where necessary
- establish baseline test results
- capture known failures before feature work

### Acceptance

- CTOS branch pushed
- PR103 disposition documented
- checkpoint automation actually exercised
- resume automation actually exercised
- baseline quality results recorded
- no untracked valuable work
- M00 tag pushed
- screen cleared automatically

---

## M01 — Trust foundation: grading, completeness, historical integrity

### Outcome

Teachers can trust that displayed academic results correctly communicate both value and completeness, and historical records cannot silently change because defaults changed.

### Work

- audit adjusted-transmutation boundary behavior
- eliminate silent fallthrough
- define calculation problem state
- separate calculated preview from complete/final
- preserve blank/zero/excused/not-applicable/future distinctions
- pin full grading profile applicability
- protect historical/issued snapshots
- verify correction/amendment behavior
- build exact-threshold and attainable-score fixtures
- verify legacy records do not mutate under new defaults

### Acceptance

- no unexplained transmutation fallback
- provisional state is explicit
- completion logic tested
- historical snapshot tests pass
- issue/amend semantics preserved

---

## M02 — WorkAccessSnapshot, session reset, authorization, and scoped sync

### Outcome

A signed-in teacher sees only their actual work, stale user/class context cannot leak across accounts, and UI filtering is not the authorization boundary.

### Work

- implement/finish one authoritative WorkAccessSnapshot
- include school/year/authorization revision/teaching assignments/advisories/designated capabilities
- dashboard/login route reset
- invalidate stale async results after user/school change
- remove global learner access for normal teacher roles across desktop/mobile/search
- preserve learner entry through authorized class/advisory context
- enforce native/backend object relationship validation
- verify reassignment/revocation
- verify offline last-confirmed assignment behavior
- verify pending handover preservation
- verify subject/advisory responsibility separation
- verify sync scope against spoofed IDs and stale pages

### Acceptance

- account-switch test
- ID manipulation test
- reassignment test
- revocation test
- offline stale-assignment test
- subject teacher and adviser access matrices pass

---

## M03 — CTOS design system and interaction language

### Outcome

Every future screen inherits one elegant, restrained, accessible system instead of being redesigned independently.

### Work

- audit current class-folio design after PR102
- preserve successful semantic token foundation
- formalize:
  - typography scale
  - spacing
  - surfaces
  - borders
  - elevation
  - focus
  - interactive states
  - semantic status colors
  - light/dark
  - density modes
  - motion
  - loading
  - empty
  - error
  - offline
  - destructive confirmation
  - tables
  - field controls
  - dialogs/sheets/drawers
  - responsive rules
- eliminate remaining hardcoded visual islands
- ensure school identity is restrained and does not imply official DepEd endorsement
- establish CTOS interaction-copy vocabulary:
  - Saved on this device
  - Waiting to transfer
  - Transfer complete
  - Needs review
  - Draft
  - Ready
  - Returned
  - Updated schedule
- build visual regression/synthetic preview coverage for shared primitives

### Acceptance

- no material screen-specific theme divergence
- contrast script passes
- reduced motion works
- light/dark/system works
- all teacher modes preserve capability
- primitives documented and tested

---

## M04 — Today: design the teacher’s day

### Outcome

After login, the teacher understands the day and can reach the current/next important task immediately.

### Work

Build/refine `Today` as an actionable agenda, not a KPI dashboard.

Surface only authorized, relevant items:

- current/next classes from published schedule
- location/room if available
- subject/section context
- incomplete attendance
- incomplete assessments
- returned forms/reviews
- pending local transfer
- meaningful schedule change
- learners requiring teacher follow-up where appropriate
- advisory duties if assigned

Avoid decorative statistics.

Add one-action entry into the relevant class or work item.

Handle:

- no published schedule
- offline stale schedule
- changed schedule
- no classes today
- pending assignments
- partial attendance
- returned review

### Acceptance

- next class opens in one action
- important unfinished work is reachable without menu hunting
- no unauthorized school-wide aggregates
- no generic notification feed required for routine work

---

## M05 — Class Folio golden path

### Outcome

The teacher opens a class once and works inside one persistent, unmistakable context.

### Work

Refine the current folio into the CTOS class workspace.

Persistent identity must include enough context to prevent wrong-class entry:

- section/class
- subject
- school year
- term/period
- assignment state
- schedule/version where relevant

Recommended conceptual areas:

- Overview
- Classroom
- Attendance
- Assessments
- Learners
- Learning Support
- Reports

Do not expose every area as a heavy top-level tab if progressive disclosure or in-context transitions are cleaner.

Preserve unfinished work when moving between internal areas.

Implement command/search routing for authorized destinations, preferably `Ctrl+K` on desktop, without making command search an authorization mechanism.

### Acceptance

- class opens from Today in one action
- context persists
- wrong-class ambiguity is minimized
- drafts survive internal navigation
- keyboard path is strong
- mobile/narrow context remains visible

---

## M06 — LIKHA Classroom session mode

### Outcome

During an actual class, LIKHA behaves like a focused teacher cockpit rather than an administrative database.

### Work

Define explicit class occurrence/session semantics:

- planned meeting
- actual dated occurrence
- changed/cancelled occurrence
- delivered class evidence

Classroom Mode should prioritize:

- roster
- attendance
- current learning target
- quick formative evidence
- quick teacher notes
- learners requiring follow-up
- lightweight assessment capture
- session summary

Support:

`Start Class` → active session → `Finish Class` → review/confirm summary

Do not infer official daily adviser attendance from subject attendance.

Do not claim a planned meeting occurred merely because it was scheduled.

### Acceptance

- session occurrence identity tested
- attendance and notes save locally
- closing a session produces an understandable review
- cancellation/change does not fabricate attendance
- subject/adviser separation remains intact

---

## M07 — Attendance, assessment entry, class record, and review

### Outcome

Routine evidence capture is exceptionally fast while academic meaning remains safe.

### Attendance

Target typical all-present class workflow under ~30 seconds on representative UI.

Support:

- fast mark-all-present with review
- exceptions
- keyboard shortcuts
- narrow/touch layout
- unrecorded state
- local save state
- exact failed-action retry

### Assessment

Support:

- clean assessment creation
- explicit maximum/category/date
- keyboard score entry
- spreadsheet paste/import staging
- blank vs zero
- exceptions with reason/history
- row-level save state
- duplicate/repeated import detection
- undo through compensating correction, not hidden mutation

### Review

Create one review surface for:

- provisional grade
- incomplete evidence
- unusual entries
- learners needing support
- unresolved assessment exceptions
- readiness for reporting

### Acceptance

- keyboard scoring journey
- sorted/pasted import identity safety
- duplicate names
- wrong maximum
- blank/zero distinction
- provisional/final distinction
- local-save/transfer distinction

---

## M08 — Teacher attention and Learning Support

### Outcome

LIKHA turns evidence into teacher action instead of ending at a low score.

### Work

Build an attention model based on real state, not generic notifications.

Examples:

- attendance unfinished
- assessment incomplete
- returned report
- pending handover
- learner follow-up due
- schedule change

Learning Support loop:

```text
evidence → identified need → goal → intervention → participation → follow-up → outcome
```

Keep ordinary classroom remediation available.

Keep named programs inactive until their current instructions and designated coordinator exist.

AI may assist with summarization/draft activities but cannot invent assessment evidence or silently create official intervention records.

### Acceptance

- no fabricated learner evidence
- follow-up links back to source evidence
- teacher controls official saved action
- sensitive notes remain appropriately scoped

---

## M09 — Smart Teacher Load Maker and Class Scheduling

### Outcome

School planning becomes understandable, explainable, repairable, and publishable—not merely a painted grid.

### Workflow

```text
Prepare → Confirm requirements → Lock decisions → Generate → Compare → Repair → Validate → Publish
```

### Work

- reconcile existing schedule/load foundations from PR103
- stabilize teacher, section, room, subject, eligibility, date/term models
- model real time intervals rather than only period labels
- support fixed teacher/time/room decisions
- generate assignment + timetable alternatives where appropriate
- detect:
  - teacher overlaps
  - section overlaps
  - room overlaps
  - shared learner overlaps
  - availability conflicts
  - insufficient required minutes
  - protected breaks/travel/setup buffers
  - qualification/eligibility gaps
- distinguish:
  - valid solution found
  - proven impossible under supplied constraints
  - search stopped/no solution yet
- generate three useful comparison modes where supported:
  - Balanced
  - Stable
  - Compact
- explain conflicts in ordinary language
- provide limited repair suggestions
- atomically publish a dated/versioned schedule
- keep drafts from granting learner access
- make Today/My Classes consume the published schedule

### Acceptance

- independent checker validates solver output
- fixed-conflict scenario
- mixed duration overlap
- room alias collision
- term rollover
- mid-term reassignment
- stale generated result cannot publish after inputs change
- failed publication preserves old version
- teacher/section/room print views agree on version

---

## M10 — Curriculum, Budget of Work, Teaching Flow, and ILAW integration

### Outcome

The system knows what a class is expected to learn and can support lesson preparation without making teachers re-enter curriculum context.

### Work

Create/version:

- curriculum/program/cohort
- grade
- subject/course
- term
- competency/learning target
- BOW sequence
- source/provenance
- effective school year

Connect:

```text
Curriculum/BOW
  ↓
Published schedule
  ↓
Teaching Flow
  ↓
Lesson planning / ILAW
  ↓
Classroom
  ↓
Assessment evidence
  ↓
Learning Support
```

Do not silently rewrite historical teaching sequences when next year’s curriculum changes.

AI-generated lesson content must be editable and clearly generated/draft until teacher-confirmed.

Prefer contextual actions such as:

- Prepare lesson
- Draft activity
- Create remediation activity
- Summarize observations

Avoid a giant generic AI-chat destination as the primary model.

### Acceptance

- year/cohort separation
- subject/term applicability
- BOW provenance
- schedule-to-lesson context
- lesson-to-classroom handoff
- teacher confirmation before official instructional record persistence

---

## M11 — Trusted Reports and SF1–SF10 pipeline

### Outcome

Teachers maintain source records; forms become reviewed views of trusted data rather than duplicate data-entry applications.

### Work

Build/complete reconciliation contracts across:

- enrollment / SF1
- attendance / SF2
- resources / SF3
- school attendance/movement / SF4
- promotion/outcome / SF5
- consolidation / SF6
- personnel/load contribution as applicable
- SF8 remains inactive until confirmed rules
- learner report / SF9
- historical record / SF10

Lifecycle:

```text
Working data → Draft → Review → Issued → Amendment
```

Reports must show readiness before export.

For example:

- complete fields
- missing subject result
- unreviewed discrepancy
- unsupported official layout
- pending signatory/checking detail

Preserve issued snapshots exactly.

Keep unsupported/fidelity-pending variants explicitly draft.

### Acceptance

- cross-form reconciliation fixtures
- issue version remains unchanged after source correction
- amendment links to prior issue
- incomplete SF9 cannot masquerade as complete
- official-fidelity claims remain evidence-based
- print preview is visible before export

---

## M12 — School Review and TANAW exchange

### Outcome

Reviewed school information can move into TANAW without teachers re-encoding it, while undefined district authority remains safely disabled.

### Work

Implement/finish:

- versioned reporting package
- stable indicator IDs
- definitions/denominators
- missing-data semantics
- package revision/hash
- duplicate-safe import
- receipt
- return/correct/resubmit
- amendment/version history

Until authoritative West 1 requirements are provided:

- keep sample mapping explicitly labeled
- keep Lock unavailable
- do not infer official district formulas

### Acceptance

- retry is idempotent
- return/correct/resubmit preserves history
- no duplicate package application
- sample vs official state obvious
- Lock cannot be granted by guesswork

---

## M13 — Offline continuity, synchronization, backup, and recovery

### Outcome

Teacher work survives ordinary school connectivity failure, app restart, device restart, hub interruption, replacement, and safe upgrade.

### Work

Re-audit existing sync/recovery after CTOS integration.

Verify:

- durable operation IDs
- idempotent transfer/acknowledgement
- full-queue conflict detection
- rejected incoming retention
- conflict resolution
- scope/revocation
- pending handover
- stale schedule/assignment messaging
- transfer status language
- portable encrypted backup
- attachments included as promised
- replacement-device reconciliation
- upgrade/migration behavior
- clean Windows offline install path

### Acceptance

Failure scenarios:

- lost acknowledgement
- process kill
- hub restart
- IP/network change
- multi-page pending queue
- concurrent score change
- stale backup
- different Windows account/device
- interrupted migration
- retired device returning later

No data-loss assertion without executed evidence.

---

## M14 — Android classroom companion

### Outcome

Android becomes a real focused companion for Today/Classroom/Attendance/Quick Scores rather than a responsive browser claim.

### Work

- integrate actual Android Keystore protection
- prove SQLCipher create/reopen
- handle process death
- handle signed upgrades
- implement document URI → bounded private staging for imports/recovery
- handle expired URI permissions/provider offline cases
- build real APK/AAB as appropriate
- verify 16 KiB native compatibility
- test replacement/recovery path
- implement touch-first Today and class session experience
- keep heavy school setup/report/scheduling work primarily on Windows unless evidence supports mobile parity

### Acceptance

On actual Android build/device/emulator as applicable:

- encrypted startup
- reopen after process death
- attendance save/reopen
- quick score save/reopen
- offline use
- upgrade
- backup/recovery or supported handoff path
- native file selection
- no claim from Rust cross-compile alone

---

## M15 — Accessibility, performance, security, observability, and failure polish

### Outcome

The polished app remains usable on ordinary school hardware and in failure conditions.

### Work

- WCAG 2.2 AA sweep
- keyboard-only full golden path
- focus restoration
- focus not obscured
- 200% zoom
- touch target review
- non-color status cues
- screen-reader semantics for dense records
- performance profiles on large synthetic classes
- avoid premature virtualization if not needed
- security scan
- dependency review
- auth/session boundary review
- diagnostics without learner PII
- clear user-safe error states
- retry scopes exact to failed actions
- observability for migration/sync/recovery without exposing secrets

### Acceptance

- quality suites green
- accessibility smoke green
- no severe known security finding left unaddressed without explicit accepted reason
- representative synthetic heavy dataset remains responsive
- error paths are understandable and recoverable

---

## M16 — Teacher delight and usability refinement

### Outcome

The app feels coherent, elegant, and pleasant after correctness work—not merely technically complete.

### Work

Run a full journey critique:

```text
Login → Today → Class → Classroom → Attendance → Assessment → Review
→ Learning Support → Reports → Return to Today
```

Use three lenses:

1. world-class UI craft
2. world-class teacher workflow / UX
3. skeptical public-school teacher with limited time and inconsistent connectivity

Look for and remove:

- redundant selectors
- excessive clicks
- repeated metadata
- menu hunting
- unnecessary confirmations
- noisy borders
- excessive cards
- decorative motion
- unclear save state
- unclear class identity
- hidden keyboard paths
- cramped mobile controls
- technical language
- generic AI affordances

Micro-polish:

- hierarchy
- rhythm
- alignment
- table scanning
- sticky context
- command search
- hover/focus/press feedback
- empty states
- skeleton/loading discipline
- dark mode
- high-density workflow comfort
- print transition

### Acceptance

Grade the golden path with the CTOS scorecard. Fix material scores under target before completion.

---

## M17 — Release candidate, full evidence, merge, and handoff

### Outcome

One defensible release candidate exists with a truthful evidence ledger and clean continuation state.

### Work

- rebase/update CTOS branch against latest main
- resolve conflicts deliberately
- full frontend verification
- full native verification
- Windows packaging
- installed Windows smoke if environment/device is available
- Android release checks if native milestone is claimed complete
- security/dependency checks
- migration/recovery rehearsal
- document unsupported/parked areas
- update `TASK.md`
- update `HANDOFF.md`
- update release checklist
- prepare PR
- review diff for accidental scope creep
- merge only when required checks pass
- preserve tags/checkpoints
- do not delete useful historical branch evidence until referenced state is safe

### Final truth categories

For every major area classify:

- Implemented + verified
- Implemented, device verification pending
- Prototype/draft
- Parked on external evidence
- Unsupported

No “complete” umbrella claim that hides these differences.

---

# 11. Parked dependency register to carry forward

Atria must keep these visible but should not let them stall unrelated CTOS work.

| Dependency | Safe behavior until supplied |
|---|---|
| Current Mandaue form-checking instructions | Keep affected final acceptance/fidelity as draft |
| Current anonymized LIS SF1–SF4 samples | Implement data contracts and draft preview; do not claim exact final fidelity |
| Actual West 1 TANAW dictionary | Sample/versioned mapping only |
| TANAW Lock authority | Lock denied/unavailable |
| Current eSF7 process/template specifics | Maintain personnel/load data; official output pending |
| SF8 confirmed health rules | Entire SF8 workspace inactive |
| Named program rules/coordinators | Programs inactive; ordinary classroom remediation available |
| Tingub actual roster/offerings | Fresh setup/import preview; no invented production data |
| Current bell times/shifts/room constraints | Configurable planning inputs |
| Teacher eligibility/designations | Require explicit confirmation; do not infer qualification |
| Real school device performance | Use synthetic/dev evidence; reserve readiness claim |
| Final printer/form acceptance | Preview/test structure; acceptance pending actual process |

---

# 12. Sequence of prompts for Atria-CC

The program is designed to run from **Prompt 00** continuously. Prompts M00–M17 are fallback/resume prompts if the session is interrupted or if a milestone needs to be restarted in isolation.

---

## Prompt 00 — CTOS autonomous runner

```text
You are the autonomous implementation lead for LIKHA-SIS CTOS (Calm Teacher Operating System).

Repository: 312810-spec/likha-sis-0.2.

Read, in this order:
1. CTOS.md
2. AGENTS.md
3. CTOS-STATE.md if it exists
4. HANDOFF.md if it exists
5. TASK.md
6. PRODUCT.md
7. DESIGN.md
Then inspect the current Git branch, remotes, working tree, latest main, open PR #103, and only the source/tests relevant to the current milestone.

Execute CTOS continuously from the first incomplete milestone through M17. Do not ask me to say continue between milestones.

Apply FORGE per CTOS.md:
- establish context and outcome
- surface contradictions
- for major choices compare three genuinely different approaches
- grade against CTOS criteria
- implement the winner
- test
- fix material weaknesses
- export the verified result

At every milestone:
- run the applicable verification
- update CTOS-STATE.md
- write the milestone checkpoint
- use the CTOS checkpoint automation to commit and push the branch
- push the milestone tag when complete
- verify the remote save
- clear the terminal screen
- automatically read the compact state and continue with the next milestone

Do not merge broken work merely to save it. Do not fabricate official school/DepEd/TANAW requirements. Park external dependencies and continue safe work.

No evidence, no assertion. Browser proof is not native proof. Build proof is not installed-device proof. A calculated grade is not automatically a complete/final result. UI context is not authorization.

Start with M00. Continue until M17 or a genuinely external hard blocker prevents any further safe work.
```

---

## Prompt M00 — Source truth and runner

```text
Execute CTOS M00 exactly as defined in CTOS.md. Reconcile latest main with PR #103 without blindly merging either side. Create the CTOS integration branch, preserve useful recent work, reject superseded automation/harness history, create CTOS-STATE/checkpoint/resume automation, establish fresh baseline verification, durably push/tag the completed milestone, clear the screen, then continue to M01 automatically.
```

## Prompt M01 — Academic trust

```text
Resume CTOS. Execute M01: grading correctness, completeness/provisional state, historical policy pinning, issue/amend integrity, and exact boundary fixtures. Do not redesign unrelated UI. Grade the implementation against the CTOS trust criteria, fix weaknesses, checkpoint/push/tag, clear screen, continue.
```

## Prompt M02 — Assignment scope and authorization

```text
Resume CTOS. Execute M02: one authoritative WorkAccessSnapshot, login/session reset, assignment/advisory scoped navigation and commands, backend/native enforcement, sync scoping, reassignment/revocation, offline last-confirmed work, and handover preservation. Include hostile ID/stale-context tests. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M03 — Design system

```text
Resume CTOS. Execute M03: consolidate the premium class-folio direction into a complete CTOS design/interaction system. Preserve working accessibility and behavior. Eliminate visual islands and generic SaaS patterns. Verify light/dark/system, density modes, reduced motion, primitives, error/offline states, and responsive rules. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M04 — Today

```text
Resume CTOS. Execute M04: make Today the teacher’s actionable day, driven by authorized published schedule and real unfinished work. No KPI-card dashboard. Optimize current/next class and required action access. Verify empty/offline/stale/changed schedule cases. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M05 — Class Folio

```text
Resume CTOS. Execute M05: make Class Folio the persistent golden workspace with unmistakable class/subject/year/term context, draft retention, efficient keyboard/touch navigation, and authorized command routing. Remove repeated selectors where context already determines them. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M06 — Classroom Mode

```text
Resume CTOS. Execute M06: implement real class occurrence/session semantics and focused Classroom Mode. Separate planned schedule, actual occurrence, subject attendance, and adviser attendance. Build Start Class → capture → Finish Class → review. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M07 — Evidence capture and review

```text
Resume CTOS. Execute M07: fast attendance, assessment creation, keyboard/paste score entry, correction history, import staging, completeness review, local-save/transfer feedback, and learner-level readiness. Optimize speed without weakening meaning or auditability. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M08 — Attention and Learning Support

```text
Resume CTOS. Execute M08: replace generic notifications with actionable teacher attention, then connect real evidence to intervention/follow-up/outcome. Do not fabricate learner evidence or enable named programs without current requirements. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M09 — Smart Load and Scheduling

```text
Resume CTOS. Execute M09: integrate and complete Teacher Load Maker + intelligent scheduling using explicit constraints, locks, alternatives, independent validation, conflict explanations, limited repair, and atomic versioned publication. Reuse verified PR103 foundations where appropriate. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M10 — Curriculum/BOW/ILAW

```text
Resume CTOS. Execute M10: version curriculum/BOW/learning targets and connect them to schedule, Teaching Flow, lesson preparation/ILAW, Classroom, assessment, and support. Keep AI contextual and teacher-confirmed. Protect historical curriculum applicability. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M11 — Reports and school forms

```text
Resume CTOS. Execute M11: make SF/report outputs reviewed views of source records, with reconciliation, readiness, preview, issue, frozen snapshot, and amendment. Respect parked official-layout evidence and keep SF8 inactive. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M12 — TANAW

```text
Resume CTOS. Execute M12: versioned, duplicate-safe LIKHA→TANAW review package flow with definitions, revisions, receipts, return/correct/resubmit and amendments. Keep official West 1 mapping and Lock unavailable until authoritative evidence exists. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M13 — Continuity and recovery

```text
Resume CTOS. Execute M13: aggressively test and finish offline continuity, sync, conflict/retry, backup, replacement-device recovery, migrations/upgrades, and clean Windows offline install behavior. Record executed evidence only. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M14 — Android

```text
Resume CTOS. Execute M14: make Android a real encrypted classroom companion with Keystore, SQLCipher lifecycle, process-death recovery, document URI staging, upgrade, offline attendance/quick scores, and actual APK/device evidence. Do not equate Rust cross-compilation with Android readiness. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M15 — Hardening

```text
Resume CTOS. Execute M15: full accessibility, performance, security, diagnostics, failure/retry and heavy synthetic-data review. Fix material regressions and remove misleading success states. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M16 — Teacher delight

```text
Resume CTOS. Execute M16 as a rigorous UI/UX refinement of the complete golden path. Use three lenses: world-class UI craft, world-class teacher workflow, and skeptical time-poor public-school teacher. Remove friction and visual noise rather than adding features. Grade against the CTOS scorecard and fix until target. Checkpoint/push/tag, clear screen, continue.
```

## Prompt M17 — Release and merge

```text
Resume CTOS. Execute M17: produce a truthful release candidate, rerun full evidence, package/test native targets where available, reconcile latest main, update handoff/task/release evidence, prepare and merge the CTOS PR only when required gates pass, and leave a clean final continuation state. Classify every major capability by actual evidence rather than using a blanket “complete” label.
```

---

# 13. Interruption / recovery prompt

Use this if Atria-CC is interrupted at any point:

```text
Recover CTOS without assuming the prior session finished.

Repository: 312810-spec/likha-sis-0.2.

Run the CTOS resume workflow. Read CTOS.md, CTOS-STATE.md, latest docs/ctos/checkpoints entry, HANDOFF.md, git status, current branch, latest pushed commit, and latest CTOS milestone tag. Preserve all dirty work. Compare local and remote before changing anything.

Continue from the first incomplete acceptance item of the current milestone. Do not repeat work already proven on the exact same source unless the source changed. Do not reuse test claims from lost or rebuilt source. When the milestone is complete, checkpoint/push/tag, clear the screen, and continue automatically.
```

---

# 14. Milestone completion report template

Each `docs/ctos/checkpoints/Mxx-*.md` should use approximately:

```markdown
# CTOS Mxx — <title>

Status: complete | in-progress
Branch:
Timestamp:

## Outcome
<teacher/system outcome>

## Implemented
- ...

## Evidence actually run
- command — result
- scenario — result

## FORGE grade
- clarity:
- teacher effort:
- correctness:
- offline:
- accessibility:
- visual calm:
- remaining weakness:

## Parked / not proven
- ...

## Durable save
- branch:
- milestone tag:
- remote push confirmed: yes/no

## Next
<exact next milestone/action>
```

Keep it concise; Git history carries the detailed diff.

---

# 15. Definition of “elegant” for LIKHA-SIS

Do not optimize elegance as decoration.

CTOS elegance means:

- the app anticipates context
- the teacher makes fewer choices
- the teacher does not re-enter known information
- the main action is obvious
- states are unambiguous
- save behavior is trustworthy
- errors are recoverable
- repeated work becomes faster
- dense tables remain readable
- advanced power is present without overwhelming beginners
- offline use feels normal
- historical data is safe
- reports emerge from maintained records
- AI appears only where it reduces teacher effort
- the product has one visual/interaction language

The most premium screen is the one that makes a difficult school task feel ordinary.

---

# 16. Definition of CTOS done

CTOS is not “done” because every conceivable module exists.

The CTOS program is done when:

1. The golden teacher path is excellent.
2. Academic state is trustworthy and historically safe.
3. Assignment/security scope is enforced beneath the UI.
4. Today and Class Folio remove repeated navigation/selection.
5. Classroom Mode supports actual class work.
6. Attendance and scoring are fast and resilient.
7. Smart scheduling is explainable and publishable.
8. Curriculum/BOW can feed teaching flow without rewriting history.
9. Reports use reviewed source records and preserve issued versions.
10. TANAW exchange is versioned and honest about unofficial mappings.
11. Offline/sync/recovery behavior has real failure evidence.
12. Windows has a defensible installation/recovery story.
13. Android is only called supported after actual native proof.
14. UI meets the CTOS quality bar across light/dark, keyboard/touch, and accessibility.
15. External evidence gaps are explicitly parked instead of fabricated.
16. Every milestone is durably saved to GitHub and recoverable.
17. Final release evidence distinguishes verified, pending-device, draft, parked, and unsupported capabilities.

---

# 17. Final instruction to the executor

Build the teacher’s day, not a menu of modules.

When choosing between adding another visible feature and removing one unnecessary decision from a teacher’s day, prefer removing the decision—unless doing so would hide important meaning, authorization, or review.

When choosing between visual novelty and trustworthy clarity, choose clarity.

When choosing between an impressive AI behavior and a deterministic school rule, preserve the deterministic rule and use AI only as assistance.

When evidence is missing, label and park it.

When a milestone works, **save it to GitHub before moving on**.

Then **clear the terminal screen and continue**.
