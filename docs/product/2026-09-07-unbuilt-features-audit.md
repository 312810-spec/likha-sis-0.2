# LIKHA-SIS 0.2 — Unbuilt / Partially-Built Features Audit

Date: 2026-09-07
Author: audit agent (research only — no code was written or modified for this task)

## Method and limitations

This audit was produced by reading this repository's own documentation and
cross-checking every status claim against actual current source (grep/read
of `src-tauri/src/**`, `src/**`, migrations, and Tauri command registrations)
rather than trusting any single document's stated status. Sources read in
full or in large part: `docs/product/PRODUCT-CONTRACT.md` (all 379 lines),
the top ~1300 lines of `docs/CURRENT-HANDOFF.md` (covering every entry from
2026-09-04 through 2026-09-07, i.e. everything since the last time
PRODUCT-CONTRACT.md was reconciled), `docs/PROGRESS-MAP.md`,
`docs/PROJECT-MEMORY.md`'s section headers and tail, the full list of ADRs
0055-0069, a repo-wide case-insensitive search for "legacy", and the first
~1300 lines plus the standing-open-item tail of `docs/VERIFICATION-DEBT.md`
(4769 lines total). Git log/`git status` were also checked to confirm the
newest commits (`8fd3be7`, 2026-09-07) match what the docs describe.

**Hard limitation, stated plainly per this task's instructions**: the actual
pre-0.2 "legacy LIKHA" codebase is **not present anywhere on this machine**
and was **not inspected**. Every "legacy LIKHA" reference in this report is
a direct quotation of what this repo's own documentation says about it —
nothing about legacy LIKHA's actual feature set, architecture, or code was
inferred, assumed, or invented beyond what is written in the six passages
quoted in the dedicated section below. If legacy LIKHA had features not
mentioned anywhere in this repo's docs, this audit cannot surface them —
that is a real, disclosed gap in this audit's coverage, not a claim that
no other legacy features existed.

A second limitation: `docs/PROGRESS-MAP.md` and `docs/PROJECT-MEMORY.md`
are themselves stale relative to `docs/CURRENT-HANDOFF.md` (their most
recent substantive entries are dated 2026-08-31/2026-09-04, while
`CURRENT-HANDOFF.md` and `VERIFICATION-DEBT.md` continue through
2026-09-07). Per this project's own documented convention
(`docs/CURRENT-HANDOFF.md` is the immediate-resumption-state document),
`CURRENT-HANDOFF.md` and `VERIFICATION-DEBT.md` were treated as more
authoritative than `PROGRESS-MAP.md`/`PROJECT-MEMORY.md` wherever they
disagreed, and PRODUCT-CONTRACT.md's per-item status was verified rather
than copied wherever there was any chance it was stale.

---

## Criticality-sorted findings

Ordered by LIKHA's own priority: **security/privacy > correctness > DepEd
compliance > teacher usability > offline reliability > maintainability >
zero billing > performance > development speed.** Items that could
plausibly sit at more than one tier are placed at their highest applicable
tier.

### Tier 1 — Security / privacy

