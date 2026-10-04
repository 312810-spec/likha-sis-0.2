//! Native preview and atomic score imports. IDs, never names, identify learners.
use crate::error::{AppError, AppResult};
use crate::repository::{
    assessment_item,
    learner_score::{self, LearnerScoreStatus},
};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreImportRow {
    pub learner_id: String,
    pub status: LearnerScoreStatus,
    pub score: Option<f64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreImportPreview {
    pub rows: Vec<ScoreImportRow>,
    pub issues: Vec<String>,
    pub content_hash: String,
    pub snapshot: String,
    pub already_imported: bool,
}

fn hash(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn invalid(message: &str) -> AppError {
    AppError::Import(message.into())
}

pub fn authorize(conn: &Connection, school: &str, actor: &str, item: &str) -> AppResult<()> {
    let owned:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM assessment_items ai JOIN class_records cr ON cr.id=ai.class_record_id JOIN teaching_assignments ta ON ta.school_id=cr.school_id AND ta.section_id=cr.section_id AND ta.subject_id=cr.subject_id WHERE ai.id=?1 AND ai.school_id=?2 AND ta.teacher_user_id=?3)",(item,school,actor),|r|r.get(0))?;
    if owned {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}

pub fn snapshot(conn: &Connection, school: &str, item: &str) -> AppResult<String> {
    let definition =
        assessment_item::find_by_id_in_school(conn, school, item)?.ok_or(AppError::Unauthorized)?;
    let lifecycle = assessment_item::lifecycle(conn, school, item)?;
    let roster = learner_score::roster_for_item(conn, school, item)?;
    let bytes = serde_json::to_vec(&(definition, lifecycle, roster))
        .map_err(|_| invalid("Could not prepare score preview."))?;
    Ok(hash(&bytes))
}

pub fn preview(
    conn: &Connection,
    school: &str,
    actor: &str,
    item: &str,
    csv: &str,
) -> AppResult<ScoreImportPreview> {
    authorize(conn, school, actor, item)?;
    if csv.len() > 1_000_000 {
        return Err(invalid("Score file is too large."));
    }
    let assessment =
        assessment_item::find_by_id_in_school(conn, school, item)?.ok_or(AppError::Unauthorized)?;
    let mut lines = csv.trim_start_matches('\u{feff}').lines();
    if lines.next().map(str::trim) != Some("learner_id,status,score") {
        return Err(invalid(
            "Use the headers learner_id,status,score. Prepare this item's template first.",
        ));
    }
    let mut rows = Vec::new();
    let mut issues = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (index, line) in lines.enumerate() {
        if index >= 2000 {
            return Err(invalid("A score file may contain at most 2,000 rows."));
        }
        if line.trim().is_empty() {
            continue;
        }
        let fields: Vec<_> = line.split(',').map(str::trim).collect();
        if fields.len() != 3 {
            issues.push(format!(
                "Row {}: use three columns; quoted cells are not supported by this template.",
                index + 2
            ));
            continue;
        }
        let id = fields[0];
        if !seen.insert(id.to_string()) {
            issues.push(format!("Row {}: learner is listed twice.", index + 2));
            continue;
        }
        let status = match fields[1] {
            "scored" => LearnerScoreStatus::Scored,
            "excused" => LearnerScoreStatus::Excused,
            "not_applicable" => LearnerScoreStatus::NotApplicable,
            _ => {
                issues.push(format!(
                    "Row {}: use scored, excused or not_applicable.",
                    index + 2
                ));
                continue;
            }
        };
        let score = if fields[2].is_empty() {
            None
        } else {
            match fields[2].parse::<f64>() {
                Ok(value) => Some(value),
                Err(_) => {
                    issues.push(format!("Row {}: score must be a number.", index + 2));
                    continue;
                }
            }
        };
        let pairing = match (status, score) {
            (LearnerScoreStatus::Scored, Some(value)) => {
                value.is_finite() && (0.0..=assessment.max_score).contains(&value)
            }
            (LearnerScoreStatus::Scored, None) => false,
            (_, None) => true,
            _ => false,
        };
        if !pairing || !assessment_item::eligible_for_item(conn, school, item, id)? {
            issues.push(format!(
                "Row {}: check learner eligibility, status and score range.",
                index + 2
            ));
            continue;
        }
        rows.push(ScoreImportRow {
            learner_id: id.into(),
            status,
            score,
        });
    }
    if rows.is_empty() {
        issues.push("No valid score rows were found.".into());
    }
    let content_hash = hash(csv.as_bytes());
    let already_imported:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM score_import_batches WHERE school_id=?1 AND assessment_item_id=?2 AND content_hash=?3)",(school,item,&content_hash),|r|r.get(0))?;
    Ok(ScoreImportPreview {
        rows,
        issues,
        content_hash,
        snapshot: snapshot(conn, school, item)?,
        already_imported,
    })
}

pub fn previous(
    conn: &Connection,
    school: &str,
    item: &str,
    learner: &str,
) -> AppResult<Option<String>> {
    conn.query_row("SELECT json_object('status',status,'score',score,'updatedAt',updated_at) FROM learner_scores WHERE school_id=?1 AND assessment_item_id=?2 AND learner_id=?3",(school,item,learner),|r|r.get(0)).optional().map_err(Into::into)
}

#[allow(clippy::too_many_arguments)]
pub fn append_history(
    conn: &Connection,
    school: &str,
    actor: &str,
    item: &str,
    learner: &str,
    previous: Option<&str>,
    next: &learner_score::LearnerScore,
    reason: &str,
) -> AppResult<()> {
    let next = serde_json::to_string(next).map_err(|_| invalid("Could not save score history."))?;
    conn.execute("INSERT INTO score_change_history(id,school_id,assessment_item_id,learner_id,actor_user_id,previous_json,next_json,reason) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",(Uuid::now_v7().to_string(),school,item,learner,actor,previous,next,reason))?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn commit<F>(
    conn: &Connection,
    school: &str,
    actor: &str,
    item: &str,
    csv: &str,
    expected_snapshot: &str,
    reason: &str,
    mut save: F,
) -> AppResult<usize>
where
    F: FnMut(&ScoreImportRow) -> AppResult<learner_score::LearnerScore>,
{
    if reason.trim().is_empty() || reason.len() > 1000 {
        return Err(invalid("Give a short reason for importing these scores."));
    }
    conn.execute_batch("SAVEPOINT commit_score_import")?;
    let result = (|| {
        let draft = preview(conn, school, actor, item, csv)?;
        if draft.already_imported {
            return Err(invalid("These exact scores have already been imported."));
        }
        if !draft.issues.is_empty() {
            return Err(invalid("Correct all preview issues before importing."));
        }
        if draft.snapshot != expected_snapshot {
            return Err(invalid(
                "The class record changed. Preview this file again before importing.",
            ));
        }
        for row in &draft.rows {
            let before = previous(conn, school, item, &row.learner_id)?;
            let next = save(row)?;
            append_history(
                conn,
                school,
                actor,
                item,
                &row.learner_id,
                before.as_deref(),
                &next,
                reason.trim(),
            )?;
        }
        conn.execute("INSERT INTO score_import_batches(id,school_id,assessment_item_id,content_hash,imported_by) VALUES(?1,?2,?3,?4,?5)",(Uuid::now_v7().to_string(),school,item,&draft.content_hash,actor))?;
        Ok(draft.rows.len())
    })();
    match result {
        Ok(count) => {
            conn.execute_batch("RELEASE commit_score_import")?;
            Ok(count)
        }
        Err(error) => {
            let _ =
                conn.execute_batch("ROLLBACK TO commit_score_import; RELEASE commit_score_import");
            Err(error)
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreHistoryEntry {
    pub id: String,
    pub learner_id: String,
    pub actor_user_id: String,
    pub previous_json: Option<String>,
    pub next_json: String,
    pub reason: String,
    pub changed_at: String,
}
pub fn history(
    conn: &Connection,
    school: &str,
    actor: &str,
    item: &str,
) -> AppResult<Vec<ScoreHistoryEntry>> {
    authorize(conn, school, actor, item)?;
    let mut query=conn.prepare("SELECT id,learner_id,actor_user_id,previous_json,next_json,reason,changed_at FROM score_change_history WHERE school_id=?1 AND assessment_item_id=?2 ORDER BY changed_at DESC,id DESC LIMIT 500")?;
    let rows = query.query_map((school, item), |r| {
        Ok(ScoreHistoryEntry {
            id: r.get(0)?,
            learner_id: r.get(1)?,
            actor_user_id: r.get(2)?,
            previous_json: r.get(3)?,
            next_json: r.get(4)?,
            reason: r.get(5)?,
            changed_at: r.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        class_record, grading, learner, school, section, section_membership, subject,
        teaching_assignment, user,
    };
    fn fixture() -> (Connection, String, String, String, String, String) {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        let school = school::create(&conn, "Test School").unwrap();
        let sec = section::create(&conn, &school.id, "2026-2027", "7", "A").unwrap();
        let sub = subject::create(&conn, &school.id, "Math").unwrap();
        let period = grading::create(
            &conn,
            &school.id,
            "2026-2027",
            "00000000-0000-7000-8000-000000000011",
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let cr = class_record::create(
            &conn,
            &school.id,
            &sec.id,
            &sub.id,
            &period.id,
            "00000000-0000-7000-8000-000000000041",
            None,
        )
        .unwrap()
        .unwrap();
        let item = assessment_item::create(
            &conn,
            &school.id,
            &cr.id,
            "00000000-0000-7000-8000-000000000311",
            "Quiz",
            20.0,
        )
        .unwrap()
        .unwrap();
        let teacher = user::create_user(&conn, "teacher.import", "password", "Teacher").unwrap();
        user::add_school_membership(&conn, &teacher.id, &school.id).unwrap();
        teaching_assignment::create(&conn, &school.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        let a = learner::create(&conn, &school.id, "A", "Learner", None, None).unwrap();
        let b = learner::create(&conn, &school.id, "B", "Learner", None, None).unwrap();
        for id in [&a.id, &b.id] {
            section_membership::enroll(&conn, &school.id, &sec.id, id, "2026-06-08").unwrap();
        }
        (conn, school.id, teacher.id, item.id, a.id, b.id)
    }
    #[test]
    fn preview_detects_duplicate_ids_out_of_range_and_foreign_actors() {
        let (conn, school, actor, item, a, _) = fixture();
        let csv = format!("learner_id,status,score\n{a},scored,30\n{a},scored,10");
        let result = preview(&conn, &school, &actor, &item, &csv).unwrap();
        assert_eq!(result.issues.len(), 3);
        assert!(preview(&conn, &school, "someone-else", &item, &csv).is_err());
    }
    #[test]
    fn commit_rejects_stale_preview_and_rolls_back_all_rows_and_history() {
        let (conn, school, actor, item, a, b) = fixture();
        let csv = format!("learner_id,status,score\n{a},scored,10\n{b},scored,12");
        let draft = preview(&conn, &school, &actor, &item, &csv).unwrap();
        let mut count = 0;
        let result = commit(
            &conn,
            &school,
            &actor,
            &item,
            &csv,
            &draft.snapshot,
            "Imported workbook",
            |row| {
                count += 1;
                if count == 2 {
                    return Err(invalid("Simulated enqueue failure"));
                }
                learner_score::record(
                    &conn,
                    &school,
                    &item,
                    &row.learner_id,
                    row.status,
                    row.score,
                    &actor,
                )?
                .ok_or(invalid("Rejected"))
            },
        );
        assert!(result.is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM learner_scores", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(history(&conn, &school, &actor, &item).unwrap().is_empty());
        learner_score::record(
            &conn,
            &school,
            &item,
            &a,
            LearnerScoreStatus::Scored,
            Some(9.0),
            &actor,
        )
        .unwrap();
        assert!(commit(
            &conn,
            &school,
            &actor,
            &item,
            &csv,
            &draft.snapshot,
            "Import",
            |_| panic!("stale preview must not write")
        )
        .is_err());
    }
    #[test]
    fn exact_file_cannot_be_imported_twice_and_every_saved_row_has_history() {
        let (conn, school, actor, item, a, _) = fixture();
        let csv = format!("learner_id,status,score\n{a},scored,0");
        let draft = preview(&conn, &school, &actor, &item, &csv).unwrap();
        let count = commit(
            &conn,
            &school,
            &actor,
            &item,
            &csv,
            &draft.snapshot,
            "Recorded zero",
            |row| {
                learner_score::record(
                    &conn,
                    &school,
                    &item,
                    &row.learner_id,
                    row.status,
                    row.score,
                    &actor,
                )?
                .ok_or(invalid("Rejected"))
            },
        )
        .unwrap();
        assert_eq!(count, 1);
        assert_eq!(history(&conn, &school, &actor, &item).unwrap().len(), 1);
        let next = preview(&conn, &school, &actor, &item, &csv).unwrap();
        assert!(next.already_imported);
        assert!(commit(
            &conn,
            &school,
            &actor,
            &item,
            &csv,
            &next.snapshot,
            "Again",
            |_| panic!("duplicate must not write")
        )
        .is_err());
    }
}
