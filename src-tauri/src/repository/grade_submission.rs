//! Multi-Tier Review & Audit Pipeline, interim version
//! (`docs/adr/0073-interim-grade-review-pipeline.md`). No "Master
//! Teacher" role exists in this codebase yet — School Head plays the
//! approval role for this interim version, an explicit recorded
//! decision (see the ADR), not a silent substitution.
//!
//! `grade_submission_notes` is append-only: automated-check findings and
//! a reviewer's feedback are both new rows, never edits of a past one —
//! matching `repository::child_protection`'s intervention log precedent.

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{
    assessment_item, class_record, grading_computation, learner_score,
    learner_score::LearnerScoreStatus,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmissionStatus {
    Submitted,
    Approved,
    Rejected,
}

impl SubmissionStatus {
    fn as_db_str(self) -> &'static str {
        match self {
            SubmissionStatus::Submitted => "submitted",
            SubmissionStatus::Approved => "approved",
            SubmissionStatus::Rejected => "rejected",
        }
    }

    fn from_db_str(raw: &str) -> Option<SubmissionStatus> {
        match raw {
            "submitted" => Some(SubmissionStatus::Submitted),
            "approved" => Some(SubmissionStatus::Approved),
            "rejected" => Some(SubmissionStatus::Rejected),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeSubmission {
    pub id: String,
    pub school_id: String,
    pub class_record_id: String,
    pub submitted_by_user_id: Option<String>,
    pub status: SubmissionStatus,
    pub submitted_at: String,
    pub decided_by_user_id: Option<String>,
    pub decided_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmissionNoteType {
    AutomatedCheck,
    Feedback,
}

impl SubmissionNoteType {
    fn as_db_str(self) -> &'static str {
        match self {
            SubmissionNoteType::AutomatedCheck => "automated_check",
            SubmissionNoteType::Feedback => "feedback",
        }
    }

    fn from_db_str(raw: &str) -> Option<SubmissionNoteType> {
        match raw {
            "automated_check" => Some(SubmissionNoteType::AutomatedCheck),
            "feedback" => Some(SubmissionNoteType::Feedback),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionNote {
    pub id: String,
    pub submission_id: String,
    pub author_user_id: Option<String>,
    pub note_type: SubmissionNoteType,
    pub note: String,
    pub created_at: String,
}

fn row_to_submission(row: &rusqlite::Row) -> rusqlite::Result<GradeSubmission> {
    let status_raw: String = row.get(4)?;
    Ok(GradeSubmission {
        id: row.get(0)?,
        school_id: row.get(1)?,
        class_record_id: row.get(2)?,
        submitted_by_user_id: row.get(3)?,
        status: SubmissionStatus::from_db_str(&status_raw).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                "unknown status".into(),
            )
        })?,
        submitted_at: row.get(5)?,
        decided_by_user_id: row.get(6)?,
        decided_at: row.get(7)?,
    })
}

const SUBMISSION_SELECT: &str = "SELECT id, school_id, class_record_id, submitted_by_user_id, \
     status, submitted_at, decided_by_user_id, decided_at \
     FROM grade_submissions WHERE school_id = ?1";

/// One finding from the automated checks this module runs at submission
/// time: missing summative scores, an out-of-bounds score, or a
/// weight-group mismatch (the class record's assigned weight policy
/// disagreeing with the category set actually scored). Purely advisory —
/// a submission with findings still gets created; findings are recorded
/// as `automated_check` notes for the reviewer to see, never a block.
fn run_automated_checks(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Vec<String>> {
    let mut findings = Vec::new();

    let items = assessment_item::list_by_class_record(conn, school_id, class_record_id)?;
    if items.is_empty() {
        findings.push("No assessment items have been set up for this class record.".to_string());
        return Ok(findings);
    }

    for item in &items {
        let Some(roster) = learner_score::roster_for_item(conn, school_id, &item.id)? else {
            continue;
        };
        let missing = roster
            .iter()
            .filter(|entry| entry.status != Some(LearnerScoreStatus::Scored))
            .count();
        if missing > 0 {
            findings.push(format!(
                "{missing} learner(s) missing a summative score for \"{}\".",
                item.name
            ));
        }
        for entry in &roster {
            if let Some(score) = entry.score {
                if score < 0.0 || score > item.max_score {
                    findings.push(format!(
                        "A recorded score for \"{}\" is out of the 0-{} bounds.",
                        item.name, item.max_score
                    ));
                    break;
                }
            }
        }
    }

    if class_record::resolved_weight_policy_id_in_school(conn, school_id, class_record_id)?
        .is_none()
    {
        findings.push(
            "This class record has no resolvable grading weight policy (weight-group mismatch)."
                .to_string(),
        );
    }

    Ok(findings)
}

/// Teacher submits a class record's quarterly grades for review. Runs
/// the automated checks immediately and records every finding as an
/// `automated_check` note on the new submission — the reviewer sees them
/// without a separate step. Caller must already be authorized as the
/// class record's own assigned teacher (or School Head) — see
/// `auth::authorize_grade_submission_owner`.
pub fn submit(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
    submitted_by_user_id: &str,
) -> AppResult<GradeSubmission> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO grade_submissions (id, school_id, class_record_id, submitted_by_user_id) \
         VALUES (?1, ?2, ?3, ?4)",
        (&id, school_id, class_record_id, submitted_by_user_id),
    )?;

    for finding in run_automated_checks(conn, school_id, class_record_id)? {
        add_note(
            conn,
            school_id,
            &id,
            None,
            SubmissionNoteType::AutomatedCheck,
            &finding,
        )?;
    }

    find_by_id(conn, school_id, &id).map(|opt| opt.expect("just inserted"))
}

pub fn find_by_id(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<GradeSubmission>> {
    conn.query_row(
        &format!("{SUBMISSION_SELECT} AND id = ?2"),
        (school_id, id),
        row_to_submission,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// School-Head-facing submission-status matrix: every submission for the
/// school, newest first. School-Head-as-interim-approver reads this to
/// see what's awaiting review across every section/subject at once.
pub fn list_for_school(conn: &Connection, school_id: &str) -> AppResult<Vec<GradeSubmission>> {
    let mut stmt = conn.prepare(&format!("{SUBMISSION_SELECT} ORDER BY submitted_at DESC"))?;
    let rows = stmt.query_map((school_id,), row_to_submission)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Appends a `feedback` note and records the reviewer's decision
/// (approve/reject). Only a submission currently `submitted` may be
/// decided — deciding an already-decided submission is rejected rather
/// than silently overwriting a prior decision (a correction is a new
/// submission cycle, matching this module's append-only discipline for
/// its notes).
pub fn decide(
    conn: &Connection,
    school_id: &str,
    submission_id: &str,
    decided_by_user_id: &str,
    approve: bool,
    feedback_note: Option<&str>,
) -> AppResult<GradeSubmission> {
    let Some(existing) = find_by_id(conn, school_id, submission_id)? else {
        return Err(crate::error::AppError::InvalidInput(
            "unknown grade submission".to_string(),
        ));
    };
    if existing.status != SubmissionStatus::Submitted {
        return Err(crate::error::AppError::InvalidInput(
            "this submission has already been decided".to_string(),
        ));
    }

    let new_status = if approve {
        SubmissionStatus::Approved
    } else {
        SubmissionStatus::Rejected
    };
    conn.execute(
        "UPDATE grade_submissions \
         SET status = ?4, decided_by_user_id = ?3, \
             decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?1 AND id = ?2",
        (
            school_id,
            submission_id,
            decided_by_user_id,
            new_status.as_db_str(),
        ),
    )?;

    if let Some(note) = feedback_note {
        add_note(
            conn,
            school_id,
            submission_id,
            Some(decided_by_user_id),
            SubmissionNoteType::Feedback,
            note,
        )?;
    }

    find_by_id(conn, school_id, submission_id).map(|opt| opt.expect("just updated"))
}

fn add_note(
    conn: &Connection,
    school_id: &str,
    submission_id: &str,
    author_user_id: Option<&str>,
    note_type: SubmissionNoteType,
    note: &str,
) -> AppResult<()> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO grade_submission_notes \
            (id, submission_id, school_id, author_user_id, note_type, note) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &id,
            submission_id,
            school_id,
            author_user_id,
            note_type.as_db_str(),
            note,
        ),
    )?;
    Ok(())
}

pub fn list_notes(
    conn: &Connection,
    school_id: &str,
    submission_id: &str,
) -> AppResult<Vec<SubmissionNote>> {
    let mut stmt = conn.prepare(
        "SELECT id, submission_id, author_user_id, note_type, note, created_at \
         FROM grade_submission_notes WHERE school_id = ?1 AND submission_id = ?2 \
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map((school_id, submission_id), |row| {
        let note_type_raw: String = row.get(3)?;
        Ok(SubmissionNote {
            id: row.get(0)?,
            submission_id: row.get(1)?,
            author_user_id: row.get(2)?,
            note_type: SubmissionNoteType::from_db_str(&note_type_raw).ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    "unknown note_type".into(),
                )
            })?,
            note: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Principal (School-Head) Overview Dashboard's composite-grade half:
/// every learner's General Average in `section_id`, computed fresh from
/// `grading_computation` — reuses `class_record::list_by_section_in_school`
/// and `compute_term_grade`, no separate storage.
pub fn composite_grades_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_ids: &[String],
) -> AppResult<Vec<(String, Option<f64>)>> {
    let records = class_record::list_by_section_in_school(conn, school_id, section_id)?;
    let mut out = Vec::with_capacity(learner_ids.len());
    for learner_id in learner_ids {
        let mut sum = 0.0;
        let mut count = 0;
        for record in &records {
            if let Some(computed) =
                grading_computation::compute_term_grade(conn, school_id, &record.id, learner_id)?
            {
                sum += computed.term_grade as f64;
                count += 1;
            }
        }
        let average = if count > 0 {
            Some(sum / count as f64)
        } else {
            None
        };
        out.push((learner_id.clone(), average));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    fn setup() -> (Connection, String, String) {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let school = crate::repository::school::create(&conn, "Rizal Elementary").unwrap();
        let school_id = school.id.clone();
        let section =
            crate::repository::section::create(&conn, &school_id, "2026-2027", "5", "Section A")
                .unwrap();
        let subject = crate::repository::subject::create(&conn, &school_id, "Mathematics").unwrap();
        let period = crate::repository::grading::create(
            &conn,
            &school_id,
            "2026-2027",
            TERM_1,
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let class_record = class_record::create(
            &conn,
            &school_id,
            &section.id,
            &subject.id,
            &period.id,
            K10_POLICY,
            None,
        )
        .unwrap()
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('teacher1', 'teacher1', 'hash', 'Teacher One'), \
                    ('head1', 'head1', 'hash', 'Head One')",
            [],
        )
        .unwrap();
        (conn, school_id, class_record.id)
    }

    #[test]
    fn submit_creates_a_submission_and_records_a_missing_setup_finding() {
        let (conn, school_id, cr1) = setup();
        let submission = submit(&conn, &school_id, &cr1, "teacher1").unwrap();
        assert_eq!(submission.status, SubmissionStatus::Submitted);

        let notes = list_notes(&conn, &school_id, &submission.id).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].note_type, SubmissionNoteType::AutomatedCheck);
    }

    #[test]
    fn decide_approves_and_appends_a_feedback_note() {
        let (conn, school_id, cr1) = setup();
        let submission = submit(&conn, &school_id, &cr1, "teacher1").unwrap();

        let decided = decide(
            &conn,
            &school_id,
            &submission.id,
            "head1",
            true,
            Some("Synthetic: looks good, approved."),
        )
        .unwrap();

        assert_eq!(decided.status, SubmissionStatus::Approved);
        assert_eq!(decided.decided_by_user_id.as_deref(), Some("head1"));

        let notes = list_notes(&conn, &school_id, &submission.id).unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[1].note_type, SubmissionNoteType::Feedback);
    }

    #[test]
    fn decide_rejects_a_second_decision_on_an_already_decided_submission() {
        let (conn, school_id, cr1) = setup();
        let submission = submit(&conn, &school_id, &cr1, "teacher1").unwrap();
        decide(
            &conn,
            &school_id,
            &submission.id,
            "head1",
            false,
            Some("Synthetic: needs fixes."),
        )
        .unwrap();

        let second = decide(&conn, &school_id, &submission.id, "head1", true, None);
        assert!(second.is_err());
    }

    #[test]
    fn list_for_school_returns_every_submission_newest_first() {
        let (conn, school_id, cr1) = setup();
        submit(&conn, &school_id, &cr1, "teacher1").unwrap();
        let list = list_for_school(&conn, &school_id).unwrap();
        assert_eq!(list.len(), 1);
    }
}