1. **Independent security review owed on multiple recent sync-security
   milestones.** The project's own rule
   (`.claude/rules/security-privacy.md`) requires an independent review
   (fresh reviewer context) for any milestone touching auth, persistence,
   or sync before it is marked complete. As of 2026-09-07, several are
   still open because the dispatched `security-reviewer` agent's findings
   were not retrievable (a root-caused, currently-unfixable runtime bug in
   the agent-orchestration harness itself, not a repo-config problem — see
   `docs/VERIFICATION-DEBT.md`'s "Reviewer-agent retrieval failure
   root-caused" entry, 2026-09-07). Self-review was substituted each time
   per the documented fallback, but this is real retained debt:
   - Sync payload encryption/key-rotation (`hub_server::payload_key_wrap_handler`,
     `repository::sync_payload_key::*`) — self-reviewed only.
   - `db::rotate_sspk` device-revocation key rotation — self-reviewed only.
   - The four-entity `SectionMembership`/`Subject`/`AssessmentItem`/
     `LearnerScore` sync-wiring batch — a **genuinely independent** review
     was eventually obtained via a file-based workaround
     (`docs/reviews/2026-09-07-sync-entity-wiring-review.md`) and found one
     real BLOCKING issue (see Tier 2 below, now fixed). This shows the
     self-review fallback can miss real bugs the independent path catches
     — the remaining self-review-only items above should be treated as
     genuinely unverified, not merely a paperwork gap.
   - In-app school branding (logo upload, 2026-09-06) — explicitly recorded
     as "not yet performed this session," self-review only.
     Source: `docs/VERIFICATION-DEBT.md` (multiple 2026-09-07 entries),
     `docs/CURRENT-HANDOFF.md`'s branding entry.

2. **Sync production-readiness gates not yet closed** (ADR-0067). Verified
   directly against source as of 2026-09-07 — most of ADR-0067's original
   gate list is now genuinely closed (domain mutations wired into the
   outbox for 10 entities, hub persistence with replay/idempotency and
   forged-scope tests, device enrollment/revocation, payload-key lifecycle
   including rotation, LAN/Tailscale-only binding, conflict-review UI, and
   — as of this same day — a real multi-round weeks-offline convergence
   test). What remains genuinely open:
   - Windows service/reboot behavior for the school-laptop hub — not
     designed or tested (does the hub relaunch after a crash/reboot?).
   - BitLocker/firewall/patch validation on the actual hub laptop —
     operational, needs real hardware.
   - Two-copy encrypted backup + witnessed restore drill — not run.
   - A real outage/recovery exercise — not run.
   - A more rigorous native NVDA/Narrator pass — a first real one _was_
     run this session (2026-09-07, human-driven, "no issues surfaced") but
     was a single brief walkthrough, not an exhaustive per-screen audit
     with saved transcripts.
   - **Written School Head / DepEd-DPO approval** — an explicit human
     approval gate per this project's own autonomous-development rules;
     production learner use cannot proceed without it regardless of how
     much code exists.
     Source: `docs/VERIFICATION-DEBT.md`, "ADR-0067 school-laptop sync hub
     (2026-09-04) — re-audited 2026-09-07" entry; `docs/adr/0067-*.md`.

3. **Android secure key storage** — not started. Android as a platform has
   not been begun at all (see Tier 4/5 below for the platform gap
   generally); this is called out separately here because §16 of
   PRODUCT-CONTRACT.md lists it as one of the specific pre-production-PII
   security gates still open, distinct from "Android not started" as a
   platform statement. Source: PRODUCT-CONTRACT.md §16 (verified still
   accurate — no `android` target/code found in the repo).

4. **`SubjectAttendanceEntry` (per-learner attendance marks) is not wired
   to sync** — only the session-level `subject_attendance_sessions` row is
   wired. A learner's actual per-meeting attendance entries recorded on
   one device do not currently propagate to the school-laptop hub or to
   other devices. This is a real cross-device data-consistency gap, not
   just an architecture-completeness note, and needs a schema migration
   (widening the `entity_kind` CHECK constraint) before it can be closed.
   Source: `docs/CURRENT-HANDOFF.md`'s "SubjectAttendance session wired
   through the sync encrypt/decrypt pattern" entry (2026-09-06);
   confirmed by grep — no `SubjectAttendanceEntry`/`upsert_from_sync` for
   entries exists in `src-tauri/src/repository/subject_attendance.rs`
   beyond the session-level function.

5. **CLOSED 2026-09-07 — `SectionMembership::enroll`'s callers and
   `correct_same_day_placement` are now wired to sync.** Wider than
   originally described: `enroll` has TWO live production callers, not
   one — `import::commit` (bulk CSV import) AND
   `commands::section::enroll_learner_in_section`
   (`SectionsScreen.tsx`'s own direct enrollment action, genuinely
   separate from the roster-driven `enroll_membership` the Section
   Roster screen already used), neither previously synced. The bulk
   import path was actually unsynced for BOTH entities it writes, not
   just memberships — the learner rows `CreateNewLearner` produces
   never reached the outbox either. User decision recorded: wire
   `enroll`'s existing callers directly (not migrate `SectionsScreen`
   onto `enroll_membership`, and not defer). `import::commit` gained its
   own self-contained enqueue helpers (kept `import` from depending on
   `commands`, matching every other entity's per-module pattern) for
   both `Learner` (base_version 0, create-only) and `SectionMembership`
   (base_version from `sync_version_cache`, since `enroll` is idempotent
   for a repeat same-section enrollment and may return an
   already-synced id). `enroll_learner_in_section` and
   `correct_same_day_placement` were refactored into testable
   `*_with_optional_sync` functions, matching this codebase's
   established pattern. `cargo test` 1046 lib tests, 0 failed; `npm run
quality` 1099/1099. Source: this session's implementation,
   `docs/VERIFICATION-DEBT.md`'s matching entry.

6. **CLOSED 2026-09-07 — `TeachingAssignment.replace_teacher`/`.remove`
   are now wired to sync, including a real cross-device DELETE.** Both
   commands intentionally delete the assignment row (never merely close
   it), and this codebase's sync protocol had a `ChangeOperation::Delete`
   variant defined since its earliest design but never actually
   implemented anywhere — this closes that gap for the first time.
   `replace_teacher_assignment` now enqueues a `Delete` for the OLD
   assignment (if one existed) and an `Upsert` for the new one in the
   same call; `remove_teaching_assignment` enqueues a `Delete`.
   `apply_decrypted_change` gained a `ChangeOperation`-aware dispatch for
   `TeachingAssignment` plus a defensive guard rejecting an unexpected
   `Delete` for any other entity as untrusted (none of the other nine
   entities support it). New tests prove: a pulled delete actually
   removes the local row and cascades to `schedule_meetings`; the
   command layer enqueues both a delete and an upsert for a
   reassignment, and only an upsert for a first assignment; the
   defensive guard rejects a `Delete` claimed for `Subject`. `cargo test`
   1039 lib tests, 0 failed; `cargo clippy`/`cargo fmt`/native
   `cargo build` all clean. Source: this session's implementation,
   `docs/VERIFICATION-DEBT.md`'s matching entry.

7. **SHOULD-FIX cross-school foreign-key validation gap in `upsert_from_sync`
   materializers** (Subject, LearnerScore, SectionMembership,
   AssessmentItem, and by the same pattern likely others): none
   independently re-validates that a foreign id embedded in a pulled
   payload (`section_id`/`learner_id`/`class_record_id`/`category_id`/
   `assessment_item_id`) actually belongs to the declared `school_id` —
   they rely on the SQLite `FOREIGN KEY` constraint proving the row exists
   _somewhere_, not that it exists _in the right school_. Assessed as
   inert under the realistic single-school-per-hub deployment model, but
   explicitly recorded as not yet fixed. Source:
   `docs/VERIFICATION-DEBT.md`, "SectionMembership/Subject/AssessmentItem/
   LearnerScore sync wiring: independent review obtained" entry
   (2026-09-07).

8. **No self-service "forgot password" flow, and no forced-password-
   change-at-next-login flag.** Both deliberately not built — the former
   because there's no safe out-of-band channel in this offline,
   shared-computer deployment model; the latter is ADR-0057's own recorded
   Next Best, needing a new schema flag and login-flow interception point.
   Not a defect, but a real gap in the admin-assisted password-reset
   feature's completeness. Source: PRODUCT-CONTRACT.md §13 (verified
   still accurate — no such flag/flow found in `src-tauri/src/auth/` or
   `commands/user.rs`).

