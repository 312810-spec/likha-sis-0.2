use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::AppResult;
use crate::repository::scheduling_inputs::{
    self, ScheduleRoom, ScheduleSettings, SubjectScheduleRequirement, TeacherUnavailability,
};
use crate::repository::teaching_assignment;

/// The complete, self-contained set of inputs one Teacher Load Maker run
/// is decided against. Everything the generator or the checker can ever
/// need is here, and nothing else influences a placement — which is what
/// makes a fingerprint over this struct a meaningful "Lock".
///
/// Every field is human-confirmable school data; the engine adds no
/// derived preference of its own. `fixed_meetings` is the school's
/// standing manually-created schedule (the rows of `schedule_meetings`
/// with no `plan_id`): CTOS.md §M09's "fixed decisions". The generator
/// treats them as immovable occupancy and never re-places them; the
/// checker treats them as the world a published plan lands into.
#[derive(Debug, Clone)]
pub struct ConstraintInputs {
    pub settings: ScheduleSettings,
    pub assignments: Vec<InputAssignment>,
    pub unavailability: Vec<TeacherUnavailability>,
    pub rooms: Vec<ScheduleRoom>,
    pub requirements: Vec<SubjectScheduleRequirement>,
    pub fixed_meetings: Vec<FixedMeeting>,
    /// Every membership row, section by learner. The shared-learner
    /// constraint is *derived* from these, never stored separately — a
    /// pair of sections sharing a learner is a fact about enrollment, not
    /// a scheduling input a School Head should have to maintain by hand.
    pub memberships: Vec<MembershipRef>,
}

