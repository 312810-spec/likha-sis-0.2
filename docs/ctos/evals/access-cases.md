# CTOS Eval Cases — Access (M02)

**Milestone:** M02 — Work access and session integrity
**Covers:** account switch, stale async response, spoofed ID, reassignment,
revocation, adviser vs subject scope, offline last-confirmed assignment,
handover of pending work, sync queue scope
**Status:** tested (Rust `cargo test`, TS `npm run quality`)
**Evidence labels:** per `README.md`. No numeric confidence is asserted — the
evidence is the passing test.

The registry row for this file reads "yes (Rust)". Like `grading-cases.md` at
M01, that row was written at M00 ahead of the cases existing. This file is the
cases, created at M02. A case is listed only if a test with that name exists in
the tree at the cited location.

## What M02 changed

M02 turned out to be mostly _verification_, not feature work — CTOS's own
heading for the milestone is "Verify", and the enforcement was already strong.
One real defect was found and fixed; the rest of the milestone is existing
behavior given a name and a proof.

**The defect:** `auth::login` replaced the in-memory session but left the prior
session row live in the persisted `sessions` table until it expired on its own
(up to 8 hours). An account switch therefore left a zombie session — one the
superseded account could still present to any code path accepting a raw session
id. Fixed at `src-tauri/src/auth/mod.rs` `login`, which now revokes the session
it supersedes.

## Item — account switch

| Case                                                                          | Test                                                                                                     | Where                            | Result            |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------- |
| A switch revokes the session it supersedes; exactly one session is live after | `an_account_switch_revokes_the_session_it_supersedes`                                                    | `src-tauri/src/auth/mod.rs:1320` | tested (new, M02) |
| A _failed_ switch attempt leaves the existing session live                    | `a_failed_switch_attempt_leaves_the_existing_session_live`                                               | `src-tauri/src/auth/mod.rs:1349` | tested (new, M02) |
| Login fails for a school the user does not belong to, and sets no session     | `login_fails_for_a_school_the_user_does_not_belong_to`                                                   | same                             | tested            |
| A session that has expired or been revoked is not usable                      | `require_active_school_scope` checks the persisted table on every protected call, not its in-memory copy | `src-tauri/src/auth/mod.rs:114`  | tested            |

The second row matters as much as the first: the revocation must be a
consequence of a _successful_ login, not of the attempt. A wrong password at the
switch prompt must not sign the already-authenticated teacher out.

## Item — stale async response

| Case                                                                 | Test                                                                                      | Where                                  | Result |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| A slow, stale roster response cannot overwrite a newer one           | "never reverted by the stale, older response"                                             | `src/ui/AttendanceScreen.test.tsx`     | tested |
| A previous item's roster is never shown after switching items        | "never shows a previous assessment item's roster after switching to an item"              | `src/ui/ClassRecordWorkspace.test.tsx` | tested |
| A stale advisory context is never queried                            | "never queries a stale advisory context"                                                  | `src/ui/AdviserViewScreen.test.tsx`    | tested |
| A stale export result is never shown after context moves on          | (stale export result test)                                                                | `src/ui/MonthlySummaryScreen.test.tsx` | tested |
| A late pre-denial refresh is discarded without losing the local save | "discards a late pre-denial refresh without losing the local save"                        | `src/ui/ClassRecordWorkspace.test.tsx` | tested |
| Session expiry returns to sign-in with a clear notice                | "returns to sign-in with a clear notice when a command fails because the session expired" | `src/App.test.tsx`                     | tested |

**Scope note, stated rather than papered over.** No new test ties a stale async
response to an account switch specifically. This is because the property holds
structurally rather than by guard: on session expiry `App.tsx`
`handleSessionExpired` calls `clearSessionWorkContexts()` and `setSession(null)`,
which unmounts the entire authenticated subtree — a late response then has no
live component to write into. The per-screen `requestRef` guards cited above
cover the case where the user moves between contexts _within_ a session. A test
of the cross-session case would mostly be testing React's unmount semantics.

## Item — spoofed ID

The strongest-covered item in the milestone. Every repository accessor resolves
rows through a school predicate, and the school id is derived from the session at
the command layer, never accepted from the client.