9. **Offline-session re-authentication window (the "~8-hour" idea) is
   still only a candidate, not a locked policy** — needs its own
   security-focused decision pass before any concrete numeric threshold is
   baked in. Source: PRODUCT-CONTRACT.md §13 (verified — no such timer
   exists in `src-tauri/src/auth/session*` beyond the existing idle-timeout
   and global-expiry mechanisms, which are a different, already-built
   concern).

### Tier 2 — Correctness

10. **(Historical, now fixed, listed for completeness since it was found
    during this exact kind of gap-hunting)**: a legitimate, non-malicious
    concurrent write on two devices to `Subject`, `LearnerScore`, or
    `SectionMembership` could previously wedge sync for the entire school
    forever (a natural-key collision was treated identically to a
    tampered payload and halted the whole pull batch permanently). This
    was found by the one genuinely independent review obtained this
    session and was fixed the same day (commit `8fd3be7`). Not an unbuilt
    feature, but flagged because it demonstrates the self-review-only
    items in Tier 1 above are a real, not theoretical, residual risk.
    Source: `docs/VERIFICATION-DEBT.md`, same-titled entry (2026-09-07).

11. **`pull_once`'s "any repository-level rejection halts the whole pull
    batch" design still applies to genuine, non-malicious database
    conflicts on any entity not yet given the `RepositoryRejected` fix's
    exact treatment** — the fix above was scoped to the four entities the
    independent review actually exercised; whether every other wired
    entity's own natural-key constraints (if any) got the same
    "advance-past, don't wedge" treatment was not exhaustively re-verified
    across all ten entities in this audit. Worth a follow-up sweep.
    Source: inferred from the mechanism described in
    `docs/VERIFICATION-DEBT.md`'s BLOCKING-finding entry; not independently
    re-verified per-entity by this audit.

