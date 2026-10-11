//! Current-role and current-assignment checks for sensitive reads and reviews.
//! Session identity is resolved by commands; relationships are always read here.
use crate::error::AppResult;
use crate::repository::role;
use crate::sync::EntityKind;
use rusqlite::Connection;

pub fn manages_learners(conn: &Connection, user: &str, school: &str) -> AppResult<bool> {
    role::has_any_role(conn, user, school, &[role::REGISTRAR, role::SCHOOL_HEAD])
}

pub fn can_read_learner(
    conn: &Connection,
    user: &str,
    school: &str,
    learner: &str,
) -> AppResult<bool> {
    if manages_learners(conn, user, school)? {
        return Ok(true);
    }
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM section_memberships m WHERE m.school_id=?1 AND m.learner_id=?3 AND (
            EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.school_id=?1 AND a.section_id=m.section_id AND a.teacher_user_id=?2)
            OR EXISTS(SELECT 1 FROM section_advisories a WHERE a.school_id=?1 AND a.section_id=m.section_id AND a.teacher_user_id=?2 AND a.ends_on IS NULL)))",
        (school, user, learner), |r| r.get(0))?)
}

/// Review authority follows write authority, not merely school membership.
/// Unknown/deleted entities fail closed for teachers; an administrator reviews them.
pub fn can_resolve_entity(
    conn: &Connection,
    user: &str,
    school: &str,
    kind: EntityKind,
    id: &str,
) -> AppResult<bool> {
    if role::has_any_role(conn, user, school, &[role::SCHOOL_HEAD])? {
        return Ok(true);
    }
    if matches!(
        kind,
        EntityKind::Learner | EntityKind::Section | EntityKind::SectionMembership
    ) && role::has_any_role(conn, user, school, &[role::REGISTRAR])?
    {
        return Ok(true);
    }
    let query = match kind {
        EntityKind::Attendance => "SELECT EXISTS(SELECT 1 FROM attendance_records e JOIN section_advisories a ON a.section_id=e.section_id AND a.school_id=e.school_id WHERE e.school_id=?1 AND a.teacher_user_id=?2 AND e.id=?3 AND a.ends_on IS NULL)",
        EntityKind::SubjectAttendance => "SELECT EXISTS(SELECT 1 FROM subject_attendance_sessions e JOIN teaching_assignments a ON a.id=e.teaching_assignment_id AND a.school_id=e.school_id WHERE e.school_id=?1 AND a.teacher_user_id=?2 AND e.id=?3)",
        EntityKind::SubjectAttendanceEntry => "SELECT EXISTS(SELECT 1 FROM subject_attendance_entries e JOIN subject_attendance_sessions s ON s.id=e.session_id JOIN teaching_assignments a ON a.id=s.teaching_assignment_id AND a.school_id=s.school_id WHERE s.school_id=?1 AND a.teacher_user_id=?2 AND e.id=?3)",
        EntityKind::AssessmentItem => "SELECT EXISTS(SELECT 1 FROM assessment_items e JOIN class_records c ON c.id=e.class_record_id AND c.school_id=e.school_id JOIN teaching_assignments a ON a.section_id=c.section_id AND a.subject_id=c.subject_id AND a.school_id=c.school_id WHERE e.school_id=?1 AND a.teacher_user_id=?2 AND e.id=?3)",
        EntityKind::LearnerScore => "SELECT EXISTS(SELECT 1 FROM learner_scores e JOIN assessment_items i ON i.id=e.assessment_item_id AND i.school_id=e.school_id JOIN class_records c ON c.id=i.class_record_id AND c.school_id=i.school_id JOIN teaching_assignments a ON a.section_id=c.section_id AND a.subject_id=c.subject_id AND a.school_id=c.school_id WHERE e.school_id=?1 AND a.teacher_user_id=?2 AND e.id=?3)",
        _ => return Ok(false),
    };
    Ok(conn.query_row(query, (school, user, id), |r| r.get(0))?)
}