/// One assignment as the load maker sees it: the teaching assignment
/// itself, the names an explainable violation or proof has to quote, and
/// the weekly minutes this assignment demands from the timetable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InputAssignment {
    pub id: String,
    pub teacher_user_id: String,
    pub teacher_name: String,
    pub section_id: String,
    pub section_name: String,
    pub school_year: String,
    pub subject_id: String,
    pub subject_name: String,
    pub required_weekly_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FixedMeeting {
    pub teacher_user_id: String,
    pub section_id: String,
    pub room: Option<String>,
    pub weekday: i64,
    pub starts_at: String,
    pub ends_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MembershipRef {
    pub section_id: String,
    pub learner_id: String,
    pub starts_on: String,
    pub ends_on: Option<String>,
}

/// Loads every constraint input for `school_id` in one pass. Read order
/// is deliberately settings-first: nothing else here is interpretable
/// without the bell grid.
pub fn load(conn: &Connection, school_id: &str) -> AppResult<ConstraintInputs> {
    let settings = scheduling_inputs::ensure(conn, school_id)?;
    let details = teaching_assignment::list_all_in_school(conn, school_id)?;
    let requirements = scheduling_inputs::list_requirements_by_school(conn, school_id)?;
    let unavailability = scheduling_inputs::list_unavailability_by_school(conn, school_id)?;
    let rooms = scheduling_inputs::list_rooms_by_school(conn, school_id)?;

    let teacher_names = list_teacher_names(conn, school_id)?;
    let assignments = details
        .into_iter()
        .map(|detail| {
            let required_weekly_minutes = requirements
                .iter()
                .find(|requirement| requirement.subject_id == detail.subject_id)
                .map(|requirement| requirement.required_weekly_minutes)
                .unwrap_or_default();
            InputAssignment {
                teacher_name: teacher_names
                    .get(&detail.teacher_user_id)
                    .cloned()
                    .unwrap_or_else(|| "Unknown teacher".to_string()),
                required_weekly_minutes,
                id: detail.id,
                teacher_user_id: detail.teacher_user_id,
                section_id: detail.section_id,
                section_name: detail.section_name,
                school_year: detail.school_year,
                subject_id: detail.subject_id,
                subject_name: detail.subject_name,
            }
        })
        .collect();

    let fixed_meetings = list_fixed_meetings(conn, school_id)?;
    let memberships = list_memberships(conn, school_id)?;

    Ok(ConstraintInputs {
        settings,
        assignments,
        unavailability,
        rooms,
        requirements,
        fixed_meetings,
        memberships,
    })
}

fn list_teacher_names(
    conn: &Connection,
    school_id: &str,
) -> AppResult<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare(
        "SELECT u.id, u.display_name FROM users u \
         JOIN user_school_memberships m ON m.user_id = u.id AND m.school_id = ?1",
    )?;
    let rows = stmt.query_map([school_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut names = std::collections::HashMap::new();
    for row in rows {
        let (id, display_name) = row?;
        names.insert(id, display_name);
    }
    Ok(names)
}

/// The manually-created schedule this school already runs — every live
/// `schedule_meetings` row with no `plan_id`. Plan-published rows are
/// excluded on purpose: those belong to the revision a new plan will
/// supersede, and counting them as fixed would make it impossible for a
/// plan to move a class the previous plan had placed.
fn list_fixed_meetings(conn: &Connection, school_id: &str) -> AppResult<Vec<FixedMeeting>> {
    let mut stmt = conn.prepare(
        "SELECT ta.teacher_user_id, ta.section_id, sm.room, sm.weekday, sm.starts_at, sm.ends_at \
         FROM schedule_meetings sm \
         JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id \
         WHERE sm.school_id = ?1 AND ta.school_id = ?1 AND sm.plan_id IS NULL \
         ORDER BY sm.weekday, sm.starts_at",
    )?;
    let rows = stmt.query_map([school_id], |row| {
        Ok(FixedMeeting {
            teacher_user_id: row.get(0)?,
            section_id: row.get(1)?,
            room: row.get(2)?,
            weekday: row.get(3)?,
            starts_at: row.get(4)?,
            ends_at: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn list_memberships(conn: &Connection, school_id: &str) -> AppResult<Vec<MembershipRef>> {
    let mut stmt = conn.prepare(
        "SELECT section_id, learner_id, starts_on, ends_on FROM section_memberships \
         WHERE school_id = ?1 ORDER BY section_id, learner_id",
    )?;
    let rows = stmt.query_map([school_id], |row| {
        Ok(MembershipRef {
            section_id: row.get(0)?,
            learner_id: row.get(1)?,
            starts_on: row.get(2)?,
            ends_on: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

impl ConstraintInputs {
    /// Every unordered pair of distinct sections that share at least one
    /// enrolled learner — the "shared learners where applicable"
    /// constraint, derived from enrollment rather than configured.
    pub fn shared_learner_section_pairs(&self) -> Vec<(String, String)> {
        let mut by_section: std::collections::HashMap<&str, std::collections::HashSet<&str>> =
            std::collections::HashMap::new();
        for membership in &self.memberships {
            by_section
                .entry(&membership.section_id)
                .or_default()
                .insert(&membership.learner_id);
        }
        let sections = by_section.keys().copied().collect::<Vec<_>>();
        let mut pairs = Vec::new();
        for (index, &a) in sections.iter().enumerate() {
            for &b in &sections[index + 1..] {
                if by_section[a].intersection(&by_section[b]).next().is_some() {
                    pairs.push((a.to_string(), b.to_string()));
                }
            }
        }
        pairs.sort();
        pairs
    }

    /// The weekdays this school is in session: the first `school_days`
    /// weekdays starting from Monday (1).
    pub fn school_weekdays(&self) -> Vec<i64> {
        (1..=self.settings.school_days.min(7)).collect()
    }
}

/// The Lock step of CTOS.md §M09's workflow. SHA-256 over a canonical,
/// deterministically-ordered rendering of *every* input that can change
/// what a valid timetable is — settings, assignments, availability,
/// rooms, requirements, the fixed schedule, and enrollment. If any of
/// them moves between generation and publication, the fingerprint no
/// longer matches and publication is refused as stale.
///
/// Ordering is canonicalized here, never left to row order, so two
/// identical input states always hash identically. There is no salt and
/// no secret: this is a staleness detector over a school's own data,
/// not an authentication token, and it must be reproducible on any
/// device for the same inputs.
pub fn fingerprint(inputs: &ConstraintInputs) -> String {
    let mut text = String::new();
    let settings = &inputs.settings;
    text.push_str(&format!(
        "settings:{}|{}|{}|{}|{}|{}|{}\n",
        settings.day_starts_at,
        settings.day_ends_at,
        settings.school_days,
        settings.period_minutes,
        settings.passing_minutes,
        settings.max_daily_teaching_minutes,
        settings.max_weekly_teaching_minutes
    ));

    let mut assignments = inputs.assignments.iter().collect::<Vec<_>>();
    assignments.sort_by(|a, b| a.id.cmp(&b.id));
    for assignment in &assignments {
        text.push_str(&format!(
            "assignment:{}|{}|{}|{}|{}\n",
            assignment.id,
            assignment.teacher_user_id,
            assignment.section_id,
            assignment.subject_id,
            assignment.required_weekly_minutes
        ));
    }

    let mut unavailability = inputs.unavailability.iter().collect::<Vec<_>>();
    unavailability.sort_by(|a, b| {
        a.teacher_user_id
            .cmp(&b.teacher_user_id)
            .then(a.weekday.cmp(&b.weekday))
            .then(a.starts_at.cmp(&b.starts_at))
            .then(a.ends_at.cmp(&b.ends_at))
    });
    for blocked in &unavailability {
        text.push_str(&format!(
            "unavailable:{}|{}|{}|{}\n",
            blocked.teacher_user_id, blocked.weekday, blocked.starts_at, blocked.ends_at
        ));
    }

    let mut rooms = inputs.rooms.iter().collect::<Vec<_>>();
    rooms.sort_by(|a, b| a.name.cmp(&b.name));
    for room in &rooms {
        text.push_str(&format!("room:{}|{}\n", room.name, room.is_lab as i64));
    }

    let mut requirements = inputs.requirements.iter().collect::<Vec<_>>();
    requirements.sort_by(|a, b| a.subject_id.cmp(&b.subject_id));
    for requirement in &requirements {
        text.push_str(&format!(
            "requirement:{}|{}\n",
            requirement.subject_id, requirement.required_weekly_minutes
        ));
    }

    let mut fixed = inputs.fixed_meetings.iter().collect::<Vec<_>>();
    fixed.sort_by(|a, b| {
        a.teacher_user_id
            .cmp(&b.teacher_user_id)
            .then(a.weekday.cmp(&b.weekday))
            .then(a.starts_at.cmp(&b.starts_at))
    });
    for meeting in &fixed {
        text.push_str(&format!(
            "fixed:{}|{}|{}|{}|{}|{}\n",
            meeting.teacher_user_id,
            meeting.section_id,
            meeting.weekday,
            meeting.starts_at,
            meeting.ends_at,
            meeting.room.as_deref().unwrap_or("-")
        ));
    }

    let mut memberships = inputs.memberships.iter().collect::<Vec<_>>();
    memberships.sort_by(|a, b| {
        a.section_id
            .cmp(&b.section_id)
            .then(a.learner_id.cmp(&b.learner_id))
    });
    for membership in &memberships {
        text.push_str(&format!(
            "membership:{}|{}|{}|{}\n",
            membership.section_id,
            membership.learner_id,
            membership.starts_on,
            membership.ends_on.as_deref().unwrap_or("-")
        ));
    }

    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    // `finalize()` yields the raw digest bytes; hex-encode them byte by
    // byte rather than relying on a `LowerHex` impl the digest type does
    // not provide. Lowercase hex, fixed 64 characters, no salt.
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db, repository::school, repository::section, repository::subject, repository::user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// Two teachers, two sections sharing one learner, one subject with a
    /// 300-minute weekly requirement, and a manually-created fixed
    /// meeting — the smallest school that exercises every constraint input.
    fn setup(conn: &Connection) -> String {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher_a = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        let teacher_b = user::create_user(conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(conn, &teacher_a.id, &s.id).unwrap();
        user::add_school_membership(conn, &teacher_b.id, &s.id).unwrap();
        let grade7 = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let grade8 = section::create(conn, &s.id, "2026-2027", "8", "Bonifacio").unwrap();
        let math = subject::create(conn, &s.id, "Mathematics").unwrap();

        // One learner enrolled in BOTH sections — the shared-learner case.
        let shared =
            crate::repository::learner::create(conn, &s.id, "Ana", "Dela Cruz", None, None)
                .unwrap();
        crate::repository::section_membership::enroll(
            conn,
            &s.id,
            &grade7.id,
            &shared.id,
            "2026-06-15",
        )
        .unwrap();
        crate::repository::section_membership::enroll(
            conn,
            &s.id,
            &grade8.id,
            &shared.id,
            "2026-06-15",
        )
        .unwrap();

        crate::repository::teaching_assignment::create(
            conn,
            &s.id,
            &teacher_a.id,
            &grade7.id,
            &math.id,
        )
        .unwrap();
        crate::repository::teaching_assignment::create(
            conn,
            &s.id,
            &teacher_b.id,
            &grade8.id,
            &math.id,
        )
        .unwrap();
        scheduling_inputs::set_requirement(conn, &s.id, &math.id, 300).unwrap();

        let assignment = crate::repository::teaching_assignment::list_all_in_school(conn, &s.id)
            .unwrap()
            .pop()
            .unwrap();
        crate::repository::schedule_meeting::create(
            conn,
            &s.id,
            &assignment.id,
            1,
            "07:30",
            "08:20",
            None,
        )
        .unwrap();

        s.id
    }

    #[test]
    fn load_reads_every_constraint_input() {
        let conn = open_test_db();
        let school_id = setup(&conn);

        let inputs = load(&conn, &school_id).unwrap();

        assert_eq!(inputs.assignments.len(), 2);
        assert_eq!(inputs.assignments[0].required_weekly_minutes, 300);
        // Assignments are ordered by school year, section name then
        // subject, so Bonifacio (Teacher B) precedes Mabini (Teacher A);
        // assert both are present rather than assume an order.
        assert!(inputs
            .assignments
            .iter()
            .any(|assignment| assignment.teacher_name == "Teacher A"));
        assert!(inputs
            .assignments
            .iter()
            .any(|assignment| assignment.teacher_name == "Teacher B"));
        assert_eq!(
            inputs.fixed_meetings.len(),
            1,
            "the manual meeting is fixed"
        );
        assert_eq!(inputs.memberships.len(), 2);
        assert_eq!(inputs.requirements.len(), 1);
    }

    #[test]
    fn shared_learner_pairs_are_derived_from_enrollment() {
        let conn = open_test_db();
        let school_id = setup(&conn);

        let inputs = load(&conn, &school_id).unwrap();
        let pairs = inputs.shared_learner_section_pairs();

        assert_eq!(pairs.len(), 1, "the two sections share exactly one learner");
        let (a, b) = &pairs[0];
        assert_ne!(a, b);
    }

    #[test]
    fn fingerprint_is_stable_and_change_sensitive() {
        let conn = open_test_db();
        let school_id = setup(&conn);

        let before = fingerprint(&load(&conn, &school_id).unwrap());
        let again = fingerprint(&load(&conn, &school_id).unwrap());
        assert_eq!(before, again, "identical inputs must hash identically");

        // Any input change — here, one blocked window — must move the hash.
        let teacher_id = load(&conn, &school_id).unwrap().assignments[0]
            .teacher_user_id
            .clone();
        scheduling_inputs::add_unavailability(
            &conn,
            &school_id,
            &teacher_id,
            5,
            "12:00",
            "13:00",
            None,
        )
        .unwrap();
        let after = fingerprint(&load(&conn, &school_id).unwrap());
        assert_ne!(before, after, "a changed input must change the fingerprint");
    }

    #[test]
    fn fingerprint_is_unaffected_by_row_order() {
        let conn = open_test_db();
        let school_id = setup(&conn);
        let mut inputs = load(&conn, &school_id).unwrap();

        let ordered = fingerprint(&inputs);
        inputs.assignments.reverse();
        inputs.memberships.reverse();
        let reversed = fingerprint(&inputs);

        assert_eq!(ordered, reversed);
    }

    #[test]
    fn school_weekdays_follow_the_school_days_setting() {
        let conn = open_test_db();
        let school_id = setup(&conn);

        let inputs = load(&conn, &school_id).unwrap();
        assert_eq!(inputs.school_weekdays(), vec![1, 2, 3, 4, 5]);

        scheduling_inputs::update(&conn, &school_id, "07:30", "17:00", 6, 50, 10, 360, 1800)
            .unwrap();
        let inputs = load(&conn, &school_id).unwrap();
        assert_eq!(inputs.school_weekdays(), vec![1, 2, 3, 4, 5, 6]);
    }
}