12. **MATATAG-vs-prior curriculum learning-area _content_ differences
    remain unconfirmed against a primary source** — only the curriculum
    version's _name_ changed (to "Enhanced K to 10 Curriculum"); the 8
    seeded learning-area names are still identical to the prior "K to 12
    Basic Education Curriculum" row. If DepEd's actual MATATAG rollout
    changed subject/learning-area content (not just naming), that has not
    been implemented. Source: `docs/CURRENT-HANDOFF.md`'s "ADR-0037
    curriculum clarification" entry (2026-09-06), explicit "Gap NOT
    closed" callout.

13. **Key Stage 1 descriptive grading and the Grade 12 DO 8 s.2015
    transmutation-table difference from DO 015 remain blocked on missing
    primary sources** — not implemented, and explicitly not to be
    re-attempted from a web search alone. Source: PRODUCT-CONTRACT.md §4
    (verified — no KS1 descriptive-grading code path or DO 8-specific
    transmutation table found beyond the already-shipped Grade 12 DO 8
    _weighting_ carryover, ADR-0068, which is a narrower, already-closed
    sub-piece).

### Tier 3 — DepEd compliance

14. **School Forms SF3, SF7, SF8 have zero implementation** — confirmed by
    a repo-wide search: no file, table, command, or UI screen references
    any of them.
    - **SF3** (Book/resource monitoring) — not built, explicitly lower
      priority (PRODUCT-CONTRACT.md §5).
    - **SF7** (Personnel & Teaching Assignment) — not built. This is a
      meaningful gap given Teacher Load + Class Schedule (the data SF7
      would consume) is already a real, tested foundation with UI
      (`TeacherLoadScreen.tsx`, `ScheduleMeetingsScreen.tsx`,
      `TeachingAssignmentsScreen.tsx`) — SF7 itself is the one link in that
      chain (school structure → … → Teacher Load → Class Schedule → SF7 →
      teacher access → "My Day") that has not been built, even though
      "My Day" (further down that same chain) already shipped
      (`MyDayScreen.tsx`, 2026-09-06). Source: PRODUCT-CONTRACT.md §6, §5.
    - **SF8** (Health & Nutrition) — not built. Notable because this is
      one of only two places in the whole repo where a _legacy LIKHA_
      concept is explicitly invoked as a starting point for a _still
      unbuilt_ 0.2 feature (see the cross-reference section below) —
      "keep the legacy conceptual split (learner/section-level data;
      Baseline/Pretest consolidation; Endline/Posttest consolidation) as
      a starting point, but revalidate formulas/templates before
      implementing." Source: PRODUCT-CONTRACT.md §5.

15. **Authoritative-template output for every School Form is still
    fidelity-`NOT_VERIFIED`, using synthetic placeholder templates —
    corrects PRODUCT-CONTRACT.md's premise that SF1/SF9 formgen "existing"
    means they're built.** Verified directly by reading
    `src-tauri/src/formgen/sf1.rs`, `sf9.rs`, and `template.rs`: both
    files are real, but they are only the **domain-contract type
    definitions** (`Sf1GenerationRequest`/`Sf9GenerationRequest`/result
    structs) proving the generalized Tauri → `umya-spreadsheet` (OOXML)
    architecture can accept two differently-shaped forms — _not_ a
    populated real DepEd form. `template.rs`'s own doc comments are
    explicit: `SF1_SYNTHETIC_V1` is "a synthetic fixture, not an official
    DepEd document; official SF1 fidelity is NOT_VERIFIED," and
    `SF9_SYNTHETIC_V1` exists "ONLY to prove the generalized architecture
    accepts a second, differently-shaped form" after a direct fetch of
    deped.gov.ph found no discoverable official SF9 template link at all
    — `OFFICIAL_SF9_FIDELITY = NOT_VERIFIED`, and the code comment says
    this "must never be presented to a user as an official DepEd SF9."
    So the accurate current status for every form (SF1, SF4, SF5, SF6,
    SF9, SF10) is: **disclosed CSV export is real and shipped; the
    authoritative-_template_ half of the architecture is proven end to end
    against synthetic fixtures, but zero forms have a real, obtained,
    fidelity-verified DepEd template behind them.** This is a more precise
    (and more work-remaining) status than either "not built" (too
    pessimistic — the architecture and CSV path are real) or "built"
    (too optimistic — no form actually produces an authoritative output
    today). Source: `src-tauri/src/formgen/sf1.rs`, `sf9.rs`,
    `template.rs` (read in full this session); `docs/adr/0048-*.md`,
    `docs/adr/0049-*.md`.

