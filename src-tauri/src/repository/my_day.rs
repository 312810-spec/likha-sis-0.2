use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;
use crate::repository::subject_attendance::{self, SessionStatus};
use crate::repository::{schedule_meeting, sync_conflict_review, teaching_assignment};

/// One occurrence of a class meeting today, ready for display -- a flat
/// projection of a `TeachingAssignmentDetail` joined with one of today's
/// `ScheduleMeeting`s, the same join `TodaysClassesScreen` already performs
/// client-side (`src/ui/TodaysClassesScreen.tsx`) but computed once, in
/// Rust, for the combined "My Day" view.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MyDayScheduleItem {
    pub teaching_assignment_id: String,
    pub subject_name: String,
    pub section_name: String,
    pub starts_at: String,
    pub ends_at: String,
    pub room: Option<String>,
}

/// One teaching assignment that meets today and still needs an attendance
/// check -- either no session has been opened yet for today's date, or one
/// was opened but has zero recorded entries. A session already explicitly
/// marked `NoClass` is never flagged: the teacher already made a deliberate
/// decision for that occurrence, so there is nothing left pending.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MyDayPendingAttendance {
    pub teaching_assignment_id: String,
    pub subject_name: String,
    pub section_name: String,
}

/// One of this teacher's own not-yet-resolved sync conflicts -- narrowed
/// from `sync_conflict_review::list_open_for_school` (school-wide) down to
/// rows whose `actor_user_id` is this teacher's own, since only their own
/// conflicting edit is theirs to review and resolve.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MyDayPendingConflict {
    pub id: String,
    pub entity_kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MyDaySummary {
    pub schedule: Vec<MyDayScheduleItem>,
    pub pending_attendance: Vec<MyDayPendingAttendance>,
    pub pending_conflicts: Vec<MyDayPendingConflict>,
}

/// Builds one teacher's "My Day" aggregate: today's schedule occurrences
/// (`today_weekday`, 0 = Sunday … 6 = Saturday -- the convention
/// `domain/schedule-meeting.ts` established, matching JavaScript's
/// `Date.prototype.getDay()`) plus the two conservative, read-only-derived
/// pending-task signals this milestone's scope allows: attendance not yet
/// (fully) checked for a class that meets today, and this teacher's own
/// open sync conflicts. Deliberately does NOT invent a new "task" concept
/// or table -- every field here is computed fresh from data that already
/// exists, on every call.
pub fn summary_for_teacher(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    today_weekday: i64,
    today_date: &str,
) -> AppResult<MyDaySummary> {
    let assignments =
        teaching_assignment::list_by_teacher_in_school(conn, school_id, teacher_user_id)?;

    let mut schedule = Vec::new();
    let mut pending_attendance = Vec::new();

    for assignment in &assignments {
        let meetings =
            schedule_meeting::list_by_assignment_in_school(conn, school_id, &assignment.id)?;
        let todays_meetings: Vec<_> = meetings
            .into_iter()
            .filter(|meeting| meeting.weekday == today_weekday)
            .collect();
        if todays_meetings.is_empty() {
            continue;
        }

        for meeting in &todays_meetings {
            schedule.push(MyDayScheduleItem {
                teaching_assignment_id: assignment.id.clone(),
                subject_name: assignment.subject_name.clone(),
                section_name: assignment.section_name.clone(),
                starts_at: meeting.starts_at.clone(),
                ends_at: meeting.ends_at.clone(),
                room: meeting.room.clone(),
            });
        }

        if attendance_is_pending(conn, school_id, &assignment.id, today_date)? {
            pending_attendance.push(MyDayPendingAttendance {
                teaching_assignment_id: assignment.id.clone(),
                subject_name: assignment.subject_name.clone(),
                section_name: assignment.section_name.clone(),
            });
        }
    }

    schedule.sort_by(|a, b| a.starts_at.cmp(&b.starts_at));

    let pending_conflicts = sync_conflict_review::list_open_for_school(conn, school_id)?
        .into_iter()
        .filter(|conflict| conflict.actor_user_id == teacher_user_id)
        .map(|conflict| MyDayPendingConflict {
            id: conflict.id,
            entity_kind: conflict.entity_kind.as_db_str().to_string(),
        })
        .collect();

    Ok(MyDaySummary {
        schedule,
        pending_attendance,
        pending_conflicts,
    })
}

