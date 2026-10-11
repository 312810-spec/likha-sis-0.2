use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use crate::error::{AppError, AppResult};
use crate::repository::class_occurrence::{self, OccurrenceStatus};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomDraftFields {
    pub actual_starts_at: String,
    pub actual_ends_at: String,
    pub actual_room: String,
    pub learning_target: String,
    pub quick_evidence: String,
    pub notes: String,
    pub finish_summary: String,
    pub cancel_reason: String,
    pub pending_reason: String,
    pub marking_membership_id: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomDraft { pub fields: ClassroomDraftFields, pub saved_at: String }

pub fn load(conn: &Connection, owner: &str, school: &str, assignment: &str, date: &str, revision: i64) -> AppResult<Option<ClassroomDraft>> {
    let row: Option<(String, String)> = conn.query_row(
        "SELECT fields_json, saved_at FROM classroom_drafts WHERE owner_user_id = ?1 AND school_id = ?2 AND teaching_assignment_id = ?3 AND occurrence_date = ?4 AND occurrence_revision = ?5",
        params![owner, school, assignment, date, revision], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    row.map(|(json, saved_at)| {
        let fields = serde_json::from_str(&json).map_err(|_| AppError::Validation("Saved draft could not be read; discard or retry without changing the class record".into()))?;
        Ok(ClassroomDraft { fields, saved_at })
    }).transpose()
}
#[allow(clippy::too_many_arguments)]
pub fn save(conn: &Connection, owner: &str, school: &str, assignment: &str, date: &str, revision: i64, fields: &ClassroomDraftFields) -> AppResult<ClassroomDraft> {
    let occurrence = class_occurrence::find_for_assignment_on_date(conn, school, assignment, date)?.ok_or_else(|| AppError::Validation("Start the class before saving a classroom draft".into()))?;
    if occurrence.revision != revision || matches!(occurrence.status, OccurrenceStatus::Delivered | OccurrenceStatus::Cancelled) {
        return Err(AppError::Validation("Class changed or finished; review the saved draft before correcting it".into()));
    }
    let json = serde_json::to_string(fields).map_err(|_| AppError::Validation("Draft could not be saved".into()))?;
    if json.len() > 131_072 { return Err(AppError::Validation("Draft is too large to save".into())); }
    conn.execute("INSERT INTO classroom_drafts(owner_user_id, school_id, teaching_assignment_id, occurrence_date, occurrence_revision, fields_json) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(owner_user_id,school_id,teaching_assignment_id,occurrence_date,occurrence_revision) DO UPDATE SET fields_json = excluded.fields_json, saved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", params![owner, school, assignment, date, revision, json])?;
    load(conn, owner, school, assignment, date, revision)?.ok_or_else(|| AppError::Validation("Draft save was not confirmed".into()))
}
pub fn remove(conn: &Connection, owner: &str, school: &str, assignment: &str, date: &str, revision: i64) -> AppResult<()> {
    conn.execute("DELETE FROM classroom_drafts WHERE owner_user_id = ?1 AND school_id = ?2 AND teaching_assignment_id = ?3 AND occurrence_date = ?4 AND occurrence_revision = ?5", params![owner, school, assignment, date, revision])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::{school, user, section, subject, teaching_assignment}};
    use std::path::Path;

    fn fields() -> ClassroomDraftFields {
        ClassroomDraftFields {
            actual_starts_at: String::new(), actual_ends_at: String::new(), actual_room: String::new(),
            learning_target: "Teacher draft target".into(), quick_evidence: "Unreviewed evidence".into(),
            notes: "Private note".into(), finish_summary: String::new(), cancel_reason: String::new(),
            pending_reason: String::new(), marking_membership_id: None,
        }
    }
    #[test]
    fn drafts_are_private_scoped_work_not_occurrence_writes() {
        let conn = db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Synthetic school").unwrap();
        let teacher = user::create_user(&conn, "draft.teacher", "password", "Teacher").unwrap();
        let other = user::create_user(&conn, "draft.other", "password", "Other").unwrap();
        user::add_school_membership(&conn, &teacher.id, &school.id).unwrap();
        let section = section::create(&conn, &school.id, "2026-2027", "10", "Synthetic").unwrap();
        let subject = subject::create(&conn, &school.id, "Mathematics").unwrap();
        let assignment = teaching_assignment::create(&conn, &school.id, &teacher.id, &section.id, &subject.id).unwrap().unwrap();
        class_occurrence::start(&conn, &school.id, &assignment.id, "2026-10-11", &teacher.id).unwrap();
        let saved = save(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0, &fields()).unwrap();
        assert_eq!(saved.fields, fields());
        assert!(!saved.saved_at.is_empty());
        assert!(load(&conn, &other.id, &school.id, &assignment.id, "2026-10-11", 0).unwrap().is_none());
        assert!(load(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-12", 0).unwrap().is_none());
        assert!(load(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 1).unwrap().is_none());
        let occurrence = class_occurrence::find_for_assignment_on_date(&conn, &school.id, &assignment.id, "2026-10-11").unwrap().unwrap();
        assert_ne!(occurrence.notes, "Private note");
        remove(&conn, &other.id, &school.id, &assignment.id, "2026-10-11", 0).unwrap();
        assert!(load(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0).unwrap().is_some());
        class_occurrence::cancel(&conn, &school.id, &assignment.id, "2026-10-11", "Teacher decision", &teacher.id).unwrap();
        assert!(save(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0, &fields()).is_err());
        class_occurrence::reopen(&conn, &school.id, &assignment.id, "2026-10-11").unwrap();
        assert!(save(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0, &fields()).is_err());
        // An old draft remains recoverable for review, never automatically applied.
        assert!(load(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0).unwrap().is_some());
        remove(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0).unwrap();
        assert!(load(&conn, &teacher.id, &school.id, &assignment.id, "2026-10-11", 0).unwrap().is_none());
    }
}