16. **SF1's remaining scope beyond the built foundation**: learner photo,
    a controlled correction path, any still-evidence-gated SF1 fields —
    unbuilt. Source: PRODUCT-CONTRACT.md §5 (verified still accurate — no
    photo/BLOB column on `learners`, no correction-workflow table found).

17. **SF10's remaining scope**: a bulk importer reusing SF1's
    import/reconciliation architecture — unbuilt (only the disclosed CSV
    export and template-applicability/versioning foundation exist).
    Source: PRODUCT-CONTRACT.md §5, `docs/adr/0053-*.md`,
    `docs/adr/0063-*.md`.

18. **Class Record / MPS / SMEA output/presentation generator** —
    explicitly and deliberately deferred (a newer SMEA template may arrive
    later; building against an assumed format was ruled out). The
    underlying data foundation (reusing enrollment/attendance/grades/Class
    Record data) is confirmed real and already flows correctly through
    existing grade-computation code, but no SMEA-shaped aggregation
    output exists. Source: PRODUCT-CONTRACT.md §7 (verified — no `smea`
    reference anywhere in `src-tauri/src` or `src/`).

19. **Curriculum foundation does not yet model per-cohort rollout
    tracking, does not join `curriculum_learning_areas` to a school's
    actual `subjects`, and does not auto-select a curriculum version by
    grade level** (blocked on `sections.grade_level` remaining
    unconstrained free text). Source: PRODUCT-CONTRACT.md §4 (verified —
    `curriculum.rs` and `migrations.rs` show only global reference-data
    tables, no cohort or grade-auto-resolution logic).

20. **DepEd Order No. 16, s. 2026's "ILAW" lesson-plan format — "Ways
    Forward" section's exact sub-structure is unconfirmed against a
    primary DepEd source.** Implemented conservatively as a single
    free-text field in the just-shipped `LessonPlanScreen.tsx`/
    `lesson_plans` table (migration 40); may need to split into sub-fields
    if a future session finds the real primary-source structure. Source:
    `docs/CURRENT-HANDOFF.md`'s lesson-plan-builder entry (2026-09-06).

### Tier 4 — Teacher usability

