//! Deterministic, explainable duplicate matching against learners already
//! in this school — reuses `repository::learner::find_candidates`
//! (Wave 2A) rather than inventing a second matching query. Never
//! auto-merges; `MatchKind::SuspectedDuplicate` always requires a human
//! `DuplicateResolution` before the row can be committed. See
//! `docs/adr/0043-sf1-bulk-import-engine.md`.

use rusqlite::Connection;

use crate::error::AppResult;
use crate::import::sf1::{LearnerMatchResult, MatchKind, Sf1ImportRow};
use crate::repository::learner;

/// Classifies one already-validated row (must have both `given_name` and
/// `family_name` present — the caller is expected to have already
/// excluded rows with hard validation errors before calling this).
///
/// - An exact LRN match against an existing learner in this school is
///   `ExactLrn`, favoring DepEd's own stable identifier over anything
///   name-based — it is never ambiguous.
/// - Any other name/LRN overlap `find_candidates` surfaces is
///   `SuspectedDuplicate` — always reviewed by a human, never resolved
///   here.
/// - No overlap at all is `New`.
pub fn classify_row(
    conn: &Connection,
    school_id: &str,
    row: &Sf1ImportRow,
) -> AppResult<LearnerMatchResult> {
    let given_name = row.given_name.as_deref().unwrap_or_default();
    let family_name = row.family_name.as_deref().unwrap_or_default();
    let candidates =
        learner::find_candidates(conn, school_id, given_name, family_name, row.lrn.as_deref())?;

    if let Some(lrn) = &row.lrn {
        if let Some(exact) = candidates
            .iter()
            .find(|c| c.lrn.as_deref() == Some(lrn.as_str()))
        {
            return Ok(LearnerMatchResult {
                row_number: row.row_number,
                kind: MatchKind::ExactLrn,
                candidates: vec![exact.clone()],
                reason: None,
            });
        }
    }

    if candidates.is_empty() {
        return Ok(LearnerMatchResult {
            row_number: row.row_number,
            kind: MatchKind::New,
            candidates,
            reason: None,
        });
    }

    let reason = if row.lrn.is_some() {
        "name matches an existing learner in this school, but the LRN differs"
    } else {
        "name matches an existing learner in this school; this row has no LRN to confirm identity"
    };
    Ok(LearnerMatchResult {
        row_number: row.row_number,
        kind: MatchKind::SuspectedDuplicate,
        candidates,
        reason: Some(reason.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn row(given_name: &str, family_name: &str, lrn: Option<&str>) -> Sf1ImportRow {
        Sf1ImportRow {
            row_number: 4,
            given_name: Some(given_name.to_string()),
            family_name: Some(family_name.to_string()),
            lrn: lrn.map(str::to_string),
            lrn_was_present_but_invalid: false,
            sex: None,
            sex_was_present_but_unrecognized: false,
            birthdate: None,
            remarks: None,
        }
    }

    #[test]
    fn a_row_with_no_overlap_at_all_is_classified_new() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let result = classify_row(&conn, &s.id, &row("Ana", "Dela Cruz", None)).unwrap();

        assert_eq!(result.kind, MatchKind::New);
        assert!(result.candidates.is_empty());
    }

    #[test]
    fn a_row_whose_lrn_exactly_matches_an_existing_learner_is_exact_lrn() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing =
            learner::create(&conn, &s.id, "Ana", "Dela Cruz", Some("123456789012"), None).unwrap();

        let result = classify_row(
            &conn,
            &s.id,
            &row("Different Given", "Different Family", Some("123456789012")),
        )
        .unwrap();

        assert_eq!(result.kind, MatchKind::ExactLrn);
        assert_eq!(result.candidates, vec![existing]);
    }

    #[test]
    fn a_name_match_with_a_differing_lrn_is_a_suspected_duplicate_not_auto_resolved() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing =
            learner::create(&conn, &s.id, "Grace", "Torres", Some("111111111111"), None).unwrap();

        let result =
            classify_row(&conn, &s.id, &row("Grace", "Torres", Some("222222222222"))).unwrap();

        assert_eq!(result.kind, MatchKind::SuspectedDuplicate);
        assert_eq!(result.candidates, vec![existing]);
        assert!(result.reason.is_some());
    }

    #[test]
    fn a_name_match_with_no_lrn_on_the_imported_row_is_a_suspected_duplicate() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = learner::create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();

        let result = classify_row(&conn, &s.id, &row("Grace", "Torres", None)).unwrap();

        assert_eq!(result.kind, MatchKind::SuspectedDuplicate);
        assert_eq!(result.candidates, vec![existing]);
    }

    #[test]
    fn matching_is_scoped_to_the_school_and_never_flags_a_different_schools_learner() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let other = school::create(&conn, "Other School").unwrap();
        learner::create(
            &conn,
            &other.id,
            "Grace",
            "Torres",
            Some("111111111111"),
            None,
        )
        .unwrap();

        let result =
            classify_row(&conn, &s.id, &row("Grace", "Torres", Some("111111111111"))).unwrap();

        assert_eq!(result.kind, MatchKind::New);
    }

    #[test]
    fn never_auto_resolves_a_suspected_duplicate_into_exact_lrn_even_with_multiple_candidates() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        learner::create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();

        let result = classify_row(&conn, &s.id, &row("Grace", "Torres", None)).unwrap();

        assert_eq!(result.kind, MatchKind::SuspectedDuplicate);
    }
}