/// An incoming conflict must not move an owned entity into another scope.
/// Admins may reconcile shared reference data; teachers may change record content
/// while preserving the entity's existing parent relationship.
pub fn can_apply_incoming(
    conn: &Connection,
    user: &str,
    school: &str,
    kind: EntityKind,
    id: &str,
    payload: &serde_json::Value,
) -> AppResult<bool> {
    if payload.get("id").and_then(serde_json::Value::as_str) != Some(id) {
        return Ok(false);
    }
    if kind != EntityKind::SubjectAttendanceEntry
        && payload.get("schoolId").and_then(serde_json::Value::as_str) != Some(school)
    {
        return Ok(false);
    }
    if role::has_any_role(conn, user, school, &[role::SCHOOL_HEAD, role::REGISTRAR])? {
        return can_resolve_entity(conn, user, school, kind, id);
    }
    if !can_resolve_entity(conn, user, school, kind, id)? {
        return Ok(false);
    }
    let (query, fields): (&str, &[&str]) = match kind {
        EntityKind::Attendance => ("SELECT section_id, learner_id FROM attendance_records WHERE school_id=?1 AND id=?2", &["sectionId", "learnerId"]),
        EntityKind::SubjectAttendance => ("SELECT teaching_assignment_id, section_id, subject_id FROM subject_attendance_sessions WHERE school_id=?1 AND id=?2", &["teachingAssignmentId", "sectionId", "subjectId"]),
        EntityKind::SubjectAttendanceEntry => ("SELECT e.session_id, e.membership_id, e.learner_id FROM subject_attendance_entries e JOIN subject_attendance_sessions s ON s.id=e.session_id WHERE s.school_id=?1 AND e.id=?2", &["sessionId", "membershipId", "learnerId"]),
        EntityKind::AssessmentItem => ("SELECT class_record_id FROM assessment_items WHERE school_id=?1 AND id=?2", &["classRecordId"]),
        EntityKind::LearnerScore => ("SELECT assessment_item_id, learner_id FROM learner_scores WHERE school_id=?1 AND id=?2", &["assessmentItemId", "learnerId"]),
        _ => return Ok(false),
    };
    Ok(conn.query_row(query, (school, id), |row| {
        for (index, field) in fields.iter().enumerate() {
            let existing: String = row.get(index)?;
            if payload.get(*field).and_then(serde_json::Value::as_str) != Some(existing.as_str()) {
                return Ok(false);
            }
        }
        Ok(true)
    })?)
}