/// True when today's session for this assignment either hasn't been opened
/// yet, or was opened but nobody has been marked yet. False once at least
/// one entry has been recorded, or the session was explicitly marked
/// `NoClass` -- both are a completed decision, not something still pending.
fn attendance_is_pending(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    today_date: &str,
) -> AppResult<bool> {
    match subject_attendance::find_session_for_assignment_on_date(
        conn,
        school_id,
        teaching_assignment_id,
        today_date,
    )? {
        None => Ok(true),
        Some(session) if session.status == SessionStatus::NoClass => Ok(false),
        Some(session) => {
            let entry_count = subject_attendance::count_entries_for_session(conn, &session.id)?;
            Ok(entry_count == 0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{
        schedule_meeting as schedule_meeting_repo, school, section, subject, subject_attendance,
        teaching_assignment as ta_repo, user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        assignment_id: String,
    }

    /// A school, one teacher, one section, one subject, one teaching
    /// assignment, and one Wednesday (weekday 3) meeting 08:00-08:50.
    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = ta_repo::create(conn, &s.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        schedule_meeting_repo::create(conn, &s.id, &assignment.id, 3, "08:00", "08:50", None)
            .unwrap();
        Fixture {
            school_id: s.id,
            teacher_id: teacher.id,
            assignment_id: assignment.id,
        }
    }

    #[test]
    fn summary_includes_todays_meeting_and_omits_a_different_weekday() {
        let conn = open_test_db();
        let f = seed(&conn);

        let wednesday =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();
        assert_eq!(wednesday.schedule.len(), 1);
        assert_eq!(wednesday.schedule[0].starts_at, "08:00");

        let thursday =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 4, "2026-09-10").unwrap();
        assert!(
            thursday.schedule.is_empty(),
            "not this teacher's day to meet"
        );
    }

    #[test]
    fn pending_attendance_is_flagged_when_no_session_has_been_opened_yet() {
        let conn = open_test_db();
        let f = seed(&conn);

        let summary =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert_eq!(summary.pending_attendance.len(), 1);
        assert_eq!(
            summary.pending_attendance[0].teaching_assignment_id,
            f.assignment_id
        );
    }

    #[test]
    fn pending_attendance_is_flagged_when_a_session_was_opened_but_nothing_was_entered() {
        let conn = open_test_db();
        let f = seed(&conn);
        subject_attendance::open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();

        let summary =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert_eq!(
            summary.pending_attendance.len(),
            1,
            "opened but empty must still count as pending"
        );
    }

    #[test]
    fn pending_attendance_is_not_flagged_once_at_least_one_entry_is_recorded() {
        let conn = open_test_db();
        let f = seed(&conn);
        let section_id = ta_repo::find_by_id_in_school(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .unwrap()
            .section_id;
        let learner =
            crate::repository::learner::create(&conn, &f.school_id, "Ana", "Cruz", None, None)
                .unwrap();
        let membership = crate::repository::section_membership::enroll(
            &conn,
            &f.school_id,
            &section_id,
            &learner.id,
            "2026-06-01",
        )
        .unwrap()
        .unwrap();
        let session = subject_attendance::open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        subject_attendance::record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &membership.id,
            subject_attendance::EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        let summary =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert!(
            summary.pending_attendance.is_empty(),
            "at least one recorded entry means this is no longer pending"
        );
    }

    #[test]
    fn pending_attendance_is_not_flagged_once_marked_no_class() {
        let conn = open_test_db();
        let f = seed(&conn);
        subject_attendance::mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();

        let summary =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert!(
            summary.pending_attendance.is_empty(),
            "an explicit No Class decision is not a pending task"
        );
    }

    #[test]
    fn a_teacher_cannot_see_another_teachers_schedule_or_pending_attendance() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();

        let summary =
            summary_for_teacher(&conn, &f.school_id, &other_teacher.id, 3, "2026-09-09").unwrap();

        assert!(summary.schedule.is_empty());
        assert!(summary.pending_attendance.is_empty());
    }

    #[test]
    fn a_teacher_cannot_see_another_schools_summary_even_via_a_forged_school_id() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();

        let summary =
            summary_for_teacher(&conn, &other_school.id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert!(
            summary.schedule.is_empty(),
            "this teacher's own assignment lives in a different school and must not surface here"
        );
    }

    #[test]
    fn pending_conflicts_only_includes_this_teachers_own_open_conflicts() {
        use crate::repository::sync_hub::AcceptedChange;
        use crate::sync::{ChangeOperation, EntityKind, SyncCursor};
        use uuid::Uuid;

        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();
        let teacher_uuid = Uuid::parse_str(&f.teacher_id).unwrap_or_else(|_| Uuid::now_v7());
        let other_teacher_uuid =
            Uuid::parse_str(&other_teacher.id).unwrap_or_else(|_| Uuid::now_v7());

        let mine = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: teacher_uuid,
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::now_v7(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![1, 2, 3],
        };
        let others = AcceptedChange {
            cursor: SyncCursor(2),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: other_teacher_uuid,
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::now_v7(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![1, 2, 3],
        };
        sync_conflict_review::stage_pull_conflict(&conn, &f.school_id, 1, &mine).unwrap();
        sync_conflict_review::stage_pull_conflict(&conn, &f.school_id, 1, &others).unwrap();

        let summary =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert_eq!(summary.pending_conflicts.len(), 1);
        assert_eq!(summary.pending_conflicts[0].entity_kind, "learner");
    }

    #[test]
    fn multiple_meetings_the_same_day_are_returned_sorted_by_start_time() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_section = section::create(&conn, &f.school_id, "2026-2027", "8", "Luna").unwrap();
        let other_subject = subject::create(&conn, &f.school_id, "Science").unwrap();
        let other_assignment = ta_repo::create(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &other_section.id,
            &other_subject.id,
        )
        .unwrap()
        .unwrap();
        schedule_meeting_repo::create(
            &conn,
            &f.school_id,
            &other_assignment.id,
            3,
            "07:00",
            "07:50",
            None,
        )
        .unwrap();

        let summary =
            summary_for_teacher(&conn, &f.school_id, &f.teacher_id, 3, "2026-09-09").unwrap();

        assert_eq!(summary.schedule.len(), 2);
        assert_eq!(summary.schedule[0].starts_at, "07:00");
        assert_eq!(summary.schedule[1].starts_at, "08:00");
    }
}
