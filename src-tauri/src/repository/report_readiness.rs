//! Report-card preparation evidence and immutable drafts, never official issuance.
use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::export::{report_card, FieldDisclosure};
use crate::repository::{class_record, grading_computation, role, section_membership};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportReadinessLearner {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub lrn_missing: bool,
    pub grade: Option<grading_computation::ComputedTermGrade>,
    pub issue: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportCardReadiness {
    pub class_record_id: String,
    pub school_year: String,
    pub section_name: String,
    pub subject_name: String,
    pub grading_period_label: String,
    pub starts_on: String,
    pub ends_on: String,
    pub weight_policy_id: String,
    pub checked_at: String,
    pub learner_count: usize,
    pub missing_grade_count: usize,
    pub provisional_grade_count: usize,
    pub complete_grade_count: usize,
    pub missing_lrn_count: usize,
    pub official_fidelity: String,
    pub learners: Vec<ReportReadinessLearner>,
    pub disclosure: FieldDisclosure,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportCardDraft {
    pub id: String,
    pub class_record_id: String,
    pub stage: &'static str,
    pub snapshot: serde_json::Value,
    pub snapshot_sha256: String,
    pub created_by_user_id: String,
    pub created_at: String,
}

fn snapshot_sha256(content: &str) -> String {
    Sha256::digest(content.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Captures current native data, not a browser-supplied or already-reviewed payload.
pub fn capture_report_card_draft_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<ReportCardDraft>> {
    let Some(preview) =
        preview_report_card_authorized(conn, actor_user_id, school_id, class_record_id)?
    else {
        return Ok(None);
    };
    let snapshot_json = serde_json::to_string(&preview)
        .map_err(|_| AppError::Validation("Reporting draft could not be serialized".into()))?;
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO report_card_drafts \
         (id, school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            school_id,
            class_record_id,
            snapshot_json,
            snapshot_sha256(&snapshot_json),
            actor_user_id
        ],
    )?;
    let draft = conn.query_row(
        "SELECT id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id, created_at \
         FROM report_card_drafts WHERE id = ?1 AND school_id = ?2",
        params![id, school_id],
        stored_draft,
    )?;
    decode_draft(draft).map(Some)
}

type StoredDraft = (String, String, String, String, String, String);

fn stored_draft(row: &rusqlite::Row) -> rusqlite::Result<StoredDraft> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
    ))
}

fn decode_draft(stored: StoredDraft) -> AppResult<ReportCardDraft> {
    let (id, class_record_id, snapshot_json, hash, actor, created_at) = stored;
    if snapshot_sha256(&snapshot_json) != hash {
        return Err(AppError::Validation(
            "Stored reporting draft integrity check failed".into(),
        ));
    }
    let snapshot: serde_json::Value = serde_json::from_str(&snapshot_json)
        .map_err(|_| AppError::Validation("Stored reporting draft could not be read".into()))?;
    if snapshot["classRecordId"].as_str() != Some(class_record_id.as_str())
        || snapshot["officialFidelity"].as_str() != Some("not_verified")
    {
        return Err(AppError::Validation(
            "Stored reporting draft context is invalid".into(),
        ));
    }
    Ok(ReportCardDraft {
        id,
        class_record_id,
        stage: "draft",
        snapshot,
        snapshot_sha256: hash,
        created_by_user_id: actor,
        created_at,
    })
}

/// Latest 50 drafts for one authorized record. Snapshots never rederive current grades.
pub fn list_recent_report_card_drafts_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Vec<ReportCardDraft>> {
    if authorized_record(conn, actor_user_id, school_id, class_record_id)?.is_none() {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id, created_at \
         FROM report_card_drafts WHERE school_id = ?1 AND class_record_id = ?2 \
         ORDER BY created_at DESC, id DESC LIMIT 50",
    )?;
    let rows = stmt.query_map(params![school_id, class_record_id], stored_draft)?;
    rows.map(|row| decode_draft(row?)).collect()
}

fn grade_issue(grade: Option<grading_computation::ComputedTermGrade>) -> Option<String> {
    match grade {
        None => Some(
            "No computable grade; required weighted assessment evidence is unavailable.".into(),
        ),
        Some(grade) if !grade.complete => {
            Some("Provisional grade; some eligible assessment scores are not recorded.".into())
        }
        Some(_) => None,
    }
}

