//! Report-card preparation evidence and immutable drafts, never official issuance.
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::export::{report_card, FieldDisclosure};
use crate::repository::{
    class_record, grading_computation, report_source_lock, role, section_membership,
};

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportCardDraftComparison {
    pub draft_id: String,
    pub class_record_id: String,
    pub stored_snapshot_sha256: String,
    pub projection_matches: bool,
    pub changed_fields: Vec<String>,
    pub current: ReportCardReadiness,
    pub comparison_scope: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportCardDraftSourceCheck {
    pub draft_id: String,
    pub class_record_id: String,
    pub source_status: &'static str,
    pub source_version: Option<String>,
    pub stored_source_sha256: Option<String>,
    pub current_source_sha256: Option<String>,
}

/// Read-only fingerprint check, never approval or an atomic issue authorization.
pub fn check_report_card_draft_source_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
    draft_id: &str,
) -> AppResult<Option<ReportCardDraftSourceCheck>> {
    let tx = conn.unchecked_transaction()?;
    if authorized_record(&tx, actor_user_id, school_id, class_record_id)?.is_none() {
        return Ok(None);
    }
    let stored = tx
        .query_row(
            "SELECT id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id, created_at \
             FROM report_card_drafts WHERE id = ?1 AND school_id = ?2 AND class_record_id = ?3",
            params![draft_id, school_id, class_record_id],
            stored_draft,
        )
        .optional()?;
    let Some(stored) = stored else {
        return Ok(None);
    };
    let draft = decode_draft(stored)?;
    let source: Option<(String, String, String)> = tx
        .query_row(
            "SELECT source_version, source_json, source_sha256 FROM report_card_draft_source_locks \
             WHERE draft_id = ?1 AND school_id = ?2",
            params![draft_id, school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let mut check = ReportCardDraftSourceCheck {
        draft_id: draft.id,
        class_record_id: draft.class_record_id,
        source_status: "legacy_unavailable",
        source_version: None,
        stored_source_sha256: None,
        current_source_sha256: None,
    };
    if let Some((version, source_json, hash)) = source {
        if report_source_lock::hash(&source_json) != hash {
            return Err(AppError::Validation(
                "Stored reporting source integrity check failed".into(),
            ));
        }
        let source: serde_json::Value = serde_json::from_str(&source_json).map_err(|_| {
            AppError::Validation("Stored reporting source could not be read".into())
        })?;
        if source["schoolId"].as_str() != Some(school_id)
            || source["classRecordId"].as_str() != Some(class_record_id)
            || source["version"].as_str() != Some(version.as_str())
        {
            return Err(AppError::Validation(
                "Stored reporting source context is invalid".into(),
            ));
        }
        check.source_status = "unsupported_version";
        check.source_version = Some(version.clone());
        check.stored_source_sha256 = Some(hash.clone());
        if version == report_source_lock::VERSION {
            let Some(current) =
                preview_report_card_authorized(&tx, actor_user_id, school_id, class_record_id)?
            else {
                return Ok(None);
            };
            let current_json = report_source_lock::capture_json(&tx, school_id, &current)?;
            let current_hash = report_source_lock::hash(&current_json);
            check.source_status = if current_hash == hash {
                "matches"
            } else {
                "changed"
            };
            check.current_source_sha256 = Some(current_hash);
        }
    }
    tx.commit()?;
    Ok(Some(check))
}

/// Compare the projected evidence, excluding only the volatile read timestamp.
/// This deliberately is not a raw-source lock or issuance authorization.
fn changed_projection_fields(
    stored: &serde_json::Value,
    current: &serde_json::Value,
) -> AppResult<Vec<String>> {
    let old = stored.as_object().ok_or_else(|| {
        AppError::Validation("Stored reporting projection is not an object".into())
    })?;
    let new = current.as_object().ok_or_else(|| {
        AppError::Validation("Current reporting projection is not an object".into())
    })?;
    let fields: std::collections::BTreeSet<_> = old.keys().chain(new.keys()).collect();
    Ok(fields
        .into_iter()
        .filter(|key| key.as_str() != "checkedAt" && old.get(*key) != new.get(*key))
        .cloned()
        .collect())
}

/// Reauthorize one exact retained draft; never search a truncated recent-history list.
/// No write, grade approval, review event or issue transition occurs.
pub fn compare_report_card_draft_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
    draft_id: &str,
) -> AppResult<Option<ReportCardDraftComparison>> {
    if authorized_record(conn, actor_user_id, school_id, class_record_id)?.is_none() {
        return Ok(None);
    }
    let stored = conn
        .query_row(
            "SELECT id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id, created_at \
             FROM report_card_drafts WHERE id = ?1 AND school_id = ?2 AND class_record_id = ?3",
            params![draft_id, school_id, class_record_id],
            stored_draft,
        )
        .optional()?;
    let Some(stored) = stored else {
        return Ok(None);
    };
    let draft = decode_draft(stored)?;
    let Some(current) =
        preview_report_card_authorized(conn, actor_user_id, school_id, class_record_id)?
    else {
        return Ok(None);
    };
    let current_json = serde_json::to_value(&current).map_err(|_| {
        AppError::Validation("Current reporting projection could not be read".into())
    })?;
    let changed_fields = changed_projection_fields(&draft.snapshot, &current_json)?;
    Ok(Some(ReportCardDraftComparison {
        draft_id: draft.id,
        class_record_id: draft.class_record_id,
        stored_snapshot_sha256: draft.snapshot_sha256,
        projection_matches: changed_fields.is_empty(),
        changed_fields,
        current,
        comparison_scope: "reporting_projection_only_not_source_lock_or_approval",
    }))
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
    let tx = conn.unchecked_transaction()?;
    let Some(preview) =
        preview_report_card_authorized(&tx, actor_user_id, school_id, class_record_id)?
    else {
        return Ok(None);
    };
    let snapshot_json = serde_json::to_string(&preview)
        .map_err(|_| AppError::Validation("Reporting draft could not be serialized".into()))?;
    let id = Uuid::now_v7().to_string();
    let source_json = report_source_lock::capture_json(&tx, school_id, &preview)?;
    tx.execute(
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
    tx.execute(
        "INSERT INTO report_card_draft_source_locks \
         (draft_id, school_id, source_version, source_json, source_sha256) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            id,
            school_id,
            report_source_lock::VERSION,
            source_json,
            report_source_lock::hash(&source_json)
        ],
    )?;
    let draft = tx.query_row(
        "SELECT id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id, created_at \
         FROM report_card_drafts WHERE id = ?1 AND school_id = ?2",
        params![id, school_id],
        stored_draft,
    )?;
    let draft = decode_draft(draft)?;
    tx.commit()?;
    Ok(Some(draft))
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
    fn comparison_excludes_only_clock_and_reports_sorted_projection_changes() {
        let old = serde_json::json!({
            "checkedAt": "old-time", "sectionName": "old", "learners": [],
            "missingLrnCount": 0, "disclosure": {"omittedFields": []}
        });
        let mut current = old.clone();
        current["checkedAt"] = serde_json::json!("new-time");
        assert!(changed_projection_fields(&old, &current)
            .unwrap()
            .is_empty());
        current["sectionName"] = serde_json::json!("changed");
        current["learners"] = serde_json::json!([{"learnerId": "new"}]);
        current["missingLrnCount"] = serde_json::json!(1);
        current["disclosure"] = serde_json::json!({"omittedFields": ["new"]});
        current["newField"] = serde_json::json!(true);
        assert_eq!(
            changed_projection_fields(&old, &current).unwrap(),
            vec![
                "disclosure",
                "learners",
                "missingLrnCount",
                "newField",
                "sectionName",
            ]
        );
        assert!(changed_projection_fields(&serde_json::Value::Null, &current).is_err());
        assert!(changed_projection_fields(&old, &serde_json::Value::Null).is_err());
    }

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
        let changes = conn.total_changes();
        let same = compare_report_card_draft_authorized(
            &conn,
            &teacher.id,
            &school.id,
            &record.id,
            &draft.id,
        )
        .unwrap()
        .unwrap();
        assert!(same.projection_matches);
        assert!(same.changed_fields.is_empty());
        assert_eq!(same.draft_id, draft.id);
        assert_eq!(same.class_record_id, record.id);
        assert_eq!(
            same.comparison_scope,
            "reporting_projection_only_not_source_lock_or_approval"
        );
        assert_eq!(same.stored_snapshot_sha256, draft.snapshot_sha256);
        let source_check = check_report_card_draft_source_authorized(
            &conn,
            &teacher.id,
            &school.id,
            &record.id,
            &draft.id,
        )
        .unwrap()
        .unwrap();
        assert_eq!(source_check.source_status, "matches");
        assert_eq!(
            source_check.stored_source_sha256,
            source_check.current_source_sha256
        );
        assert_eq!(conn.total_changes(), changes);
        assert!(compare_report_card_draft_authorized(
            &conn,
            &teacher.id,
            &school.id,
            &record.id,
            "missing-draft",
        )
        .unwrap()
        .is_none());
        assert!(compare_report_card_draft_authorized(
            &conn,
            &teacher.id,
            &foreign.id,
            &record.id,
            &draft.id,
        )
        .unwrap()
        .is_none());
        assert!(
            compare_report_card_draft_authorized(
                &conn, &other.id, &school.id, &record.id, &draft.id,
            )
            .unwrap()
            .unwrap()
            .projection_matches
        );
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
        let changes = conn.total_changes();
        let changed = compare_report_card_draft_authorized(
            &conn,
            &teacher.id,
            &school.id,
            &record.id,
            &draft.id,
        )
        .unwrap()
        .unwrap();
        assert!(!changed.projection_matches);
        assert_eq!(changed.changed_fields, vec!["sectionName"]);
        assert_eq!(changed.current.section_name, "Changed Section");
        assert_eq!(changed.stored_snapshot_sha256, draft.snapshot_sha256);
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &draft.id,
            )
            .unwrap()
            .unwrap()
            .source_status,
            "changed"
        );
        assert_eq!(conn.total_changes(), changes);
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
        assert!(matches!(
            compare_report_card_draft_authorized(
                &conn,
                &outsider.id,
                &school.id,
                &record.id,
                &draft.id,
            ),
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            check_report_card_draft_source_authorized(
                &conn,
                &outsider.id,
                &school.id,
                &record.id,
                &draft.id,
            ),
            Err(AppError::Unauthorized)
        ));
        assert!(check_report_card_draft_source_authorized(
            &conn,
            &teacher.id,
            &foreign.id,
            &record.id,
            &draft.id,
        )
        .unwrap()
        .is_none());
        assert!(conn
            .execute(
                "UPDATE report_card_draft_source_locks SET source_json = '{}' WHERE draft_id = ?1",
                params![draft.id],
            )
            .is_err());
        assert!(conn
            .execute(
                "DELETE FROM report_card_draft_source_locks WHERE draft_id = ?1",
                params![draft.id],
            )
            .is_err());
        conn.execute(
            "INSERT INTO report_card_drafts \
             (id, school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id) \
             VALUES ('corrupt-draft', ?1, ?2, '{}', ?3, ?4)",
            params![school.id, record.id, "0".repeat(64), teacher.id],
        )
        .unwrap();
        assert!(matches!(
            compare_report_card_draft_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                "corrupt-draft",
            ),
            Err(AppError::Validation(_))
        ));

        // A migration-era draft has no inferred source lock.
        let snapshot_json = serde_json::to_string(&draft.snapshot).unwrap();
        conn.execute(
            "INSERT INTO report_card_drafts \
             (id, school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id) \
             VALUES ('legacy-draft', ?1, ?2, ?3, ?4, ?5)",
            params![
                school.id,
                record.id,
                snapshot_json,
                snapshot_sha256(&snapshot_json),
                teacher.id
            ],
        )
        .unwrap();
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                "legacy-draft",
            )
            .unwrap()
            .unwrap()
            .source_status,
            "legacy_unavailable"
        );
        assert!(conn
            .execute(
                "INSERT INTO report_card_draft_source_locks \
             (draft_id, school_id, source_version, source_json, source_sha256) \
             VALUES ('legacy-draft', ?1, 'foreign', '{}', ?2)",
                params![foreign.id, "0".repeat(64)],
            )
            .is_err());
        let future_source = serde_json::json!({
            "schoolId": school.id, "classRecordId": record.id, "version": "future-unrecognized"
        })
        .to_string();
        conn.execute(
            "INSERT INTO report_card_draft_source_locks \
             (draft_id, school_id, source_version, source_json, source_sha256) \
             VALUES ('legacy-draft', ?1, 'future-unrecognized', ?2, ?3)",
            params![
                school.id,
                future_source,
                report_source_lock::hash(&future_source)
            ],
        )
        .unwrap();
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                "legacy-draft",
            )
            .unwrap()
            .unwrap()
            .source_status,
            "unsupported_version"
        );

        // Actual LRN digits and raw scores are not present in the projection.
        conn.execute(
            "UPDATE learners SET lrn = '123456789012' WHERE id = ?1",
            params![earlier.id],
        )
        .unwrap();
        let item = crate::repository::assessment_item::create(
            &conn,
            &school.id,
            &record.id,
            "00000000-0000-7000-8000-000000000311",
            "Synthetic Quiz",
            10.0,
        )
        .unwrap()
        .unwrap();
        conn.execute(
            "INSERT INTO learner_scores \
             (id, school_id, assessment_item_id, learner_id, status, score, recorded_by_user_id) \
             VALUES ('synthetic-score', ?1, ?2, ?3, 'scored', 5, ?4)",
            params![school.id, item.id, earlier.id, teacher.id],
        )
        .unwrap();
        let raw_draft =
            capture_report_card_draft_authorized(&conn, &teacher.id, &school.id, &record.id)
                .unwrap()
                .unwrap();
        conn.execute(
            "UPDATE learners SET lrn = '123456789013' WHERE id = ?1",
            params![earlier.id],
        )
        .unwrap();
        assert!(
            compare_report_card_draft_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &raw_draft.id
            )
            .unwrap()
            .unwrap()
            .projection_matches
        );
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &raw_draft.id
            )
            .unwrap()
            .unwrap()
            .source_status,
            "changed"
        );
        let score_draft =
            capture_report_card_draft_authorized(&conn, &teacher.id, &school.id, &record.id)
                .unwrap()
                .unwrap();
        conn.execute(
            "UPDATE learner_scores SET score = 6 WHERE id = 'synthetic-score'",
            [],
        )
        .unwrap();
        assert!(
            compare_report_card_draft_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &score_draft.id
            )
            .unwrap()
            .unwrap()
            .projection_matches
        );
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &score_draft.id
            )
            .unwrap()
            .unwrap()
            .source_status,
            "changed"
        );
        let policy_draft =
            capture_report_card_draft_authorized(&conn, &teacher.id, &school.id, &record.id)
                .unwrap()
                .unwrap();
        learner::create(&conn, &foreign.id, "Unrelated", "Learner", None, None).unwrap();
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &policy_draft.id
            )
            .unwrap()
            .unwrap()
            .source_status,
            "matches"
        );
        conn.execute("UPDATE grading_weight_components SET weight_percent = 19 WHERE id = '00000000-0000-7000-8000-000000000411'", []).unwrap();
        assert_eq!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                &policy_draft.id
            )
            .unwrap()
            .unwrap()
            .source_status,
            "changed"
        );

        conn.execute(
            "INSERT INTO report_card_drafts \
             (id, school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id) \
             VALUES ('invalid-source-draft', ?1, ?2, ?3, ?4, ?5)",
            params![
                school.id,
                record.id,
                snapshot_json,
                snapshot_sha256(&snapshot_json),
                teacher.id
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO report_card_draft_source_locks \
             (draft_id, school_id, source_version, source_json, source_sha256) \
             VALUES ('invalid-source-draft', ?1, 'invalid', '{}', ?2)",
            params![school.id, "0".repeat(64)],
        )
        .unwrap();
        assert!(matches!(
            check_report_card_draft_source_authorized(
                &conn,
                &teacher.id,
                &school.id,
                &record.id,
                "invalid-source-draft"
            ),
            Err(AppError::Validation(_))
        ));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM report_card_drafts", [], |row| {
                row.get(0)
            })
            .unwrap();
        conn.execute_batch("CREATE TRIGGER synthetic_lock_failure BEFORE INSERT ON report_card_draft_source_locks BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;").unwrap();
        assert!(
            capture_report_card_draft_authorized(&conn, &teacher.id, &school.id, &record.id)
                .is_err()
        );
        let after: i64 = conn
            .query_row("SELECT COUNT(*) FROM report_card_drafts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(
            count, after,
            "draft and source lock must roll back together"
        );
    }
}
