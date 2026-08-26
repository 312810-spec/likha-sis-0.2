//! Transactional commit of an approved SF1 import batch. One
//! `rusqlite::Transaction` for the whole batch — if any row fails, nothing
//! in the batch is written (`Transaction::drop` rolls back automatically
//! when `commit()` was never reached; see the failure-injection test
//! below). Reuses `repository::learner::create` and
//! `repository::section_membership::enroll` unchanged — `Transaction`
//! derefs to `Connection`, so no repository signature needed to change
//! for this milestone. See `docs/adr/0043-sf1-bulk-import-engine.md`.

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::import::sf1::{Sf1ImportSummary, Sf1RowAction, Sf1RowCommitPlan};
use crate::repository::{learner, section_membership, sf1_import_history};

/// Commits every plan in `plans` as one atomic batch, scoped to
/// `school_id`/`section_id`. Callers must only pass plans already
/// cleared for writing — no unresolved validation errors, no
/// `SuspectedDuplicate` without a resolution (see `Sf1RowCommitPlan`'s
/// doc comment); this function does not re-validate, it only writes.
///
/// `EnrollExistingLearner` reuses `section_membership::enroll`, which is
/// itself idempotent for re-enrolling into the same section — so
/// re-importing the same file and resolving its matches as
/// `UseExisting` a second time does not create a duplicate active
/// membership (see ADR-0043's "Re-import / Idempotency" section).
///
/// `actor_user_id`/`actor_username`/`source_filename`/`source_fingerprint`
/// (Wave 2E) exist solely to write one `sf1_import_history` row —
/// **inside this same transaction**, immediately before `tx.commit()` —
/// so a history row exists if and only if the batch it describes actually
/// committed (see migration 19's comment for why that removes the need
/// for a `status` column entirely). None of these four values affect
/// what gets written to `learners`/`section_memberships`; they are pure
/// provenance for the history row.
#[allow(clippy::too_many_arguments)]
pub fn commit_import(
    conn: &mut Connection,
    school_id: &str,
    section_id: &str,
    starts_on: &str,
    plans: &[Sf1RowCommitPlan],
    actor_user_id: Option<&str>,
    actor_username: &str,
    source_filename: &str,
    source_fingerprint: &str,
) -> AppResult<Sf1ImportSummary> {
    // The application-service layer already rejects an empty plan before
    // ever calling this command (see `Sf1ImportApplicationService.commitImport`
    // in the frontend) -- this is the server-side backstop for the same
    // rule, since this command must never trust a caller-side check alone.
    // Without it, an empty batch would still write a "0 rows, 0 learners"
    // `sf1_import_history` row, silently weakening migration 19's
    // existence-implies-a-real-import invariant (caught by independent
    // architecture review).
    if plans.is_empty() {
        return Err(AppError::Import("there is nothing to import".to_string()));
    }

    let tx = conn.transaction()?;
    let mut new_learners_created = 0usize;
    let mut existing_learners_enrolled = 0usize;

    for plan in plans {
        let learner_id = match &plan.action {
            Sf1RowAction::CreateNewLearner => {
                let created = learner::create(
                    &tx,
                    school_id,
                    &plan.given_name,
                    &plan.family_name,
                    plan.lrn.as_deref(),
                    plan.sex.as_deref(),
                )?;
                new_learners_created += 1;
                created.id
            }
            Sf1RowAction::EnrollExistingLearner { learner_id } => {
                existing_learners_enrolled += 1;
                learner_id.clone()
            }
        };

        section_membership::enroll(&tx, school_id, section_id, &learner_id, starts_on)?
            .ok_or_else(|| {
                AppError::Import(
                    "section or learner could not be resolved for enrollment".to_string(),
                )
            })?;
    }

    let summary = Sf1ImportSummary {
        rows_committed: plans.len(),
        new_learners_created,
        existing_learners_enrolled,
    };

    sf1_import_history::record(
        &tx,
        school_id,
        section_id,
        actor_user_id,
        actor_username,
        source_filename,
        source_fingerprint,
        &summary,
    )?;

    tx.commit()?;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::sf1::Sf1RowAction;
    use crate::{db, repository::school, repository::section};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// Test-only convenience wrapper supplying fixed Wave 2E provenance
    /// arguments so the pre-existing behavioral tests below don't each
    /// need to restate them — the history-specific tests further down
    /// call `commit_import` directly to exercise those arguments.
    fn commit(
        conn: &mut Connection,
        school_id: &str,
        section_id: &str,
        starts_on: &str,
        plans: &[Sf1RowCommitPlan],
    ) -> AppResult<Sf1ImportSummary> {
        commit_import(
            conn,
            school_id,
            section_id,
            starts_on,
            plans,
            None,
            "test.teacher",
            "sf1_test.xlsx",
            "test-fingerprint",
        )
    }

    fn new_learner_plan(
        row_number: usize,
        given: &str,
        family: &str,
        lrn: Option<&str>,
    ) -> Sf1RowCommitPlan {
        Sf1RowCommitPlan {
            row_number,
            given_name: given.to_string(),
            family_name: family.to_string(),
            lrn: lrn.map(str::to_string),
            sex: None,
            action: Sf1RowAction::CreateNewLearner,
        }
    }

    #[test]
    fn commits_a_batch_of_new_learners_and_enrolls_them() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let plans = vec![
            new_learner_plan(4, "Ana", "Dela Cruz", Some("123456789012")),
            new_learner_plan(5, "Ben", "Santos", None),
        ];

        let summary = commit(&mut conn, &s.id, &section.id, "2026-06-01", &plans).unwrap();

        assert_eq!(summary.rows_committed, 2);
        assert_eq!(summary.new_learners_created, 2);
        assert_eq!(summary.existing_learners_enrolled, 0);
        assert_eq!(learner::list_by_school(&conn, &s.id).unwrap().len(), 2);
        let roster =
            section_membership::roster_for_section(&conn, &s.id, &section.id, "2026-06-01")
                .unwrap();
        assert_eq!(roster.len(), 2);
    }

    #[test]
    fn enrolling_an_existing_learner_does_not_create_a_second_learner_record() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let existing = learner::create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();
        let plans = vec![Sf1RowCommitPlan {
            row_number: 4,
            given_name: "Grace".to_string(),
            family_name: "Torres".to_string(),
            lrn: None,
            sex: None,
            action: Sf1RowAction::EnrollExistingLearner {
                learner_id: existing.id.clone(),
            },
        }];

        let summary = commit(&mut conn, &s.id, &section.id, "2026-06-01", &plans).unwrap();

        assert_eq!(summary.new_learners_created, 0);
        assert_eq!(summary.existing_learners_enrolled, 1);
        assert_eq!(learner::list_by_school(&conn, &s.id).unwrap().len(), 1);
    }

    #[test]
    fn re_enrolling_the_same_learner_into_the_same_section_is_idempotent() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let existing = learner::create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();
        let plan = Sf1RowCommitPlan {
            row_number: 4,
            given_name: "Grace".to_string(),
            family_name: "Torres".to_string(),
            lrn: None,
            sex: None,
            action: Sf1RowAction::EnrollExistingLearner {
                learner_id: existing.id.clone(),
            },
        };

        commit(
            &mut conn,
            &s.id,
            &section.id,
            "2026-06-01",
            std::slice::from_ref(&plan),
        )
        .unwrap();
        commit(
            &mut conn,
            &s.id,
            &section.id,
            "2026-06-01",
            std::slice::from_ref(&plan),
        )
        .unwrap();

        let roster =
            section_membership::roster_for_section(&conn, &s.id, &section.id, "2026-06-01")
                .unwrap();
        assert_eq!(
            roster.len(),
            1,
            "re-importing and re-resolving the same row twice must not double-enroll"
        );
    }

    /// The transaction/rollback proof this milestone explicitly requires:
    /// a batch where a later row fails (here, a duplicate LRN violating
    /// the same DB constraint a legitimate double-import would hit) must
    /// leave NOTHING from the batch committed -- not even the earlier
    /// rows that would have individually succeeded.
    #[test]
    fn a_failure_partway_through_the_batch_rolls_back_the_entire_batch() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let plans = vec![
            new_learner_plan(4, "Ana", "Dela Cruz", Some("123456789012")),
            new_learner_plan(5, "Ben", "Santos", Some("123456789012")), // same LRN -- will violate the unique index
            new_learner_plan(6, "Carla", "Reyes", Some("223456789012")),
        ];

        let result = commit(&mut conn, &s.id, &section.id, "2026-06-01", &plans);

        assert!(result.is_err());
        assert_eq!(
            learner::list_by_school(&conn, &s.id).unwrap().len(),
            0,
            "row 4 must not remain committed just because it came before the failing row"
        );
        assert_eq!(
            section_membership::roster_for_section(&conn, &s.id, &section.id, "2026-06-01")
                .unwrap()
                .len(),
            0
        );
    }

    #[test]
    fn commit_fails_for_a_section_belonging_to_a_different_school_and_rolls_back() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();
        let foreign_section =
            section::create(&conn, &other_school.id, "2026-2027", "Grade 1", "X").unwrap();
        let plans = vec![new_learner_plan(4, "Ana", "Dela Cruz", None)];

        let result = commit(&mut conn, &s.id, &foreign_section.id, "2026-06-01", &plans);

        assert!(result.is_err());
        assert_eq!(learner::list_by_school(&conn, &s.id).unwrap().len(), 0);
    }

    // -- Wave 2E: import history --------------------------------------

    #[test]
    fn an_empty_plan_is_rejected_server_side_and_writes_no_phantom_history_row() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();

        let result = commit(&mut conn, &s.id, &section.id, "2026-06-01", &[]);

        assert!(result.is_err());
        assert_eq!(
            sf1_import_history::list_for_school(&conn, &s.id, 10)
                .unwrap()
                .len(),
            0,
            "an empty commit must not write a '0 rows, 0 learners' history row"
        );
    }

    #[test]
    fn a_successful_commit_records_one_history_row_with_the_backend_computed_counts() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let actor = crate::repository::user::create_user(&conn, "ana.cruz", "password", "Ana Cruz")
            .unwrap();
        let plans = vec![
            new_learner_plan(4, "Ana", "Dela Cruz", Some("123456789012")),
            new_learner_plan(5, "Ben", "Santos", None),
        ];

        commit_import(
            &mut conn,
            &s.id,
            &section.id,
            "2026-06-01",
            &plans,
            Some(&actor.id),
            "ana.cruz",
            "sf1_grade1.xlsx",
            "abc123fingerprint",
        )
        .unwrap();

        let history = sf1_import_history::list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].username, "ana.cruz");
        assert_eq!(history[0].user_id, Some(actor.id.clone()));
        assert_eq!(history[0].source_filename, "sf1_grade1.xlsx");
        assert_eq!(history[0].source_fingerprint, "abc123fingerprint");
        assert_eq!(history[0].rows_committed, 2);
        assert_eq!(history[0].new_learners_created, 2);
        assert_eq!(history[0].existing_learners_enrolled, 0);
    }

    /// The property this milestone's design depends on: a history row
    /// must never outlive the batch it describes. Reuses the same
    /// duplicate-LRN failure as
    /// `a_failure_partway_through_the_batch_rolls_back_the_entire_batch`,
    /// but asserts on `sf1_import_history` instead of `learners` — proving
    /// the history insert shares the same transaction, not just that the
    /// learner writes do.
    #[test]
    fn a_failed_commit_leaves_no_history_row_behind() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let plans = vec![
            new_learner_plan(4, "Ana", "Dela Cruz", Some("123456789012")),
            new_learner_plan(5, "Ben", "Santos", Some("123456789012")),
        ];

        let result = commit(&mut conn, &s.id, &section.id, "2026-06-01", &plans);

        assert!(result.is_err());
        assert_eq!(
            sf1_import_history::list_for_school(&conn, &s.id, 10)
                .unwrap()
                .len(),
            0,
            "a rolled-back batch must not leave a history row claiming it happened"
        );
    }

    #[test]
    fn re_importing_the_same_file_twice_records_two_separate_history_rows() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let existing = learner::create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();
        let plan = Sf1RowCommitPlan {
            row_number: 4,
            given_name: "Grace".to_string(),
            family_name: "Torres".to_string(),
            lrn: None,
            sex: None,
            action: Sf1RowAction::EnrollExistingLearner {
                learner_id: existing.id.clone(),
            },
        };

        for _ in 0..2 {
            commit_import(
                &mut conn,
                &s.id,
                &section.id,
                "2026-06-01",
                std::slice::from_ref(&plan),
                None,
                "ana.cruz",
                "sf1_grade1.xlsx",
                "same-fingerprint",
            )
            .unwrap();
        }

        let history = sf1_import_history::list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(
            history.len(),
            2,
            "each legitimate re-import attempt is its own auditable event, \
             even though the enrollment itself was idempotent"
        );
        assert!(history.iter().all(|h| h.existing_learners_enrolled == 1));
    }

    #[test]
    fn history_from_one_school_is_never_visible_when_listing_another() {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let other = school::create(&conn, "Other School").unwrap();
        let section = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let plans = vec![new_learner_plan(4, "Ana", "Dela Cruz", None)];

        commit(&mut conn, &s.id, &section.id, "2026-06-01", &plans).unwrap();

        assert_eq!(
            sf1_import_history::list_for_school(&conn, &other.id, 10)
                .unwrap()
                .len(),
            0
        );
    }
}