/// The hub decrypts before accepting a push. Ownership is derived from trusted
/// parents, so fresh teacher-authored rows can sync without trusting actor fields.
pub fn can_write_sync_payload(
    conn: &Connection,
    user: &str,
    school: &str,
    kind: EntityKind,
    id: &str,
    payload: &serde_json::Value,
) -> AppResult<bool> {
    if payload.get("id").and_then(serde_json::Value::as_str) != Some(id) {
        return Ok(false);
    }
    if kind != EntityKind::SubjectAttendanceEntry
        && payload.get("schoolId").and_then(serde_json::Value::as_str) != Some(school)
    {
        return Ok(false);
    }
    if role::has_any_role(conn, user, school, &[role::SCHOOL_HEAD])? {
        return Ok(true);
    }
    if matches!(
        kind,
        EntityKind::Learner | EntityKind::Section | EntityKind::SectionMembership
    ) && role::has_any_role(conn, user, school, &[role::REGISTRAR])?
    {
        return Ok(true);
    }
    let field = |name: &str| {
        payload
            .get(name)
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
    };
    let (query, parent, learner) = match kind {
        EntityKind::Attendance => ("SELECT EXISTS(SELECT 1 FROM section_advisories a JOIN section_memberships m ON m.section_id=a.section_id AND m.school_id=a.school_id WHERE a.school_id=?1 AND a.teacher_user_id=?2 AND a.section_id=?3 AND a.ends_on IS NULL AND m.learner_id=?4)", field("sectionId"), field("learnerId")),
        EntityKind::SubjectAttendance => ("SELECT EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.school_id=?1 AND a.teacher_user_id=?2 AND a.id=?3 AND a.section_id=?4)", field("teachingAssignmentId"), field("sectionId")),
        EntityKind::SubjectAttendanceEntry => ("SELECT EXISTS(SELECT 1 FROM subject_attendance_sessions s JOIN teaching_assignments a ON a.id=s.teaching_assignment_id AND a.school_id=s.school_id JOIN section_memberships m ON m.section_id=a.section_id AND m.school_id=a.school_id WHERE s.school_id=?1 AND a.teacher_user_id=?2 AND s.id=?3 AND m.id=?4)", field("sessionId"), field("membershipId")),
        EntityKind::AssessmentItem => ("SELECT EXISTS(SELECT 1 FROM class_records c JOIN teaching_assignments a ON a.section_id=c.section_id AND a.subject_id=c.subject_id AND a.school_id=c.school_id WHERE c.school_id=?1 AND a.teacher_user_id=?2 AND c.id=?3 AND ?4='')", field("classRecordId"), ""),
        EntityKind::LearnerScore => ("SELECT EXISTS(SELECT 1 FROM assessment_items i JOIN class_records c ON c.id=i.class_record_id AND c.school_id=i.school_id JOIN teaching_assignments a ON a.section_id=c.section_id AND a.subject_id=c.subject_id AND a.school_id=c.school_id JOIN section_memberships m ON m.section_id=c.section_id AND m.school_id=c.school_id WHERE c.school_id=?1 AND a.teacher_user_id=?2 AND i.id=?3 AND m.learner_id=?4)", field("assessmentItemId"), field("learnerId")),
        _ => return Ok(false),
    };
    if !conn.query_row(query, (school, user, parent, learner), |r| {
        r.get::<_, bool>(0)
    })? {
        return Ok(false);
    }
    // Supplemental denormalized identities must agree with the trusted parent.
    if kind == EntityKind::SubjectAttendance {
        let matches: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM teaching_assignments WHERE school_id=?1 AND id=?2 AND subject_id=?3)", (school, parent, field("subjectId")), |r| r.get(0))?;
        if !matches {
            return Ok(false);
        }
    }
    if kind == EntityKind::SubjectAttendanceEntry {
        let matches: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM section_memberships WHERE school_id=?1 AND id=?2 AND learner_id=?3)", (school, learner, field("learnerId")), |r| r.get(0))?;
        if !matches {
            return Ok(false);
        }
    }
    // Existing identities cannot be moved, including after an assignment changes.
    let table = match kind {
        EntityKind::Attendance => "attendance_records",
        EntityKind::SubjectAttendance => "subject_attendance_sessions",
        EntityKind::SubjectAttendanceEntry => "subject_attendance_entries",
        EntityKind::AssessmentItem => "assessment_items",
        EntityKind::LearnerScore => "learner_scores",
        _ => return Ok(false),
    };
    let exists: bool = conn.query_row(
        &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
        [id],
        |r| r.get(0),
    )?;
    if exists {
        return can_apply_incoming(conn, user, school, kind, id, payload);
    }
    Ok(true)
}

/// Transport reads expose reference rows only within the caller's present load.
pub fn can_read_sync_payload(
    conn: &Connection,
    user: &str,
    school: &str,
    kind: EntityKind,
    id: &str,
    payload: &serde_json::Value,
) -> AppResult<bool> {
    if payload.get("id").and_then(serde_json::Value::as_str) != Some(id) {
        return Ok(false);
    }
    if kind != EntityKind::SubjectAttendanceEntry
        && payload.get("schoolId").and_then(serde_json::Value::as_str) != Some(school)
    {
        return Ok(false);
    }
    if role::has_any_role(conn, user, school, &[role::SCHOOL_HEAD, role::REGISTRAR])? {
        return Ok(true);
    }
    let field = |name: &str| {
        payload
            .get(name)
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
    };
    match kind {
        EntityKind::Learner => can_read_learner(conn, user, school, id),
        EntityKind::Section | EntityKind::SectionMembership => {
            let section = if kind == EntityKind::Section { id } else { field("sectionId") };
            Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM teaching_assignments WHERE school_id=?1 AND teacher_user_id=?2 AND section_id=?3 UNION ALL SELECT 1 FROM section_advisories WHERE school_id=?1 AND teacher_user_id=?2 AND section_id=?3 AND ends_on IS NULL)", (school, user, section), |r| r.get(0))?)
        }
        EntityKind::Subject => Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM teaching_assignments WHERE school_id=?1 AND teacher_user_id=?2 AND subject_id=?3)", (school, user, id), |r| r.get(0))?),
        EntityKind::GradingPeriod => Ok(true),
        // The former teacher must receive their own deletion/reassignment
        // tombstone even after the live assignment has been removed.
        EntityKind::TeachingAssignment => Ok(field("teacherUserId") == user),
        _ => can_write_sync_payload(conn, user, school, kind, id, payload),
    }
}

