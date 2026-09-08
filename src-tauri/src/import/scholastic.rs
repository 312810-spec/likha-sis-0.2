//! Orchestrates the DepEd `.xlsx` multi-year scholastic importer:
//! workbook → normalize/validate → match-by-LRN → preview →
//! (human review) → commit. Follows this project's established SF1
//! bulk-import UX **shape** (preview → duplicate-review → commit) —
//! `docs/adr/0043-sf1-bulk-import-engine.md` — deliberately not its
//! exact module split (`normalize`/`validate`/`matching` as separate
//! files): this importer is a single-purpose, much smaller pipeline, so
//! that machinery lives in this one file instead. See
//! `docs/adr/0074-xlsx-scholastic-importer.md`.
//!
//! **Never creates a learner.** Unlike SF1 (which enrolls NEW learners),
//! this importer only ever attaches history to an EXISTING learner,
//! matched by LRN — a row with no LRN match is surfaced for human review
//! and never silently turned into a new enrollment.

use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

use crate::error::AppResult;
use crate::import::scholastic_workbook::{read_scholastic_rows, RawScholasticRow};
use crate::repository::scholastic_history;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RowOutcome {
    /// Matched an existing learner by LRN, not already imported for this
    /// school year + subject — ready to commit as-is.
    Ready { learner_id: String },
    /// Matched an existing learner, but a history row for this exact
    /// school year + subject already exists — needs human review before
    /// committing (never silently overwritten; the schema's own
    /// `UNIQUE` constraint would reject a blind re-insert anyway).
    AlreadyImported { learner_id: String },
    /// No LRN cell, or no learner in this school currently has it.
    NoMatchingLearner,
    /// The LRN was present and matched, but the row itself has a data
    /// problem (missing/out-of-range final grade, missing subject name)
    /// — blocks commit for this row regardless of the LRN match.
    Invalid { reason: String },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScholasticPreviewRow {
    pub row_number: usize,
    pub lrn: Option<String>,
    pub school_year: Option<String>,
    pub grade_level: Option<String>,
    pub subject_name: Option<String>,
    pub final_grade: Option<i64>,
    pub remarks: Option<String>,
    pub source_school_name: Option<String>,
    pub outcome: RowOutcome,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScholasticImportPreview {
    pub rows: Vec<ScholasticPreviewRow>,
}

fn find_learner_by_lrn(conn: &Connection, school_id: &str, lrn: &str) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT id FROM learners WHERE school_id = ?1 AND lrn = ?2",
        (school_id, lrn),
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

fn classify_row(
    conn: &Connection,
    school_id: &str,
    raw: &RawScholasticRow,
) -> AppResult<ScholasticPreviewRow> {
    let final_grade = raw
        .final_grade
        .as_deref()
        .and_then(|s| s.trim().parse::<i64>().ok());

    let outcome = if raw.subject_name.as_deref().unwrap_or("").trim().is_empty() {
        RowOutcome::Invalid {
            reason: "missing subject name".to_string(),
        }
    } else if raw.school_year.as_deref().unwrap_or("").trim().is_empty() {
        RowOutcome::Invalid {
            reason: "missing school year".to_string(),
        }
    } else if !matches!(final_grade, Some(g) if (60..=100).contains(&g)) {
        RowOutcome::Invalid {
            reason: "final grade missing or outside the 60-100 DepEd passing scale".to_string(),
        }
    } else {
        match raw.lrn.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            None => RowOutcome::NoMatchingLearner,
            Some(lrn) => match find_learner_by_lrn(conn, school_id, lrn)? {
                None => RowOutcome::NoMatchingLearner,
                Some(learner_id) => {
                    let already = scholastic_history::exists(
                        conn,
                        school_id,
                        &learner_id,
                        raw.school_year.as_deref().unwrap_or(""),
                        raw.subject_name.as_deref().unwrap_or(""),
                    )?;
                    if already {
                        RowOutcome::AlreadyImported { learner_id }
                    } else {
                        RowOutcome::Ready { learner_id }
                    }
                }
            },
        }
    };

    Ok(ScholasticPreviewRow {
        row_number: raw.row_number,
        lrn: raw.lrn.clone(),
        school_year: raw.school_year.clone(),
        grade_level: raw.grade_level.clone(),
        subject_name: raw.subject_name.clone(),
        final_grade,
        remarks: raw.remarks.clone(),
        source_school_name: raw.source_school_name.clone(),
        outcome,
    })
}

/// Read-only: parses the workbook and classifies every row. Writes
/// nothing — matches `import::preview::build_preview`'s own contract.
pub fn build_preview(
    conn: &Connection,
    school_id: &str,
    path: &Path,
) -> AppResult<ScholasticImportPreview> {
    let raw_rows = read_scholastic_rows(path)?;
    let mut rows = Vec::with_capacity(raw_rows.len());
    for raw in &raw_rows {
        rows.push(classify_row(conn, school_id, raw)?);
    }
    Ok(ScholasticImportPreview { rows })
}

/// One row a caller has already decided to commit — only `Ready` rows
/// from a preview should ever be turned into a plan; the commit function
/// itself re-validates the grade bound (defense in depth against a
/// forged plan) but does not re-run LRN matching or duplicate detection,
/// matching `import::commit::commit_import`'s "trust the caller's
/// already-reviewed decision" contract for the SF1 pipeline.
#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScholasticCommitPlan {
    pub learner_id: String,
    pub school_year: String,
    pub grade_level: String,
    pub subject_name: String,
    pub final_grade: i64,
    pub remarks: Option<String>,
    pub source_school_name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScholasticImportSummary {
    pub imported_count: usize,
    pub skipped_count: usize,
}

/// Commits an already-reviewed batch as one atomic transaction — if any
/// plan fails (e.g. an out-of-bounds grade slipped through, or the
/// schema's own `UNIQUE` constraint rejects a duplicate), nothing in the
/// batch is written.
pub fn commit_scholastic_import(
    conn: &mut Connection,
    school_id: &str,
    plans: &[ScholasticCommitPlan],
    imported_by_user_id: Option<&str>,
) -> AppResult<ScholasticImportSummary> {
    let tx = conn.transaction()?;
    let mut imported_count = 0;
    let mut skipped_count = 0;

    for plan in plans {
        if !(60..=100).contains(&plan.final_grade) {
            skipped_count += 1;
            continue;
        }
        scholastic_history::insert(
            &tx,
            school_id,
            &plan.learner_id,
            &plan.school_year,
            &plan.grade_level,
            &plan.subject_name,
            plan.final_grade,
            plan.remarks.as_deref(),
            plan.source_school_name.as_deref(),
            imported_by_user_id,
        )?;
        imported_count += 1;
    }

    tx.commit()?;
    Ok(ScholasticImportSummary {
        imported_count,
        skipped_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path as StdPath;

    fn setup() -> (Connection, String) {
        let conn =
            crate::db::open(StdPath::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let school = crate::repository::school::create(&conn, "Rizal Elementary").unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn) \
             VALUES ('l1', ?1, 'Ana', 'Delacruz', '123456789012')",
            (&school.id,),
        )
        .unwrap();
        (conn, school.id)
    }

    fn raw_row(lrn: Option<&str>, subject: &str, grade: &str) -> RawScholasticRow {
        RawScholasticRow {
            row_number: 2,
            lrn: lrn.map(String::from),
            school_year: Some("2024-2025".to_string()),
            grade_level: Some("4".to_string()),
            subject_name: Some(subject.to_string()),
            final_grade: Some(grade.to_string()),
            remarks: None,
            source_school_name: Some("Synthetic Prior School".to_string()),
        }
    }

    #[test]
    fn classify_row_matches_an_existing_learner_by_lrn() {
        let (conn, school_id) = setup();
        let row = classify_row(
            &conn,
            &school_id,
            &raw_row(Some("123456789012"), "Mathematics", "88"),
        )
        .unwrap();
        assert_eq!(
            row.outcome,
            RowOutcome::Ready {
                learner_id: "l1".to_string()
            }
        );
    }

    #[test]
    fn classify_row_flags_an_unmatched_lrn() {
        let (conn, school_id) = setup();
        let row = classify_row(
            &conn,
            &school_id,
            &raw_row(Some("999999999999"), "Mathematics", "88"),
        )
        .unwrap();
        assert_eq!(row.outcome, RowOutcome::NoMatchingLearner);
    }

    #[test]
    fn classify_row_flags_a_missing_lrn() {
        let (conn, school_id) = setup();
        let row = classify_row(&conn, &school_id, &raw_row(None, "Mathematics", "88")).unwrap();
        assert_eq!(row.outcome, RowOutcome::NoMatchingLearner);
    }

    #[test]
    fn classify_row_flags_an_out_of_bounds_grade_as_invalid() {
        let (conn, school_id) = setup();
        let row = classify_row(
            &conn,
            &school_id,
            &raw_row(Some("123456789012"), "Mathematics", "45"),
        )
        .unwrap();
        assert!(matches!(row.outcome, RowOutcome::Invalid { .. }));
    }

    #[test]
    fn classify_row_flags_a_row_already_imported_for_the_same_year_and_subject() {
        let (conn, school_id) = setup();
        scholastic_history::insert(
            &conn,
            &school_id,
            "l1",
            "2024-2025",
            "4",
            "Mathematics",
            85,
            None,
            None,
            None,
        )
        .unwrap();

        let row = classify_row(
            &conn,
            &school_id,
            &raw_row(Some("123456789012"), "Mathematics", "88"),
        )
        .unwrap();
        assert_eq!(
            row.outcome,
            RowOutcome::AlreadyImported {
                learner_id: "l1".to_string()
            }
        );
    }

    #[test]
    fn commit_writes_only_ready_plans_and_reports_counts() {
        let (mut conn, school_id) = setup();
        let plans = vec![ScholasticCommitPlan {
            learner_id: "l1".to_string(),
            school_year: "2024-2025".to_string(),
            grade_level: "4".to_string(),
            subject_name: "Mathematics".to_string(),
            final_grade: 88,
            remarks: None,
            source_school_name: Some("Synthetic Prior School".to_string()),
        }];

        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('importer1', 'importer1', 'hash', 'Importer One')",
            [],
        )
        .unwrap();
        let summary =
            commit_scholastic_import(&mut conn, &school_id, &plans, Some("importer1")).unwrap();
        assert_eq!(summary.imported_count, 1);
        assert_eq!(summary.skipped_count, 0);

        let history = scholastic_history::list_for_learner(&conn, &school_id, "l1").unwrap();
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn commit_skips_a_forged_out_of_bounds_plan_without_writing_anything_in_the_batch() {
        let (mut conn, school_id) = setup();
        let plans = vec![
            ScholasticCommitPlan {
                learner_id: "l1".to_string(),
                school_year: "2024-2025".to_string(),
                grade_level: "4".to_string(),
                subject_name: "Mathematics".to_string(),
                final_grade: 30,
                remarks: None,
                source_school_name: None,
            },
            ScholasticCommitPlan {
                learner_id: "l1".to_string(),
                school_year: "2024-2025".to_string(),
                grade_level: "4".to_string(),
                subject_name: "Science".to_string(),
                final_grade: 90,
                remarks: None,
                source_school_name: None,
            },
        ];

        let summary = commit_scholastic_import(&mut conn, &school_id, &plans, None).unwrap();
        assert_eq!(summary.imported_count, 1);
        assert_eq!(summary.skipped_count, 1);
    }
}