21. **Teacher Load / Class Schedule chain remains narrower than the full
    product vision**, even though the foundation (tables, `TeacherLoad`
    derivation, conflict detection, and UI) is real and tested. Not yet
    built: personnel/qualifications/position/designation, advisory/
    ancillary-duty tracking (deliberately excluded per DepEd's own
    non-instructional classification), availability/constraints modeling,
    an actual schedule _generator_ (explicitly flagged HYPOTHESIS — "a
    real constraint-solver is a substantial build"), and relief/substitute
    _suggestion_ logic (must always require human confirmation, never
    auto-assign). Source: PRODUCT-CONTRACT.md §6 (verified — no
    schedule-generator or relief-suggestion code found in
    `src-tauri/src/repository/teaching_assignment.rs` or
    `schedule_meeting.rs`).

22. **Teacher Tools (seating plan, random picker, group generator, quick
    class list, advisory checklist, parent contact log, intervention
    tracker, certificate generator) — none of these classroom-utility
    tools exist yet**, apart from the two Creation Studio outputs listed
    below. Source: PRODUCT-CONTRACT.md §11 (verified via `src/ui/` file
    listing — no matching screen for any of these).

23. **Teacher Creation Studio — 2 of 3 confirmed sub-scopes' full output
    sets remain incomplete.** Corrects PRODUCT-CONTRACT.md's "nothing
    started" (now stale — three real outputs shipped 2026-09-06):
    assessment-item authoring workspace
    (`src/ui/AssessmentAuthoringScreen.tsx`), a printable class-summary
    export (`src-tauri/src/export/class_summary.rs`), and a structured
    ILAW lesson-plan builder (`src/ui/LessonPlanScreen.tsx`,
    `lesson_plans` table, migration 40) are all real, tested, and merged.
    Still unbuilt: sub-scope 2's other two confirmed outputs —
    **certificate/recognition template** and **custom seating chart** —
    and the entire **ILAWCraft integration** (presentation/answer-key/TOS
    generation from a lesson plan), which explicitly requires a
    dependency-researcher ADOPT/PILOT/REFERENCE/REJECT pass on the
    separate ILAWCraft project before any adapter code is written — "not
    started" is still accurate for that specific piece. Source:
    `docs/CURRENT-HANDOFF.md`'s three 2026-09-06 Creation Studio entries;
    PRODUCT-CONTRACT.md §11.

24. **RBAC — role-management UI now exists; corrects PRODUCT-CONTRACT.md's
    "deliberately not built yet" claim, which is now stale.**
    `SchoolMembershipScreen.tsx` (built 2026-09-06) lets a School Head
    grant/revoke roles on existing members, gated by
    `Capability::ManageSchoolMembership`, with a last-School-Head guard.
    Still genuinely unbuilt, per PRODUCT-CONTRACT.md §3, and re-verified
    accurate: the full future LIKHA role universe (Adviser, LIS
    Coordinator, ICT Coordinator, Master Teacher/Department Head) — only
    Teacher/Registrar/School Head exist; and finer authority boundaries
    between the three roles beyond the four defined capabilities (e.g.
    can a Registrar edit a grade?) remain undecided. Source:
    `docs/CURRENT-HANDOFF.md`'s "School-Member Role Management" entry
    (2026-09-06); `src/ui/SchoolMembershipScreen.tsx`.

25. **Official School Repository (school-owned SharePoint/OneDrive
    document library)** — confirmed genuinely unstarted (zero references
    to "OneDrive"/"SharePoint" anywhere in `src-tauri/src` or `src`).
    Correctly recorded as DIRECTION SET, not started, and correctly
    blocked on external material only the school/owner can supply
    (confirming an org-managed Microsoft 365 tenant, Graph/site-consent
    grantor, and a completed privacy review) before any implementation —
    this is one of the few items in this whole audit that is _correctly_
    gated rather than merely unscheduled. Source: PRODUCT-CONTRACT.md
    §16.5, `docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`.

26. **School branding — in-app half only; official-form-export half
    remains out of scope, and for a substantive, disclosed reason, not
    merely "not gotten to yet."** Corrects PRODUCT-CONTRACT.md's "no code
    exists yet" (stale). `SchoolBrandingScreen.tsx` (2026-09-06) lets a
    School Head upload/replace/remove a logo, rendered in the sidebar and
    top bar. Deliberately not extended to official exported forms: this
    session's research found DepEd's SF10 rule and visual-identity manual
    restrict official forms to DepEd's own seal/logo and explicitly
    prohibit "combining with other elements or creating new lockups" — so
    this is a DepEd-compliance blocker, not an engineering gap. Also
    still not built: an accessibility-safe theme _derived_ from the
    uploaded logo (primary/secondary/accent/selected-state colors) — only
    the raw logo upload/display shipped; the derived-theme half of §8's
    original direction is not yet implemented. Also not built: a
    school-name rename capability (judged out of this slice's scope).
    Source: `docs/CURRENT-HANDOFF.md`'s branding entry (2026-09-06);
    `src/domain/school-logo.ts`; `src/domain/school.ts` (still only
    `id`/`name`/`createdAt`, no theme-color fields).

27. **"My Day" — School-Head variant, task dismissal/"done" marking, and
    notifications/reminders are explicitly out of scope and not built.**
    Corrects PRODUCT-CONTRACT.md's framing as a pure HYPOTHESIS not yet
    started — `MyDayScreen.tsx` shipped 2026-09-06 (today's schedule +
    a conservative, read-only pending-tasks rail: pending attendance,
    unresolved sync conflicts). Explicitly excluded: "ungraded assessment
    items" as a pending-task signal (no due-date concept exists in the
    schema to anchor "today" against). `SchoolHeadHome.tsx` (the School
    Head's own overview) was left untouched/separate. Source:
    `docs/CURRENT-HANDOFF.md`'s "My Day teacher screen" entry
    (2026-09-06).

28. **Some finer RBAC authority boundaries remain undecided** — e.g.
    whether a Registrar can edit a grade — beyond the four defined
    capabilities. Source: PRODUCT-CONTRACT.md §3.

### Tier 5 — Offline reliability

29. **Weeks-offline multi-round pull convergence** — now has a real test
    as of 2026-09-07 (`pull_once_converges_across_multiple_rounds_...`),
    closing what had been open debt; listed here only because it was open
    as recently as this same day and is a good example of how fast this
    area is still moving — a follow-up sweep of this audit in even a few
    days may find more closed. Source: `docs/VERIFICATION-DEBT.md`.

30. **Windows service/reboot behavior for the sync hub** (already listed
    under Tier 1 as a production-security gate) also has a pure
    offline-reliability dimension: if the hub laptop reboots overnight
    without an attendant, does sync silently stop until someone notices?
    Not designed. Source: `docs/VERIFICATION-DEBT.md`.

31. **The "any repository-level rejection halts the batch" design's
    interaction with `Untrusted` vs `RepositoryRejected`** for entities
    other than the four the independent review actually exercised was not
    re-verified end to end by this audit (see Tier 2, item 11) — a
    plausible remaining reliability edge case, not confirmed either way.

### Tier 6 — Maintainability

32. **Pre-existing, repeatedly-reconfirmed `knip` (dead-code check)
    findings**: 2 unused devDependencies (`@tauri-apps/cli`, `prettier`)
    and 8 "unlisted binaries" findings. Confirmed via `git stash` multiple
    times across different sessions to be pre-existing and unrelated to
    whatever slice was being verified at the time — never fixed, always
    carried forward as accepted debt. Source: many `docs/CURRENT-HANDOFF.md`
    entries (e.g. the branding and School-Member Role Management entries).

33. **The recurring reviewer-agent retrieval/resume failure itself** is
    now root-caused (2026-09-07) as a Claude Code runtime/orchestration
    bug, not something this repository's configuration can fix. It is not
    a "feature," but it is a standing process gap that keeps generating
    Tier-1 review debt (see item 1) every time a milestone needs an
    independent review — worth tracking as an ongoing maintainability/
    process risk until Anthropic's tooling changes. Source:
    `docs/VERIFICATION-DEBT.md`'s "Reviewer-agent retrieval failure
    root-caused" entry.

### Tier 7 — Zero billing

No open items found in this tier specifically — the Official School
Repository's Microsoft 365/SharePoint dependency (Tier 4, item 25) and the
sync hub's Tailscale-for-remote-access option are the two provider-touching
decisions in the roadmap, and both are already recorded as zero-billing-
compatible choices (Tailscale free tier; SharePoint requires an
already-existing school-owned M365 tenant, not a new paid product LIKHA
would introduce).

### Tier 8 — Performance

No dedicated unbuilt performance feature was found recorded anywhere in
the audited docs as of this session.

### Tier 9 — Development speed

34. **A representative Android critical-workflow architecture proof** (My
    Day + Attendance, per ADR-0035's Wave 6) has not been started — Android
    as a target platform has no code at all yet. This sits at the lowest
    priority tier per LIKHA's own ordering (it's a platform/process
    milestone, not a security/compliance/usability gap on the already-
    shipped Windows product), but it is a real, large, wholly-unbuilt
    piece of the original three-platform product vision (Windows primary,
    Android teacher-mobile, Web/PWA secondary). Source: PRODUCT-CONTRACT.md
    §1, ADR-0035's Wave 6 (verified — no `android`/mobile build target,
    manifest, or platform-specific code found anywhere in the repo).

35. **Web/PWA target** — likewise entirely unstarted; no PWA manifest,
    service worker, or web-specific build config found. Source:
    PRODUCT-CONTRACT.md §1 (verified by absence).

---

## "Legacy LIKHA" — every distinct reference found in this repo's docs

Per this task's constraint, the actual legacy pre-0.2 LIKHA codebase was
not available to inspect. The following is every distinct mention this
repo's documentation makes of "legacy LIKHA" or a legacy predecessor
concept, quoted verbatim with its source. This is the closest available
answer to "what legacy features were not carried into 0.2," given the
actual legacy code isn't accessible from this audit.

1. **Product identity / general reference-only status.**

   > "Legacy LIKHA may be inspected as reference material only."
   > — `docs/product/PRODUCT-CONTRACT.md`, line 16 (under "Product
   > identity: LIKHA-SIS 0.2 — never '2.0,' never 'LIKHA 2.0.'")

2. **SF8 Health & Nutrition — the one place a specific legacy conceptual
   structure is invoked as a starting point for a still-unbuilt 0.2
   feature.**

   > "Keep the legacy conceptual split (learner/section-level data;
   > Baseline/Pretest consolidation; Endline/Posttest consolidation) as a
   > _starting point_, but revalidate formulas/templates before
   > implementing — do not assume legacy figures remain authoritative.
   > Tighter authorization needed (health data)."
   > — `docs/product/PRODUCT-CONTRACT.md`, §5's School Forms table, SF8 row.

3. **Grade 12 SHS curriculum carryover — "prior/legacy SHS curriculum,"
   used generically for the DepEd curriculum LIKHA-SIS 0.2 must still
   support for Grade 12, not a reference to legacy-LIKHA-the-application.**

   > "Grade 12: unaffected. Stays on the prior/legacy SHS curriculum —"
   > — `docs/adr/0037-curriculum-key-stage-versioning.md`, line 229.
   > (Included for completeness/transparency, but this "legacy" refers to a
   > DepEd curriculum generation, not to legacy LIKHA the product — flagged
   > here explicitly so it is not mistaken for a legacy-application
   > reference.)

4. **DO 8 s.2015 Grade 12 weighting carryover — same generic-curriculum
   sense, not legacy-LIKHA-the-application.**
   > "...five Grade 12 legacy applicability groups in DO 8 Table 5,"
   > "...those legacy weights, rather than Table 10's Strengthened-SHS
   > weights...," "...the legacy DO 8 assessment structure and the
   > applicable legacy subject-group..."
   > — `docs/adr/0068-grade12-do8-weighting-carryover.md` (multiple lines).
   > Same caveat as item 3: this is DepEd policy vintage, not the prior
   > LIKHA application.

No other distinct "legacy LIKHA" (the product) reference was found
anywhere in `docs/` beyond items 1 and 2 above. Every other "legacy" hit
in the repo (grading-period seed-data naming, `.xls`/BIFF "legacy Excel
format" in the form-engine ADRs, a migration converting old NULL-section
attendance rows, a Turso "legacy libSQL sync()" API mention in the
cloud-sync-decision ADR) refers to something else entirely — an old file
format, an old data shape, or a rejected cloud-sync candidate technology —
not the prior LIKHA product. These were confirmed and excluded rather than
silently assumed irrelevant.

---

## Items appearing in BOTH a legacy reference and a current 0.2 planning document

Exactly one item in this audit satisfies this: **SF8 Health & Nutrition**.

- **As a legacy artifact**: PRODUCT-CONTRACT.md's SF8 row explicitly
  instructs keeping "the legacy conceptual split (learner/section-level
  data; Baseline/Pretest consolidation; Endline/Posttest consolidation)"
  from legacy LIKHA as a _starting point_.