/// Shared read/capture authorization; never authorize from serialized draft claims.
fn authorized_record(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<class_record::ClassRecordDetail>> {
    let Some(detail) = class_record::find_detail_by_id_in_school(conn, school_id, class_record_id)?
    else {
        return Ok(None);
    };
    let assigned: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM teaching_assignments \
         WHERE school_id = ?1 AND teacher_user_id = ?2 AND section_id = ?3 AND subject_id = ?4)",
        params![
            school_id,
            actor_user_id,
            detail.section_id,
            detail.subject_id
        ],
        |row| row.get(0),
    )?;
    if !assigned && !role::has_any_role(conn, actor_user_id, school_id, &[role::SCHOOL_HEAD])? {
        return Err(AppError::Unauthorized);
    }
    Ok(Some(detail))
}

/// Full-period read-only preview; no file generation or issuance.
pub fn preview_report_card_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<ReportCardReadiness>> {
    let Some(detail) = authorized_record(conn, actor_user_id, school_id, class_record_id)? else {
        return Ok(None);
    };
    let Some((section_id, starts_on, ends_on)) =
        class_record::section_and_period_range_in_school(conn, school_id, class_record_id)?
    else {
        return Ok(None);
    };
    let roster = section_membership::roster_for_section_over_range(
        conn,
        school_id,
        &section_id,
        &starts_on,
        &ends_on,
    )?;
    let mut learners = Vec::with_capacity(roster.len());
    for member in roster {
        let grade = grading_computation::compute_term_grade(
            conn,
            school_id,
            class_record_id,
            &member.learner_id,
        )?;
        learners.push(ReportReadinessLearner {
            learner_id: member.learner_id,
            given_name: member.given_name,
            family_name: member.family_name,
            lrn_missing: member.lrn.as_ref().is_none_or(|lrn| lrn.trim().is_empty()),
            grade,
            issue: grade_issue(grade),
        });
    }
    Ok(Some(ReportCardReadiness {
        class_record_id: detail.id,
        school_year: detail.school_year,
        section_name: detail.section_name,
        subject_name: detail.subject_name,
        grading_period_label: detail.grading_period_label,
        starts_on,
        ends_on,
        weight_policy_id: detail.weight_policy_id,
        checked_at: conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?,
        learner_count: learners.len(),
        missing_grade_count: learners.iter().filter(|row| row.grade.is_none()).count(),
        provisional_grade_count: learners
            .iter()
            .filter(|row| row.grade.is_some_and(|grade| !grade.complete))
            .count(),
        complete_grade_count: learners
            .iter()
            .filter(|row| row.grade.is_some_and(|grade| grade.complete))
            .count(),
        missing_lrn_count: learners.iter().filter(|row| row.lrn_missing).count(),
        official_fidelity: "not_verified".into(),
        learners,
        disclosure: report_card::disclosure(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        grading, learner, school, section, subject, teaching_assignment, user,
    };
    use std::path::Path;

    #[test]
    fn draft_hash_and_context_checks_reject_corrupt_or_foreign_snapshots() {
        assert_eq!(
            snapshot_sha256("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let json = r#"{"classRecordId":"record","officialFidelity":"not_verified"}"#;
        let valid = (
            "draft".into(),
            "record".into(),
            json.into(),
            snapshot_sha256(json),
            "actor".into(),
            "native-time".into(),
        );
        assert_eq!(decode_draft(valid.clone()).unwrap().stage, "draft");
        let mut invalid_hash = valid.clone();
        invalid_hash.3 = "0".repeat(64);
        assert!(decode_draft(invalid_hash).is_err());
        let mut invalid_context = valid;
        invalid_context.1 = "foreign-record".into();
        assert!(decode_draft(invalid_context).is_err());
    }

    #[test]
    fn missing_provisional_and_complete_grades_have_distinct_evidence() {
        assert!(grade_issue(None).unwrap().contains("No computable"));
        let grade = grading_computation::ComputedTermGrade {
            initial_grade: 80.0,
            term_grade: 80,
            was_transmuted: false,
            was_floored: false,
            complete: false,
        };
        assert!(grade_issue(Some(grade)).unwrap().contains("Provisional"));
        assert_eq!(
            grade_issue(Some(grading_computation::ComputedTermGrade {
                complete: true,
                ..grade
            })),
            None
        );
    }

    #[test]
    fn preview_is_read_only_period_scoped_and_assignment_authorized() {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let sec =
            section::create(&conn, &school.id, "2026-2027", "7", "Synthetic Section").unwrap();
        let sub = subject::create(&conn, &school.id, "Synthetic Subject").unwrap();
        let teacher = user::create_user(&conn, "teacher", "password", "Synthetic Teacher").unwrap();
        user::add_school_membership(&conn, &teacher.id, &school.id).unwrap();
        teaching_assignment::create(&conn, &school.id, &teacher.id, &sec.id, &sub.id).unwrap();
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
        let record = class_record::create(
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
        let earlier = learner::create(&conn, &school.id, "Earlier", "Learner", None, None).unwrap();
        section_membership::enroll(&conn, &school.id, &sec.id, &earlier.id, "2026-06-08").unwrap();
        conn.execute(
            "UPDATE section_memberships SET ends_on = '2026-07-01' WHERE learner_id = ?1",
            params![earlier.id],
        )
        .unwrap();
        let later = learner::create(&conn, &school.id, "Later", "Learner", None, None).unwrap();
        section_membership::enroll(&conn, &school.id, &sec.id, &later.id, "2026-10-01").unwrap();
        let changes = conn.total_changes();
        let preview = preview_report_card_authorized(&conn, &teacher.id, &school.id, &record.id)
            .unwrap()
            .unwrap();
        assert_eq!(conn.total_changes(), changes);
        assert_eq!(preview.learner_count, 1);
        assert_eq!(preview.learners[0].learner_id, earlier.id);
        assert_eq!(preview.missing_grade_count, 1);
        assert_eq!(preview.provisional_grade_count, 0);
        assert_eq!(preview.complete_grade_count, 0);
        assert_eq!(preview.missing_lrn_count, 1);
        assert_eq!(preview.official_fidelity, "not_verified");
        assert!(!preview.disclosure.omitted_fields.is_empty());
        let other = user::create_user(&conn, "other", "password", "Other Teacher").unwrap();
        user::add_school_membership(&conn, &other.id, &school.id).unwrap();
        assert!(matches!(
            preview_report_card_authorized(&conn, &other.id, &school.id, &record.id),
            Err(AppError::Unauthorized)
        ));
        role::grant(&conn, &other.id, &school.id, role::SCHOOL_HEAD).unwrap();
        assert!(
            preview_report_card_authorized(&conn, &other.id, &school.id, &record.id)
                .unwrap()
                .is_some()
        );
        let foreign = school::create(&conn, "Other School").unwrap();
        assert!(
            preview_report_card_authorized(&conn, &teacher.id, &foreign.id, &record.id)
                .unwrap()
                .is_none()
        );
        assert!(
            preview_report_card_authorized(&conn, &teacher.id, &school.id, "missing")
                .unwrap()
                .is_none()
        );
        let draft =
            capture_report_card_draft_authorized(&conn, &teacher.id, &school.id, &record.id)
                .unwrap()
                .unwrap();
        assert_eq!(draft.stage, "draft");
        assert_eq!(draft.created_by_user_id, teacher.id);
        assert!(!draft.created_at.is_empty());
        assert_eq!(draft.snapshot["sectionName"], "Synthetic Section");
        conn.execute(
            "UPDATE sections SET name = 'Changed Section' WHERE id = ?1",
            params![sec.id],
        )
        .unwrap();
        let retained =
            list_recent_report_card_drafts_authorized(&conn, &teacher.id, &school.id, &record.id)
                .unwrap();
        assert_eq!(retained.len(), 1);
        assert_eq!(retained[0].snapshot, draft.snapshot);
        assert_eq!(retained[0].snapshot_sha256, draft.snapshot_sha256);
        assert!(conn
            .execute(
                "UPDATE report_card_drafts SET snapshot_json = '{}' WHERE id = ?1",
                params![draft.id],
            )
            .is_err());
        assert!(conn
            .execute(
                "DELETE FROM report_card_drafts WHERE id = ?1",
                params![draft.id],
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO report_card_drafts \
                 (id, school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id) \
                 VALUES ('foreign-draft', ?1, ?2, '{}', ?3, ?4)",
                params![foreign.id, record.id, "0".repeat(64), teacher.id],
            )
            .is_err());
        assert!(list_recent_report_card_drafts_authorized(
            &conn,
            &teacher.id,
            &foreign.id,
            &record.id,
        )
        .unwrap()
        .is_empty());
        let outsider = user::create_user(&conn, "outsider", "password", "Outsider").unwrap();
        user::add_school_membership(&conn, &outsider.id, &school.id).unwrap();
        assert!(matches!(
            capture_report_card_draft_authorized(&conn, &outsider.id, &school.id, &record.id),
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            list_recent_report_card_drafts_authorized(&conn, &outsider.id, &school.id, &record.id),
            Err(AppError::Unauthorized)
        ));
    }
}
