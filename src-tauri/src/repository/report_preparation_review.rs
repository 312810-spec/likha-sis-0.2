//! Preparation review evidence only: no grade approval or official issuance.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{report_readiness, report_source_lock};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparationReviewRequest {
    pub draft_id: String,
    pub request_id: String,
    pub expected_snapshot_sha256: String,
    pub expected_source_sha256: String,
    pub teacher_confirmed: bool,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparationReview {
    pub id: String,
    pub class_record_id: String,
    pub draft_id: String,
    pub request_id: String,
    pub stage: &'static str,
    pub snapshot_sha256: String,
    pub source_sha256: String,
    pub source_version: String,
    pub notes: String,
    pub reviewed_by_user_id: String,
    pub reviewed_at: String,
}

fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn row_review(row: &rusqlite::Row) -> rusqlite::Result<PreparationReview> {
    Ok(PreparationReview {
        id: row.get(0)?,
        class_record_id: row.get(1)?,
        draft_id: row.get(2)?,
        request_id: row.get(3)?,
        stage: "review",
        snapshot_sha256: row.get(4)?,
        source_sha256: row.get(5)?,
        source_version: row.get(6)?,
        notes: row.get(7)?,
        reviewed_by_user_id: row.get(8)?,
        reviewed_at: row.get(9)?,
    })
}
const SELECT_REVIEW: &str = "SELECT id, class_record_id, draft_id, request_id, snapshot_sha256, \
    source_sha256, source_version, notes, reviewed_by_user_id, reviewed_at \
    FROM report_card_preparation_reviews";

/// Confirmation and exact expected identities bind the caller's reviewed evidence.
/// Repeated identical requests return the original event; reused payloads are refused.
pub fn record_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
    request: &PreparationReviewRequest,
) -> AppResult<Option<PreparationReview>> {
    let request_id = Uuid::parse_str(request.request_id.trim())
        .map_err(|_| AppError::Validation("Review request identity is invalid".into()))?
        .to_string();
    let notes = request.notes.trim();
    if !request.teacher_confirmed
        || request.draft_id.trim().is_empty()
        || !valid_hash(&request.expected_snapshot_sha256)
        || !valid_hash(&request.expected_source_sha256)
        || notes.chars().count() > 2000
    {
        return Err(AppError::Validation(
            "Explicit review confirmation and valid evidence are required".into(),
        ));
    }
    let draft_id = request.draft_id.trim();
    let tx = conn.unchecked_transaction()?;
    let Some(check) = report_readiness::check_report_card_draft_source_in_snapshot(
        &tx,
        actor_user_id,
        school_id,
        class_record_id,
        draft_id,
    )?
    else {
        return Ok(None);
    };
    if check.source_status != "matches"
        || check.current_source_sha256.as_deref() != Some(request.expected_source_sha256.as_str())
        || check.stored_source_sha256.as_deref() != Some(request.expected_source_sha256.as_str())
    {
        return Err(AppError::Validation(
            "Draft inputs changed or cannot be verified; capture and review current evidence"
                .into(),
        ));
    }
    let snapshot_hash: String = tx.query_row(
        "SELECT snapshot_sha256 FROM report_card_drafts WHERE id = ?1 AND school_id = ?2 AND class_record_id = ?3",
        params![draft_id, school_id, class_record_id], |row| row.get(0),
    )?;
    if snapshot_hash != request.expected_snapshot_sha256 {
        return Err(AppError::Validation(
            "The reviewed draft identity does not match retained evidence".into(),
        ));
    }
    let sql = format!("{SELECT_REVIEW} WHERE school_id = ?1 AND request_id = ?2");
    if let Some(existing) = tx
        .query_row(&sql, params![school_id, request_id], row_review)
        .optional()?
    {
        if existing.class_record_id != class_record_id
            || existing.draft_id != draft_id
            || existing.reviewed_by_user_id != actor_user_id
            || existing.notes != notes
            || existing.snapshot_sha256 != snapshot_hash
            || existing.source_sha256 != request.expected_source_sha256
            || existing.source_version != report_source_lock::VERSION
        {
            return Err(AppError::Validation(
                "Review request identity was already used for different evidence".into(),
            ));
        }
        tx.commit()?;
        return Ok(Some(existing));
    }
    let id = Uuid::now_v7().to_string();
    tx.execute(
        "INSERT INTO report_card_preparation_reviews \
         (id, school_id, class_record_id, draft_id, request_id, snapshot_sha256, source_sha256, source_version, notes, reviewed_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, school_id, class_record_id, draft_id, request_id, snapshot_hash,
            request.expected_source_sha256, report_source_lock::VERSION, notes, actor_user_id],
    )?;
    let review = tx.query_row(&sql, params![school_id, request_id], row_review)?;
    tx.commit()?;
    Ok(Some(review))
}