- **As a current 0.2 DIRECTION-SET item**: SF8 is listed in
  PRODUCT-CONTRACT.md's §5 School Forms table as "not built," with an
  explicit instruction that when it is eventually built, it should
  "revalidate formulas/templates before implementing — do not assume
  legacy figures remain authoritative," and that it needs "tighter
  authorization... (health data)."

This is the one confirmed case where a legacy-LIKHA structural decision is
carried forward as a _starting point_ for still-unbuilt 0.2 work, with an
explicit instruction not to trust the legacy figures without
revalidation. No other item in this audit's unbuilt-feature list was found
referenced in both a legacy-LIKHA passage and a current 0.2 planning
document — every other unbuilt 0.2 item (SF3, SF7, Teacher Tools, Official
School Repository, Android, Web/PWA, the schedule generator, etc.) is
recorded purely as a 0.2-native decision with no accompanying legacy
reference anywhere in the docs searched.

---

## Summary of the most significant PRODUCT-CONTRACT.md staleness corrections made in this audit

For traceability, beyond the three staleness examples the task itself
already flagged (SF1/SF9 authoritative output, school branding, Creation
Studio), this audit found and corrected:

- RBAC role-management UI: PRODUCT-CONTRACT.md §3 said "deliberately not
  built yet" — `SchoolMembershipScreen.tsx` (grant/revoke roles) shipped
  2026-09-06.