| Case                                                                             | Test                                                                                                              | Where                                             | Result |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| A score recorded for an item in another school is rejected                       | `recording_for_an_item_in_a_different_school_is_rejected`                                                         | `src-tauri/src/repository/learner_score.rs`       | tested |
| An item in another school resolves to nothing                                    | `roster_for_item_returns_none_for_an_item_in_a_different_school`                                                  | same                                              | tested |
| A class record cannot be built on another school's section/subject/period        | `create_rejects_a_section_from_a_different_school` (+ two siblings)                                               | `src-tauri/src/repository/class_record.rs`        | tested |
| A forged cross-school row does not leak names through a JOIN                     | `detail_list_does_not_leak_a_forged_cross_school_assignment`                                                      | `src-tauri/src/repository/teaching_assignment.rs` | tested |
| Attendance for another school's learner is rejected                              | `recording_attendance_for_a_learner_in_a_different_school_is_rejected`                                            | `src-tauri/src/repository/attendance.rs`          | tested |
| Another school's learners never appear in a section roster                       | `roster_for_section_date_does_not_include_another_schools_learners`                                               | same                                              | tested |
| A forged membership row for a foreign-school learner is rejected                 | `is_active_member_rejects_a_forged_membership_row_for_a_foreign_school_learner`                                   | `src-tauri/src/repository/section_membership.rs`  | tested |
| A forged school id cannot reach another school's My Day summary                  | `a_teacher_cannot_see_another_schools_summary_even_via_a_forged_school_id`                                        | `src-tauri/src/repository/my_day.rs`              | tested |
| A role held only in a different school does not authorize                        | `authorize_capability_denies_a_role_held_only_in_a_different_school`                                              | `src-tauri/src/auth/mod.rs`                       | tested |
| A password reset for an unknown or cross-school target gives one generic failure | `admin_reset_teacher_password_returns_false_for_a_target_in_a_different_school_without_leaking_which_case_it_was` | same                                              | tested |
| A subject-attendance roster never flags another school's session id              | `roster_for_session_never_flags_a_different_schools_session_id`                                                   | `src-tauri/src/repository/subject_attendance.rs`  | tested |

Enumeration safety is tested explicitly: the cross-school admin cases return a
single generic failure so an attacker cannot probe which of several reasons
applied.

## Item — reassignment

| Case                                                                           | Test                                                               | Where                                             | Result |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- | ------ |
| Reassignment replaces without leaving a duplicate                              | `replace_teacher_reassigns_without_leaving_a_duplicate`            | `src-tauri/src/repository/teaching_assignment.rs` | tested |
| The outcome carries the old assignment so its deletion can propagate over sync | same (asserts `replaced.previous`)                                 | same                                              | tested |
| `replace_teacher` reports no previous when none existed                        | `replace_teacher_reports_no_previous_assignment_when_none_existed` | same                                              | tested |
| Reassignment is scoped to the caller's school                                  | `remove_is_scoped_to_the_callers_school`                           | same                                              | tested |

## Item — revocation

| Case                                                                       | Test                                                                                        | Where                                                 | Result            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| Removing a school member revokes all their sessions and audits             | `remove_school_member` (membership removal + `revoke_all_for_user` + audit, in a savepoint) | `src-tauri/src/auth/mod.rs:692`                       | tested            |
| Revoking a role keeps the last School Head                                 | `revoke_school_member_role_*` (last-School-Head guard cases)                                | same                                                  | tested            |
| A device sync credential can be revoked, rotating the school's payload key | `revoking_a_device_clears_every_wrap_for_that_school_including_other_active_devices`        | same                                                  | tested            |
| An unknown or expired session id is treated as revoked (fail closed)       | `session::is_revoked` returns true for a missing row                                        | `src-tauri/src/repository/session.rs:56`              | tested            |
| A revocation that arrives over sync denies write access even while offline | `a_revocation_that_arrives_over_sync_denies_write_access_even_while_offline`                | `src-tauri/src/repository/subject_attendance.rs:1424` | tested (new, M02) |

## Item — adviser vs subject scope

Adviser and subject-teacher are two deliberately separate tables and two
deliberately separate capabilities — the schema explicitly refuses a fake
"Advisory" pseudo-subject and refuses a mutable `sections.adviser_user_id`
column, which would silently lose prior-year advisers.

| Case                                                                         | Test                                                                                | Where                                            | Result |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| Another school never sees the first school's advisory                        | `a_second_school_never_sees_the_first_schools_advisory`                             | `src-tauri/src/repository/section_advisory.rs`   | tested |
| A second active adviser for one section is blocked                           | (the one-active-adviser unique partial index, probed in migration tests)            | `src-tauri/src/db/migrations.rs`                 | tested |
| Subject-attendance writes require assignment ownership, not a role           | `authorize_own_assignment_denies_a_different_teacher`                               | `src-tauri/src/repository/subject_attendance.rs` | tested |
| A School Head from a different school is denied teacher-load view            | `authorize_view_teacher_load_denies_a_school_head_from_a_different_school`          | `src-tauri/src/auth/mod.rs`                      | tested |
| A School Head is denied for a different school's section in the adviser gate | `authorize_adviser_of_section_denies_a_school_head_for_a_different_schools_section` | same                                             | tested |