/// Opaque fingerprint of the live authority set, never a client-granted scope.
pub fn sync_scope_token(conn: &Connection, user: &str, school: &str) -> AppResult<String> {
    use sha2::{Digest, Sha256};
    let mut parts = vec![user.to_string(), school.to_string()];
    parts.extend(role::list_roles(conn, user, school)?);
    for query in [
        "SELECT 'assignment:' || id || ':' || section_id || ':' || subject_id FROM teaching_assignments WHERE school_id=?1 AND teacher_user_id=?2 ORDER BY id",
        "SELECT 'advisory:' || id || ':' || section_id FROM section_advisories WHERE school_id=?1 AND teacher_user_id=?2 AND ends_on IS NULL ORDER BY id",
    ] {
        let mut stmt = conn.prepare(query)?;
        for row in stmt.query_map((school, user), |r| r.get::<_, String>(0))? { parts.push(row?); }
    }
    let bytes = serde_json::to_vec(&parts).map_err(|_| {
        crate::error::AppError::Validation("sync scope could not be encoded".into())
    })?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        learner, school, section, section_advisory, section_membership, subject,
        teaching_assignment, user,
    };
    use std::path::Path;

    #[test]
    fn learner_reads_follow_assignment_advisory_and_live_roles() {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let s = school::create(&conn, "Synthetic school").unwrap();
        let u = user::create_user(&conn, "assigned", "password", "Assigned teacher").unwrap();
        let other = user::create_user(&conn, "other", "password", "Other teacher").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        user::add_school_membership(&conn, &other.id, &s.id).unwrap();
        let class = section::create(&conn, &s.id, "2026-2027", "10", "Synthetic A").unwrap();
        let l = learner::create(&conn, &s.id, "Synthetic", "Learner", None, None).unwrap();
        section_membership::enroll(&conn, &s.id, &class.id, &l.id, "2026-06-01").unwrap();
        assert!(!can_read_learner(&conn, &u.id, &s.id, &l.id).unwrap());
        let sub = subject::create(&conn, &s.id, "Synthetic subject").unwrap();
        teaching_assignment::create(&conn, &s.id, &u.id, &class.id, &sub.id).unwrap();
        assert!(can_read_learner(&conn, &u.id, &s.id, &l.id).unwrap());
        assert!(!can_read_learner(&conn, &other.id, &s.id, &l.id).unwrap());
        section_advisory::assign(&conn, &s.id, &class.id, &other.id, "2026-06-01").unwrap();
        assert!(can_read_learner(&conn, &other.id, &s.id, &l.id).unwrap());
        assert!(!can_read_learner(&conn, &u.id, "different-school", &l.id).unwrap());
        assert!(!can_resolve_entity(&conn, &u.id, &s.id, EntityKind::Learner, &l.id).unwrap());
        role::grant(&conn, &u.id, &s.id, role::REGISTRAR).unwrap();
        assert!(can_resolve_entity(&conn, &u.id, &s.id, EntityKind::Learner, &l.id).unwrap());
        role::revoke(&conn, &u.id, &s.id, role::REGISTRAR).unwrap();
        assert!(!can_resolve_entity(&conn, &u.id, &s.id, EntityKind::Learner, &l.id).unwrap());
    }

    #[test]
    fn incoming_review_cannot_reparent_an_owned_subject_attendance_session() {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let s = school::create(&conn, "Synthetic school").unwrap();
        let u = user::create_user(&conn, "assigned", "password", "Assigned teacher").unwrap();
        let other = user::create_user(&conn, "other", "password", "Other teacher").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        user::add_school_membership(&conn, &other.id, &s.id).unwrap();
        let class = section::create(&conn, &s.id, "2026-2027", "10", "Synthetic A").unwrap();
        let sub = subject::create(&conn, &s.id, "Synthetic subject").unwrap();
        let assignment = teaching_assignment::create(&conn, &s.id, &u.id, &class.id, &sub.id)
            .unwrap()
            .unwrap();
        conn.execute("INSERT INTO subject_attendance_sessions (id, school_id, teaching_assignment_id, section_id, subject_id, session_date, status, created_by_user_id) VALUES ('session', ?1, ?2, ?3, ?4, '2026-09-09', 'held', ?5)", (&s.id, &assignment.id, &class.id, &sub.id, &u.id)).unwrap();
        assert!(can_resolve_entity(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session"
        )
        .unwrap());
        assert!(!can_resolve_entity(
            &conn,
            &other.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session"
        )
        .unwrap());
        assert!(!can_resolve_entity(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "unknown"
        )
        .unwrap());
        assert!(can_apply_incoming(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session",
            &serde_json::json!({"id": "session", "schoolId": s.id, "teachingAssignmentId": assignment.id, "sectionId": class.id, "subjectId": sub.id})
        )
        .unwrap());
        assert!(!can_apply_incoming(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session",
            &serde_json::json!({"id": "session", "schoolId": s.id, "teachingAssignmentId": "another-assignment", "sectionId": class.id, "subjectId": sub.id})
        )
        .unwrap());
        assert!(!can_apply_incoming(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session",
            &serde_json::json!({"id": "another-session", "schoolId": s.id, "teachingAssignmentId": assignment.id})
        )
        .unwrap());
        let moved_subject = serde_json::json!({"id": "session", "schoolId": s.id, "teachingAssignmentId": assignment.id, "sectionId": class.id, "subjectId": "another-subject"});
        assert!(!can_apply_incoming(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session",
            &moved_subject
        )
        .unwrap());
        let moved_section = serde_json::json!({"id": "session", "schoolId": s.id, "teachingAssignmentId": assignment.id, "sectionId": "another-section", "subjectId": sub.id});
        assert!(!can_apply_incoming(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "session",
            &moved_section
        )
        .unwrap());
        let new_session = serde_json::json!({"id": "fresh", "schoolId": s.id, "teachingAssignmentId": assignment.id, "sectionId": class.id, "subjectId": sub.id});
        assert!(can_write_sync_payload(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "fresh",
            &new_session
        )
        .unwrap());
        assert!(!can_write_sync_payload(
            &conn,
            &other.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "fresh",
            &new_session
        )
        .unwrap());
        conn.execute(
            "UPDATE teaching_assignments SET teacher_user_id=?1 WHERE id=?2",
            (&other.id, &assignment.id),
        )
        .unwrap();
        assert!(!can_write_sync_payload(
            &conn,
            &u.id,
            &s.id,
            EntityKind::SubjectAttendance,
            "fresh",
            &new_session
        )
        .unwrap());
        let tombstone =
            serde_json::json!({"id": assignment.id, "schoolId": s.id, "teacherUserId": u.id});
        assert!(can_read_sync_payload(
            &conn,
            &u.id,
            &s.id,
            EntityKind::TeachingAssignment,
            &assignment.id,
            &tombstone
        )
        .unwrap());
        assert!(!can_read_sync_payload(
            &conn,
            &other.id,
            &s.id,
            EntityKind::TeachingAssignment,
            &assignment.id,
            &tombstone
        )
        .unwrap());
    }
}