/// Current authorization required, but current grades are never recomputed for history.
pub fn list_recent_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Vec<PreparationReview>> {
    if report_readiness::authorized_record(conn, actor_user_id, school_id, class_record_id)?
        .is_none()
    {
        return Ok(Vec::new());
    }
    let sql = format!("{SELECT_REVIEW} WHERE school_id = ?1 AND class_record_id = ?2 ORDER BY reviewed_at DESC, id DESC LIMIT 50");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![school_id, class_record_id], row_review)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        class_record, grading, school, section, subject, teaching_assignment, user,
    };
    use std::path::Path;

    fn fixture() -> (Connection, String, String, String, PreparationReviewRequest) {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let section =
            section::create(&conn, &school.id, "2026-2027", "7", "Synthetic Section").unwrap();
        let subject = subject::create(&conn, &school.id, "Synthetic Subject").unwrap();
        let actor = user::create_user(&conn, "reviewer", "password", "Synthetic Teacher").unwrap();
        user::add_school_membership(&conn, &actor.id, &school.id).unwrap();
        teaching_assignment::create(&conn, &school.id, &actor.id, &section.id, &subject.id)
            .unwrap();
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
            &section.id,
            &subject.id,
            &period.id,
            "00000000-0000-7000-8000-000000000041",
            None,
        )
        .unwrap()
        .unwrap();
        let draft = report_readiness::capture_report_card_draft_authorized(
            &conn, &actor.id, &school.id, &record.id,
        )
        .unwrap()
        .unwrap();
        let source = report_readiness::check_report_card_draft_source_authorized(
            &conn, &actor.id, &school.id, &record.id, &draft.id,
        )
        .unwrap()
        .unwrap();
        let request = PreparationReviewRequest {
            draft_id: draft.id,
            request_id: Uuid::now_v7().to_string(),
            expected_snapshot_sha256: draft.snapshot_sha256,
            expected_source_sha256: source.stored_source_sha256.unwrap(),
            teacher_confirmed: true,
            notes: "  Synthetic incomplete evidence reviewed; not approval.  ".into(),
        };
        (conn, school.id, actor.id, record.id, request)
    }

    #[test]
    fn review_is_immutable_authenticated_and_identical_retries_are_idempotent() {
        let (conn, school, actor, record, mut request) = fixture();
        assert!(list_recent_authorized(&conn, &actor, &school, &record)
            .unwrap()
            .is_empty());
        let review = record_authorized(&conn, &actor, &school, &record, &request)
            .unwrap()
            .unwrap();
        assert_eq!(review.stage, "review");
        assert_eq!(review.reviewed_by_user_id, actor);
        assert!(!review.reviewed_at.is_empty());
        assert_eq!(review.notes, request.notes.trim());
        let changes = conn.total_changes();
        let retry = record_authorized(&conn, &actor, &school, &record, &request)
            .unwrap()
            .unwrap();
        assert_eq!(retry.id, review.id);
        assert_eq!(retry.reviewed_at, review.reviewed_at);
        assert_eq!(conn.total_changes(), changes);
        request.notes = "Different notes under the same request".into();
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        assert_eq!(
            list_recent_authorized(&conn, &actor, &school, &record)
                .unwrap()
                .len(),
            1
        );
        assert!(conn
            .execute(
                "UPDATE report_card_preparation_reviews SET notes = 'changed' WHERE id = ?1",
                params![review.id]
            )
            .is_err());
        assert!(conn
            .execute(
                "DELETE FROM report_card_preparation_reviews WHERE id = ?1",
                params![review.id]
            )
            .is_err());
        conn.execute(
            "UPDATE sections SET name = 'Changed context' WHERE school_id = ?1",
            params![school],
        )
        .unwrap();
        let history = list_recent_authorized(&conn, &actor, &school, &record).unwrap();
        assert_eq!(history[0].snapshot_sha256, review.snapshot_sha256);
        assert_eq!(history[0].notes, review.notes);
    }

    #[test]
    fn false_confirmation_wrong_fingerprints_stale_inputs_and_invalid_requests_write_nothing() {
        let (conn, school, actor, record, mut request) = fixture();
        request.teacher_confirmed = false;
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        request.teacher_confirmed = true;
        let original = request.expected_snapshot_sha256.clone();
        request.expected_snapshot_sha256 = "0".repeat(64);
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        request.expected_snapshot_sha256 = original;
        let original = request.expected_source_sha256.clone();
        request.expected_source_sha256 = "0".repeat(64);
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        request.expected_source_sha256 = original;
        request.notes = "x".repeat(2001);
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        request.notes = "Synthetic".into();
        let original = request.request_id.clone();
        request.request_id = "invalid".into();
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        request.request_id = original;
        conn.execute(
            "UPDATE sections SET name = 'Changed' WHERE school_id = ?1",
            params![school],
        )
        .unwrap();
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        assert!(list_recent_authorized(&conn, &actor, &school, &record)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn unassigned_foreign_missing_and_legacy_reviews_are_refused_and_history_reauthorizes() {
        let (conn, school, actor, record, mut request) = fixture();
        let other = user::create_user(&conn, "unassigned", "password", "Synthetic Other").unwrap();
        user::add_school_membership(&conn, &other.id, &school).unwrap();
        assert!(matches!(
            record_authorized(&conn, &other.id, &school, &record, &request),
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            list_recent_authorized(&conn, &other.id, &school, &record),
            Err(AppError::Unauthorized)
        ));
        let foreign = school::create(&conn, "Foreign School").unwrap();
        assert!(
            record_authorized(&conn, &actor, &foreign.id, &record, &request)
                .unwrap()
                .is_none()
        );
        assert!(list_recent_authorized(&conn, &actor, &foreign.id, &record)
            .unwrap()
            .is_empty());
        let original = request.draft_id.clone();
        request.draft_id = "missing".into();
        assert!(record_authorized(&conn, &actor, &school, &record, &request)
            .unwrap()
            .is_none());
        request.draft_id = original;
        conn.execute(
            "INSERT INTO report_card_drafts \
             (id, school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id) \
             SELECT 'synthetic-legacy', school_id, class_record_id, snapshot_json, snapshot_sha256, created_by_user_id \
             FROM report_card_drafts WHERE id = ?1", params![request.draft_id],
        ).unwrap();
        request.draft_id = "synthetic-legacy".into();
        assert!(record_authorized(&conn, &actor, &school, &record, &request).is_err());
        request.draft_id = conn
            .query_row(
                "SELECT draft_id FROM report_card_draft_source_locks LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        record_authorized(&conn, &actor, &school, &record, &request)
            .unwrap()
            .unwrap();
        conn.execute(
            "DELETE FROM teaching_assignments WHERE teacher_user_id = ?1",
            params![actor],
        )
        .unwrap();
        assert!(matches!(
            list_recent_authorized(&conn, &actor, &school, &record),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn request_does_not_accept_caller_actor_time_school_or_approval_fields() {
        let value = serde_json::json!({
            "draftId": "draft", "requestId": Uuid::now_v7().to_string(),
            "expectedSnapshotSha256": "a".repeat(64), "expectedSourceSha256": "b".repeat(64),
            "teacherConfirmed": true, "notes": "Synthetic"
        });
        for field in [
            "reviewedByUserId",
            "reviewedAt",
            "schoolId",
            "approved",
            "stage",
        ] {
            let mut forged = value.clone();
            forged[field] = serde_json::json!("forged");
            assert!(serde_json::from_value::<PreparationReviewRequest>(forged).is_err());
        }
    }
}