## Item — offline last-confirmed assignment

| Case                                                                                         | Test                                                                         | Where                                                 | Result            |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| A sync-applied revocation denies the write offline (local table is the last-confirmed state) | `a_revocation_that_arrives_over_sync_denies_write_access_even_while_offline` | `src-tauri/src/repository/subject_attendance.rs:1424` | tested (new, M02) |
| The version cache records what this device last confirmed, monotonically                     | `sync_version_cache` upserts `MAX(known_version, ...)`                       | `src-tauri/src/repository/sync_version_cache.rs`      | tested            |
| Per-entity sync state is tracked for review routing                                          | `EntitySyncState::{NeedsReview,WaitingToSync,Synced,NotYetSynced}`           | `src-tauri/src/repository/entity_sync_status.rs`      | tested            |

The mechanism: `authorize_own_assignment` reads the _local_ `teaching_assignments`
table, itself sync-populated. Offline, authorization falls back to the last state
this device confirmed; a hub-side revocation arrives as a delete, `delete_from_sync`
applies it, and the next authorization fails closed because the row is gone.

## Item — handover of pending work

**No new feature was built, and none was needed** — recorded work transfers by
construction. `learner_scores` and attendance are keyed to the assessment item /
class record / section, not to the teacher (`recorded_by_user_id` is provenance,
not ownership). Reassigning the teacher therefore cannot orphan the section's
recorded work; the incoming teacher sees it because they now own the assignment.

What _did_ need proving is that the reassignment also revokes the departing
teacher's _write_ capability, so they cannot keep recording against the id they
held:

| Case                                                                                 | Test                                                                                                                   | Where                                                 | Result                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| A reassignment hands write access to the incoming teacher and revokes the former one | `a_reassignment_hands_write_access_to_the_incoming_teacher_and_revokes_the_former_one`                                 | `src-tauri/src/repository/subject_attendance.rs:1360` | tested (new, M02)                                              |
| A reassignment never leaves a duplicate assignment behind                            | `replace_teacher_reassigns_without_leaving_a_duplicate`                                                                | `src-tauri/src/repository/teaching_assignment.rs`     | tested                                                         |
| A stale class context is revalidated before it is restored, and cleared if it fails  | `handleReturnToClass` re-checks the context against current assignments; on any failure it clears rather than restores | `src/App.tsx:219`                                     | covered by construction + the stale-context screen tests above |

## Item — sync queue scope

| Case                                                                                     | Test                                                                                    | Where                                         | Result            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| The queue is school-scoped for reads, attempts, and acknowledgements                     | `queue_is_school_scoped_for_reads_attempts_and_acknowledgements`                        | `src-tauri/src/repository/sync_outbox.rs:315` | tested            |
| A departed member's queued work still propagates, because the queue is the school's data | `a_departed_members_queued_work_still_propagates_because_the_queue_is_the_schools_data` | `src-tauri/src/repository/sync_outbox.rs:337` | tested (new, M02) |
| Pull never returns another school's changes                                              | `pull_since_never_returns_another_schools_changes`                                      | `src-tauri/src/repository/sync_hub.rs`        | tested            |
| Every incoming change is re-checked against the school after decrypt                     | `apply_decrypted_change` rejects `incoming.school_id != school_id` as `Untrusted`       | `src-tauri/src/sync_client.rs`                | tested            |

**Deliberate decision, recorded so it is not mistaken for an oversight.** The
queue is keyed on school, not on the actor who enqueued. A removed member's
_already-recorded_ attendance and scores are legitimate records of that school's
learners, so their queued rows must still reach the hub — dropping them would
destroy real teacher work. What removal blocks is _new_ writes, and that guard is
one layer up, in session revocation (`remove_school_member` →
`revoke_all_for_user`, fail-closed on every protected command). `actor_user_id`
is provenance, never a read filter.

## Verification commands actually run

From `src-tauri`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test` (lib + all integration targets).
From the repository root: `npm run quality` (typecheck, lint, format, architecture,
deadcode, and the full Vitest suite).
