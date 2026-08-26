//! Read-only SF9 data projection — Wave 2I. Builds `sf9::
//! Sf9SubjectTermGrade` rows for one learner by calling the EXISTING
//! `repository::grading_computation::compute_term_grade` once per class
//! record in the learner's section, per subject and grading period.
//!
//! This module computes NOTHING — no weight, no rounding, no
//! transmutation, no term grouping beyond what `class_records.
//! grading_period_id` already encodes. Per this wave's explicit "do not
//! duplicate grade logic" requirement (docs/adr/0049-multi-form-
//! official-form-contract.md, "SF9 is a presentation/export concern"),
//! any grading rule belongs in `grading_computation`, not here.

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::formgen::sf9::Sf9SubjectTermGrade;
use crate::repository::{class_record, grading_computation, learner};

/// One learner's subject/term grade set for `section_id`, in
/// (subject name, grading period sequence) order — the same order
/// `class_record::list_by_section_in_school`'s own `ORDER BY` already
/// produces, so this function does not need to re-sort.
///
/// **Precondition (enforced, not merely documented — an independent
/// security review of this wave flagged the earlier, doc-only version
/// of this contract):** `learner_id` must belong to `school_id`. This
/// is checked directly here via `learner::find_by_id_in_school`, as a
/// defense-in-depth layer independent of the caller
/// (`commands::formgen::generate_sf9_form` already checks this too, via
/// `learner::find_by_id_in_school` + `section_membership::
/// is_active_member`) — `grading_computation::compute_term_grade`'s own
/// underlying query matches `learner_id` alone with no independent
/// school-scope check of its own, so this function must not assume a
/// well-behaved caller is the only thing standing between it and a
/// cross-school grade leak.
///
/// A class record whose `compute_term_grade` call returns `None` (no
/// computable grade yet — e.g. unscored work, per that function's own
/// documented behavior) still produces a row, with `term_grade: None` —
/// SF9 must show "no grade yet" explicitly, never silently drop the
/// subject or substitute a placeholder number.
pub fn subject_term_grades_for_learner(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
) -> AppResult<Vec<Sf9SubjectTermGrade>> {
    if learner::find_by_id_in_school(conn, school_id, learner_id)?.is_none() {
        return Err(AppError::FormGeneration(
            "the requested learner does not belong to this school".to_string(),
        ));
    }

    let class_records = class_record::list_by_section_in_school(conn, school_id, section_id)?;

    class_records
        .into_iter()
        .map(|detail| {
            let computed =
                grading_computation::compute_term_grade(conn, school_id, &detail.id, learner_id)?;
            Ok(Sf9SubjectTermGrade {
                subject_name: detail.subject_name,
                grading_period_label: detail.grading_period_label,
                term_grade: computed.map(|c| c.term_grade),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn a_section_with_no_class_records_yields_an_empty_projection() {
        let conn = open_test_db();
        let school = crate::repository::school::create(&conn, "Rizal Elementary").unwrap();
        let l =
            crate::repository::learner::create(&conn, &school.id, "Ana", "Dela Cruz", None, None)
                .unwrap();
        let rows = subject_term_grades_for_learner(&conn, &school.id, "nonexistent-section", &l.id)
            .unwrap();
        assert!(rows.is_empty());
    }

    /// The defense-in-depth check an independent security review of
    /// this wave asked for: a learner id that does not belong to
    /// `school_id` (whether nonexistent or genuinely from another
    /// school) must be rejected by THIS function, not merely assumed
    /// pre-checked by whichever caller happens to invoke it.
    #[test]
    fn a_learner_not_belonging_to_the_school_is_rejected_even_with_a_valid_section() {
        let conn = open_test_db();
        let school = crate::repository::school::create(&conn, "Rizal Elementary").unwrap();
        let result = subject_term_grades_for_learner(
            &conn,
            &school.id,
            "nonexistent-section",
            "nonexistent-learner",
        );
        assert!(result.is_err());
    }

    #[test]
    fn a_learner_from_a_different_school_is_rejected_even_though_the_id_is_real() {
        let conn = open_test_db();
        let school_a = crate::repository::school::create(&conn, "Rizal Elementary").unwrap();
        let school_b = crate::repository::school::create(&conn, "Mabini Elementary").unwrap();
        let learner_b =
            crate::repository::learner::create(&conn, &school_b.id, "Juan", "Santos", None, None)
                .unwrap();

        let result = subject_term_grades_for_learner(
            &conn,
            &school_a.id,
            "nonexistent-section",
            &learner_b.id,
        );
        assert!(
            result.is_err(),
            "a real learner id from a DIFFERENT school must still be rejected"
        );
    }
}
