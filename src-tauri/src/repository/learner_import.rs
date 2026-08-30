use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;
use crate::import::learner::{parse_rows, ParsedImportRow};
use crate::repository::learner::{self, Learner};

/// A parsed row plus, when the row itself is valid, the single
/// strongest-signal potential duplicate already in this school (if any)
/// — never more than one, and never a silent merge: this is purely
/// informational for the authorized user reviewing the batch to decide
/// against, per the conservative reconciliation contract in
/// `docs/adr/0046-learner-core-bulk-import.md`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRow {
    pub row_number: usize,
    pub given_name: String,
    pub family_name: String,
    pub lrn: Option<String>,
    pub sex: Option<String>,
    pub error: Option<String>,
    pub potential_duplicate: Option<Learner>,
}

/// Finds the single strongest-signal potential duplicate for
/// `(given_name, family_name, lrn)` within `school_id`. An exact LRN
/// match is checked first — DepEd's LRN is a unique national identifier,
/// so a match is a near-certain signal — falling back to an exact,
/// case-insensitive full-name match only when no LRN was given or none
/// matched. Deliberately no fuzzy/typo-tolerant name matching: exact
/// matching is the conservative, predictable behavior this milestone
/// commits to (see the ADR) — a near-miss (a typo, a nickname) is simply
/// not flagged, which is a safe default (it just means one fewer
/// reconciliation prompt), never an unsafe one (silently merging two
/// different people).
pub fn find_potential_duplicate(
    conn: &Connection,
    school_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
) -> AppResult<Option<Learner>> {
    if let Some(lrn) = lrn {
        let by_lrn = conn
            .query_row(
                "SELECT id, school_id, given_name, family_name, lrn, sex, created_at \
                 FROM learners WHERE school_id = ?1 AND lrn = ?2",
                (school_id, lrn),
                learner::row_to_learner,
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                e => Err(e),
            })?;
        if by_lrn.is_some() {
            return Ok(by_lrn);
        }
    }

    conn.query_row(
        "SELECT id, school_id, given_name, family_name, lrn, sex, created_at \
         FROM learners \
         WHERE school_id = ?1 AND given_name = ?2 COLLATE NOCASE \
           AND family_name = ?3 COLLATE NOCASE \
         LIMIT 1",
        (school_id, given_name, family_name),
        learner::row_to_learner,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Parses `csv_text` and annotates every structurally valid row with any
/// potential duplicate found — a pure read, no database write. A row
/// with its own parse error is returned with `potential_duplicate: None`
/// (there is nothing sensible to duplicate-check against malformed data)
/// rather than being dropped, so the caller can show every row's status
/// in one pass.
pub fn preview(conn: &Connection, school_id: &str, csv_text: &str) -> AppResult<Vec<PreviewRow>> {
    let rows: Vec<ParsedImportRow> =
        parse_rows(csv_text).map_err(|_msg| crate::error::AppError::InvalidImport)?;

    rows.into_iter()
        .map(|row| {
            let potential_duplicate = if row.error.is_none() {
                find_potential_duplicate(
                    conn,
                    school_id,
                    &row.given_name,
                    &row.family_name,
                    row.lrn.as_deref(),
                )?
            } else {
                None
            };
            Ok(PreviewRow {
                row_number: row.row_number,
                given_name: row.given_name,
                family_name: row.family_name,
                lrn: row.lrn,
                sex: row.sex,
                error: row.error,
                potential_duplicate,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportAction {
    /// No matching learner, or a flagged potential duplicate was
    /// confirmed to be a different person — creates a new learner.
    Create,
    /// A flagged potential duplicate is the same learner — applies the
    /// caller-resolved field values (which may be a wholesale "use the
    /// imported row" or a per-field mix — that distinction is a frontend
    /// UX concern only; this repository layer just applies whatever
    /// final values it's given) to the existing learner.
    Update,
    /// A flagged potential duplicate is the same learner and the
    /// existing record should be left exactly as-is — no write happens,
    /// but the decision is still logged for provenance.
    Skip,
}

/// One authorized user's resolved decision for one previewed row. The
/// final `given_name`/`family_name`/`lrn`/`sex` values are always
/// caller-supplied (never re-derived from the original CSV row here) —
/// for `Update`, this is how a "field-by-field" reconciliation and a
/// wholesale "use the imported row" both get applied through the exact
/// same code path: the frontend computes the final values either way,
/// this layer just writes them.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDecision {
    pub row_number: usize,
    pub action: ImportAction,
    /// Required for `Update`/`Skip` (identifies which existing learner);
    /// ignored for `Create`.
    pub existing_learner_id: Option<String>,
    /// The as-imported values, always recorded for provenance regardless
    /// of `action` — see `learner_import_log`.
    pub imported_given_name: String,
    pub imported_family_name: String,
    pub imported_lrn: Option<String>,
    pub imported_sex: Option<String>,
    /// The final values to write for `Create`/`Update` — ignored for
    /// `Skip`.
    pub final_given_name: String,
    pub final_family_name: String,
    pub final_lrn: Option<String>,
    pub final_sex: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchResult {
    pub batch_id: String,
    pub created_count: usize,
    pub updated_count: usize,
    pub skipped_count: usize,
}

/// Commits a whole reviewed batch atomically (one SQLite transaction —
/// either every row's decision is applied and logged, or none are, never
/// a partially-applied import). Never called with unresolved rows: the
/// caller (the Tauri command) is expected to have shown every row's
/// preview and collected an explicit decision for each — this function
/// trusts the decisions it's given and does not re-run duplicate
/// detection, so a decision made against a preview that's since gone
/// stale (a concurrent write) is still applied as given; see the ADR for
/// why this is an accepted, disclosed limitation rather than a
/// re-validation pass.
pub fn commit_batch(
    conn: &mut Connection,
    school_id: &str,
    imported_by_user_id: &str,
    decisions: &[ImportDecision],
) -> AppResult<ImportBatchResult> {
    let tx = conn.transaction()?;

    let batch_id = Uuid::now_v7().to_string();
    tx.execute(
        "INSERT INTO learner_import_batches (id, school_id, imported_by_user_id, row_count) \
         VALUES (?1, ?2, ?3, ?4)",
        (
            &batch_id,
            school_id,
            imported_by_user_id,
            decisions.len() as i64,
        ),
    )?;

    let mut created_count = 0usize;
    let mut updated_count = 0usize;
    let mut skipped_count = 0usize;

    for decision in decisions {
        let potential_duplicate_learner_id = decision.existing_learner_id.as_deref();

        let (decision_label, resulting_learner_id): (&str, Option<String>) = match decision.action {
            ImportAction::Create => {
                let created = learner::create(
                    &tx,
                    school_id,
                    &decision.final_given_name,
                    &decision.final_family_name,
                    decision.final_lrn.as_deref(),
                    decision.final_sex.as_deref(),
                )?;
                created_count += 1;
                ("created", Some(created.id))
            }
            ImportAction::Update => {
                let existing_id = decision
                    .existing_learner_id
                    .as_deref()
                    .ok_or(crate::error::AppError::InvalidImport)?;
                let updated = learner::update(
                    &tx,
                    school_id,
                    existing_id,
                    &decision.final_given_name,
                    &decision.final_family_name,
                    decision.final_lrn.as_deref(),
                    decision.final_sex.as_deref(),
                )?
                .ok_or(crate::error::AppError::InvalidImport)?;
                updated_count += 1;
                ("updated", Some(updated.id))
            }
            ImportAction::Skip => {
                // `Skip` writes no learner row, but still must not let a
                // caller log a provenance entry pointing at another
                // school's learner id -- `Update`'s own school-scoped
                // `WHERE` clause already protects that action; `Skip` has
                // no such write to piggyback on, so it needs this
                // explicit check of its own. Under the normal UI flow
                // `existing_learner_id` always comes from this school's
                // own `find_potential_duplicate`, so this only ever
                // fires for a malformed/malicious direct IPC call -- but
                // school isolation must hold at this trusted boundary
                // regardless of what the frontend is expected to send.
                let existing_id = decision
                    .existing_learner_id
                    .as_deref()
                    .ok_or(crate::error::AppError::InvalidImport)?;
                learner::find_by_id_in_school(&tx, school_id, existing_id)?
                    .ok_or(crate::error::AppError::InvalidImport)?;
                skipped_count += 1;
                ("skipped", decision.existing_learner_id.clone())
            }
        };

        tx.execute(
            "INSERT INTO learner_import_log (
                id, batch_id, school_id, row_number, decision,
                resulting_learner_id, potential_duplicate_learner_id,
                imported_given_name, imported_family_name, imported_lrn, imported_sex
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                Uuid::now_v7().to_string(),
                batch_id,
                school_id,
                decision.row_number as i64,
                decision_label,
                resulting_learner_id,
                potential_duplicate_learner_id,
                decision.imported_given_name,
                decision.imported_family_name,
                decision.imported_lrn,
                decision.imported_sex,
            ],
        )?;
    }

    tx.commit()?;

    Ok(ImportBatchResult {
        batch_id,
        created_count,
        updated_count,
        skipped_count,
    })
}

/// One historical row from `learner_import_log`, joined with enough
/// context to render in an audit view — see
/// `docs/adr/0046-learner-core-bulk-import.md`'s provenance requirement.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLogEntry {
    pub id: String,
    pub batch_id: String,
    pub row_number: i64,
    pub decision: String,
    pub resulting_learner_id: Option<String>,
    pub potential_duplicate_learner_id: Option<String>,
    pub imported_given_name: String,
    pub imported_family_name: String,
    pub imported_lrn: Option<String>,
    pub imported_sex: Option<String>,
    pub created_at: String,
}

/// The full provenance trail for one batch, in row order — proves what
/// every row's decision was, not just the summary counts.
pub fn log_for_batch(
    conn: &Connection,
    school_id: &str,
    batch_id: &str,
) -> AppResult<Vec<ImportLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, batch_id, row_number, decision, resulting_learner_id, \
                potential_duplicate_learner_id, imported_given_name, \
                imported_family_name, imported_lrn, imported_sex, created_at \
         FROM learner_import_log WHERE batch_id = ?1 AND school_id = ?2 \
         ORDER BY row_number",
    )?;
    let rows = stmt.query_map((batch_id, school_id), |row| {
        Ok(ImportLogEntry {
            id: row.get(0)?,
            batch_id: row.get(1)?,
            row_number: row.get(2)?,
            decision: row.get(3)?,
            resulting_learner_id: row.get(4)?,
            potential_duplicate_learner_id: row.get(5)?,
            imported_given_name: row.get(6)?,
            imported_family_name: row.get(7)?,
            imported_lrn: row.get(8)?,
            imported_sex: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{school, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn seed_school_and_user(conn: &Connection) -> (String, String) {
        let s = school::create(conn, "Mabini Elementary").unwrap();
        let u = user::create_user(
            conn,
            "registrar",
            "correct horse battery staple",
            "Registrar",
        )
        .unwrap();
        (s.id, u.id)
    }

    #[test]
    fn find_potential_duplicate_matches_on_exact_lrn_first() {
        let conn = open_test_db();
        let (school_id, _) = seed_school_and_user(&conn);
        let existing =
            learner::create(&conn, &school_id, "Ana", "Cruz", Some("123456789012"), None).unwrap();

        let found = find_potential_duplicate(
            &conn,
            &school_id,
            "Different Name Entirely",
            "Also Different",
            Some("123456789012"),
        )
        .unwrap();

        assert_eq!(found.map(|l| l.id), Some(existing.id));
    }

    #[test]
    fn find_potential_duplicate_falls_back_to_exact_name_match() {
        let conn = open_test_db();
        let (school_id, _) = seed_school_and_user(&conn);
        let existing = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        let found = find_potential_duplicate(&conn, &school_id, "ana", "CRUZ", None).unwrap();

        assert_eq!(found.map(|l| l.id), Some(existing.id));
    }

    #[test]
    fn find_potential_duplicate_returns_none_when_nothing_matches() {
        let conn = open_test_db();
        let (school_id, _) = seed_school_and_user(&conn);
        learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        let found = find_potential_duplicate(&conn, &school_id, "Jose", "Rizal", None).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn find_potential_duplicate_never_crosses_schools() {
        let conn = open_test_db();
        let (school_id, _) = seed_school_and_user(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();

        let found = find_potential_duplicate(&conn, &school_id, "Ana", "Cruz", None).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn preview_flags_a_potential_duplicate_and_leaves_a_clean_row_unflagged() {
        let conn = open_test_db();
        let (school_id, _) = seed_school_and_user(&conn);
        learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,,\nJose,Rizal,,";

        let rows = preview(&conn, &school_id, csv).unwrap();

        assert!(rows[0].potential_duplicate.is_some());
        assert!(rows[1].potential_duplicate.is_none());
    }

    #[test]
    fn preview_does_not_duplicate_check_a_row_with_its_own_parse_error() {
        let conn = open_test_db();
        let (school_id, _) = seed_school_and_user(&conn);
        learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let csv = "given_name,family_name,lrn,sex\n,Cruz,,";

        let rows = preview(&conn, &school_id, csv).unwrap();

        assert!(rows[0].error.is_some());
        assert!(rows[0].potential_duplicate.is_none());
    }

    fn base_decision(row_number: usize) -> ImportDecision {
        ImportDecision {
            row_number,
            action: ImportAction::Create,
            existing_learner_id: None,
            imported_given_name: "Ana".to_string(),
            imported_family_name: "Cruz".to_string(),
            imported_lrn: None,
            imported_sex: None,
            final_given_name: "Ana".to_string(),
            final_family_name: "Cruz".to_string(),
            final_lrn: None,
            final_sex: None,
        }
    }

    #[test]
    fn commit_batch_creates_a_new_learner_for_a_create_decision() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let decision = base_decision(1);

        let result = commit_batch(&mut conn, &school_id, &user_id, &[decision]).unwrap();

        assert_eq!(result.created_count, 1);
        assert_eq!(learner::list_by_school(&conn, &school_id).unwrap().len(), 1);
    }

    #[test]
    fn commit_batch_updates_an_existing_learner_for_an_update_decision() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let existing = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let mut decision = base_decision(1);
        decision.action = ImportAction::Update;
        decision.existing_learner_id = Some(existing.id.clone());
        decision.final_lrn = Some("123456789012".to_string());

        let result = commit_batch(&mut conn, &school_id, &user_id, &[decision]).unwrap();

        assert_eq!(result.updated_count, 1);
        let updated = learner::find_by_id_in_school(&conn, &school_id, &existing.id)
            .unwrap()
            .unwrap();
        assert_eq!(updated.lrn, Some("123456789012".to_string()));
    }

    #[test]
    fn commit_batch_leaves_the_existing_learner_untouched_for_a_skip_decision() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let existing = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let mut decision = base_decision(1);
        decision.action = ImportAction::Skip;
        decision.existing_learner_id = Some(existing.id.clone());

        let result = commit_batch(&mut conn, &school_id, &user_id, &[decision]).unwrap();

        assert_eq!(result.skipped_count, 1);
        let unchanged = learner::find_by_id_in_school(&conn, &school_id, &existing.id)
            .unwrap()
            .unwrap();
        assert_eq!(
            unchanged, existing,
            "skip must not modify the existing record at all"
        );
    }

    #[test]
    fn commit_batch_logs_every_row_with_full_provenance() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let decision = base_decision(1);

        let result = commit_batch(&mut conn, &school_id, &user_id, &[decision]).unwrap();
        let log = log_for_batch(&conn, &school_id, &result.batch_id).unwrap();

        assert_eq!(log.len(), 1);
        assert_eq!(log[0].decision, "created");
        assert_eq!(log[0].imported_given_name, "Ana");
        assert!(log[0].resulting_learner_id.is_some());
    }

    #[test]
    fn commit_batch_is_all_or_nothing_on_a_bad_update_reference() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let good = base_decision(1);
        let mut bad = base_decision(2);
        bad.action = ImportAction::Update;
        bad.existing_learner_id = Some("does-not-exist".to_string());

        let result = commit_batch(&mut conn, &school_id, &user_id, &[good, bad]);

        assert!(result.is_err());
        assert_eq!(
            learner::list_by_school(&conn, &school_id).unwrap().len(),
            0,
            "the first row's create must roll back when a later row in the same batch fails"
        );
    }

    #[test]
    fn commit_batch_never_lets_one_school_touch_another_schools_learner() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_learner =
            learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        let mut decision = base_decision(1);
        decision.action = ImportAction::Update;
        decision.existing_learner_id = Some(other_learner.id);

        let result = commit_batch(&mut conn, &school_id, &user_id, &[decision]);

        assert!(
            result.is_err(),
            "updating a different school's learner id must fail, not succeed silently"
        );
    }

    #[test]
    fn commit_batch_never_lets_one_school_log_a_skip_against_another_schools_learner() {
        let mut conn = open_test_db();
        let (school_id, user_id) = seed_school_and_user(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_learner =
            learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        let mut decision = base_decision(1);
        decision.action = ImportAction::Skip;
        decision.existing_learner_id = Some(other_learner.id);

        let result = commit_batch(&mut conn, &school_id, &user_id, &[decision]);

        assert!(
            result.is_err(),
            "skipping with a different school's learner id must fail, not log it silently"
        );
        let log_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM learner_import_log", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(
            log_count, 0,
            "the rejected decision must not have left a provenance row behind"
        );
    }
}