- "My Day": PRODUCT-CONTRACT.md §10 framed it as a pure, unstarted
  HYPOTHESIS — `MyDayScreen.tsx` shipped 2026-09-06 with real scope
  confirmed by the product owner (schedule + a conservative pending-tasks
  rail), though the School-Head variant and task-dismissal/notifications
  remain genuinely unbuilt as disclosed above.
- Sync (§12): PRODUCT-CONTRACT.md frames this section primarily as a
  _decision_ ("SCHOOL-LAPTOP HUB SELECTED"); as of 2026-09-07, sync is
  substantially **implemented**, not merely decided — 10 entities wired
  end-to-end through outbox/hub/pull with encryption, conflict review UI,
  device management UI, and sync-status UI all real and shipped. The
  genuinely remaining gaps are narrower and operational (see Tier 1/5
  above), not "no sync code exists" as an earlier PRODUCT-CONTRACT.md
  passage (§1) still states verbatim ("no sync code exists in the repo as
  of this reconciliation" — this specific sentence is now clearly stale
  and should be corrected in a future PRODUCT-CONTRACT.md reconciliation
  pass).
- SF1/SF9 formgen: corrected in the opposite direction from the task's own
  framing — the files exist, but reading them shows they are proven
  _architecture_ against _synthetic, non-authoritative_ templates, not a
  built authoritative-template output as the mere existence of
  `sf1.rs`/`sf9.rs` might suggest at a glance. See Tier 3, item 15 above
  for the precise, source-verified status.
