//! Read-only report-card preparation evidence, never issuance or official approval.
use rusqlite::{params, Connection};
use serde::Serialize;

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

/// Full grading-period roster, not the currently selected assessment item's roster.
/// No file generation, data mutation, persisted review or issued-state inference.
pub fn preview_report_card_authorized(
    conn: &Connection,
    actor_user_id: &str,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<ReportCardReadiness>> {
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
    }
}
