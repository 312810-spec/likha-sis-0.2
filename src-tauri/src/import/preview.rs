//! Orchestrates the read-only half of the pipeline: workbook → normalize →
//! validate → match → preview. Never writes anything — see
//! `import::commit` for the write path, which only ever runs after a
//! human has reviewed this preview and resolved every
//! `MatchKind::SuspectedDuplicate` row. See
//! `docs/adr/0043-sf1-bulk-import-engine.md`.

use std::path::Path;

use rusqlite::Connection;

use crate::error::AppResult;
use crate::import::sf1::{MatchKind, Sf1ImportPreview};
use crate::import::{matching, normalize, validate, workbook};

pub fn build_preview(
    conn: &Connection,
    school_id: &str,
    path: &Path,
) -> AppResult<Sf1ImportPreview> {
    let raw_rows = workbook::read_sf1_rows(path)?;

    let mut preview = Sf1ImportPreview {
        rows: Vec::new(),
        new_rows: Vec::new(),
        exact_matches: Vec::new(),
        needs_review: Vec::new(),
        errors: Vec::new(),
        warnings: Vec::new(),
    };

    for raw in &raw_rows {
        let normalized = normalize::normalize_row(raw);
        let issues = validate::validate_row(&normalized);

        if validate::has_error(&issues) {
            preview.errors.extend(issues);
            preview.rows.push(normalized);
            continue;
        }
        preview.warnings.extend(issues);

        let match_result = matching::classify_row(conn, school_id, &normalized)?;
        match match_result.kind {
            MatchKind::New => preview.new_rows.push(normalized.row_number),
            MatchKind::ExactLrn => preview.exact_matches.push(match_result),
            MatchKind::SuspectedDuplicate => preview.needs_review.push(match_result),
        }
        preview.rows.push(normalized);
    }

    Ok(preview)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::learner, repository::school};
    use std::path::Path as StdPath;

    fn open_test_db() -> Connection {
        db::open(StdPath::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn fixture(name: &str) -> std::path::PathBuf {
        StdPath::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    #[test]
    fn classifies_every_row_in_the_synthetic_fixture_as_the_scenario_it_encodes() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        // Pre-existing learner so the "GRACE SYNTHETIC / TORRES" row is a
        // suspected duplicate rather than new -- mirrors the fixture
        // generator's comment for that row.
        learner::create(&conn, &s.id, "Grace Synthetic", "Torres", None, None).unwrap();

        let preview = build_preview(&conn, &s.id, &fixture("sf1_synthetic_main.xls")).unwrap();

        // Row 7 (invalid LRN) and row 8 (missing family name) are hard
        // errors, excluded from new/matches/review entirely.
        assert!(preview
            .errors
            .iter()
            .any(|e| e.row_number == 7 && e.field == "lrn"));
        assert!(preview
            .errors
            .iter()
            .any(|e| e.row_number == 8 && e.field == "family_name"));
        // Rows 4, 5, 6 (clean), 9 (unrecognized sex -- warning only), and
        // 11 (unparseable birthdate -- warning only, informational field)
        // are all still new rows: a warning never blocks a row.
        for expected in [4, 5, 6, 9, 11] {
            assert!(
                preview.new_rows.contains(&expected),
                "row {expected} should be classified new"
            );
        }
        assert_eq!(preview.new_rows.len(), 5);
        assert!(preview
            .warnings
            .iter()
            .any(|w| w.row_number == 9 && w.field == "sex"));
        assert!(preview
            .warnings
            .iter()
            .any(|w| w.row_number == 11 && w.field == "birthdate"));
        // Row 10 (Grace Synthetic Torres, matches the pre-created learner
        // by name with no LRN) is a suspected duplicate.
        assert_eq!(preview.needs_review.len(), 1);
        assert_eq!(preview.needs_review[0].row_number, 10);
    }

    #[test]
    fn an_exact_lrn_match_is_never_also_reported_as_needing_review() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        learner::create(&conn, &s.id, "Ana", "Dela Cruz", Some("123456789012"), None).unwrap();

        let preview = build_preview(&conn, &s.id, &fixture("sf1_synthetic_main.xls")).unwrap();

        assert_eq!(preview.exact_matches.len(), 1);
        assert_eq!(preview.exact_matches[0].row_number, 4);
        assert!(!preview.needs_review.iter().any(|m| m.row_number == 4));
        assert!(!preview.new_rows.contains(&4));
    }

    #[test]
    fn re_importing_the_identical_file_after_a_full_new_import_classifies_everything_as_already_known(
    ) {
        let mut conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let section =
            crate::repository::section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita")
                .unwrap();

        let first_preview =
            build_preview(&conn, &s.id, &fixture("sf1_synthetic_main.xls")).unwrap();
        let plans: Vec<_> = first_preview
            .new_rows
            .iter()
            .map(|&row_number| {
                let row = first_preview
                    .rows
                    .iter()
                    .find(|r| r.row_number == row_number)
                    .unwrap();
                crate::import::sf1::Sf1RowCommitPlan {
                    row_number,
                    given_name: row.given_name.clone().unwrap(),
                    family_name: row.family_name.clone().unwrap(),
                    lrn: row.lrn.clone(),
                    sex: row.sex.clone(),
                    action: crate::import::sf1::Sf1RowAction::CreateNewLearner,
                }
            })
            .collect();
        let new_rows_committed = plans.len();
        crate::import::commit::commit_import(&mut conn, &s.id, &section.id, "2026-06-01", &plans)
            .unwrap();

        let second_preview =
            build_preview(&conn, &s.id, &fixture("sf1_synthetic_main.xls")).unwrap();

        assert_eq!(
            second_preview.new_rows.len(),
            0,
            "every row committed the first time must be recognized, not re-offered as new"
        );
        // Rows with an LRN the first time round now match by exact LRN;
        // rows without one match by name as a suspected duplicate --
        // never silently treated as brand new again.
        assert!(
            !second_preview.exact_matches.is_empty() || !second_preview.needs_review.is_empty()
        );
        assert_eq!(
            second_preview.exact_matches.len() + second_preview.needs_review.len(),
            new_rows_committed,
            "every previously-committed row must resurface as a match of some kind"
        );
    }
}
