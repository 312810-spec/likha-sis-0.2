use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repository::schedule_meeting::parse_minutes;

/// The independent checker. CTOS.md §M09's acceptance clause names it
/// first for a reason: publication must be validated by something that
/// is *not* the generator. So this module shares no code with
/// `scheduling::generate` and no data with it either — it reads the
/// plan's placements and the constraint inputs fresh from the database
/// at validation time, after any human repair, and re-derives every
/// conflict over the whole set at once. The generator builds a timetable
/// incrementally, trusting its own running occupancy bookkeeping; the
/// checker never trusts any of that.
///
/// Every violation names the constraint it violated and the people and
/// times involved, because an unexplained rejection is not repairable —
/// see `docs/research/deped-mandaue-teacher-load-2026.md`'s fifth M09
/// product constraint.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Violation {
    /// Two placements of one teacher overlap in time on the same weekday.
    TeacherConflict {
        teacher_name: String,
        weekday: i64,
        starts_at: String,
        ends_at: String,
        conflicting_starts_at: String,
        conflicting_ends_at: String,
    },
    /// One section is expected in two places at once.
    SectionConflict {
        section_name: String,
        weekday: i64,
        starts_at: String,
        ends_at: String,
        conflicting_starts_at: String,
        conflicting_ends_at: String,
    },
    /// One room hosts two classes at once.
    RoomConflict {
        room: String,
        weekday: i64,
        starts_at: String,
        ends_at: String,
        conflicting_starts_at: String,
        conflicting_ends_at: String,
    },
    /// A placement lands inside a window the teacher is not available for.
    TeacherUnavailable {
        teacher_name: String,
        weekday: i64,
        starts_at: String,
        ends_at: String,
        unavailable_starts_at: String,
        unavailable_ends_at: String,
    },
    /// A teacher's classroom teaching on one day exceeds the school's
    /// daily limit. Reported per day, never averaged across the week — a
    /// weekly average can hide a daily overload, which DO 005 s.2024's
    /// own framing does not permit.
    TeacherDailyOverload {
        teacher_name: String,
        weekday: i64,
        minutes: i64,
        limit: i64,
    },
    /// A teacher's classroom teaching for the week exceeds the school's
    /// weekly limit.
    TeacherWeeklyOverload {
        teacher_name: String,
        minutes: i64,
        limit: i64,
    },
    /// Two consecutive meetings of one teacher are closer together than
    /// the school's passing buffer allows.
    MissingPassingBuffer {
        teacher_name: String,
        weekday: i64,
        gap_minutes: i64,
        required: i64,
    },
    /// Two sections that share an enrolled learner are scheduled at the
    /// same time, so that learner would have to be in two classes at once.
    SharedLearners {
        section_name: String,
        conflicting_section_name: String,
        weekday: i64,
        starts_at: String,
        ends_at: String,
    },
    /// An assignment's scheduled minutes fall short of its subject's
    /// weekly requirement.
    RequirementShortfall {
        subject_name: String,
        section_name: String,
        required_minutes: i64,
        scheduled_minutes: i64,
    },
    /// A placement names a room the school has never registered — a room
    /// is either in the registry or it is not a schedulable resource.
    UnknownRoom {
        room: String,
        weekday: i64,
        starts_at: String,
    },
    /// A placement collides with a meeting the school created by hand,
    /// which publication does not replace and cannot double-book.
    LegacyConflict {
        weekday: i64,
        starts_at: String,
        ends_at: String,
        conflicting_starts_at: String,
        conflicting_ends_at: String,
    },
}

/// A placement as the checker reads it: the columns every violation
/// message needs, joined once rather than re-joined per check.
struct PlacementRow {
    teacher_user_id: String,
    teacher_name: String,
    section_id: String,
    section_name: String,
    subject_id: String,
    subject_name: String,
    weekday: i64,
    starts_at: String,
    ends_at: String,
    room: Option<String>,
}

const PLACEMENT_SELECT: &str = "SELECT ta.teacher_user_id, \
     COALESCE(u.display_name, 'Unknown teacher'), \
     ta.section_id, sec.name, ta.subject_id, sub.name, \
     spm.weekday, spm.starts_at, spm.ends_at, spm.room \
     FROM schedule_plan_meetings spm \
     JOIN teaching_assignments ta ON ta.id = spm.teaching_assignment_id AND ta.school_id = spm.school_id \
     JOIN sections sec ON sec.id = ta.section_id AND sec.school_id = spm.school_id \
     JOIN subjects sub ON sub.id = ta.subject_id AND sub.school_id = spm.school_id \
     LEFT JOIN users u ON u.id = ta.teacher_user_id";

/// Runs every check against the plan's placements as they stand right
/// now. Returns the violations in a stable order so two runs over the
/// same plan report the same list — a repair screen must not shuffle
/// its findings between renders.
pub fn check(conn: &Connection, school_id: &str, plan_id: &str) -> AppResult<Vec<Violation>> {
    let placements = read_placements(conn, school_id, plan_id)?;
    let mut violations = Vec::new();

    check_teacher_conflicts(&placements, &mut violations);
    check_section_conflicts(&placements, &mut violations);
    check_room_conflicts(&placements, &mut violations);
    check_passing_buffers(conn, school_id, &placements, &mut violations)?;
    check_teacher_unavailability(conn, school_id, &placements, &mut violations)?;
    check_daily_and_weekly_load(conn, school_id, &placements, &mut violations)?;
    check_shared_learners(conn, school_id, &placements, &mut violations)?;
    check_requirement_shortfalls(conn, school_id, &placements, &mut violations)?;
    check_unknown_rooms(conn, school_id, &placements, &mut violations)?;
    check_legacy_conflicts(conn, school_id, &placements, &mut violations)?;

    violations.sort_by(|a, b| {
        kind_order(a)
            .cmp(&kind_order(b))
            .then(weekday_of(a).cmp(&weekday_of(b)))
            .then(starts_at_of(a).cmp(&starts_at_of(b)))
    });
    Ok(violations)
}

fn read_placements(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
) -> AppResult<Vec<PlacementRow>> {
    let mut stmt = conn.prepare(&format!(
        "{PLACEMENT_SELECT} \
         WHERE spm.school_id = ?1 AND spm.plan_id = ?2 \
         ORDER BY spm.weekday, spm.starts_at"
    ))?;
    let rows = stmt.query_map((school_id, plan_id), |row| {
        Ok(PlacementRow {
            teacher_user_id: row.get(0)?,
            teacher_name: row.get(1)?,
            section_id: row.get(2)?,
            section_name: row.get(3)?,
            subject_id: row.get(4)?,
            subject_name: row.get(5)?,
            weekday: row.get(6)?,
            starts_at: row.get(7)?,
            ends_at: row.get(8)?,
            room: row.get(9)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Overlapping pairs of one teacher's placements, re-derived over the
/// whole set — deliberately not the generator's incremental interval
/// list, which is exactly what this exists to second-guess.
fn check_teacher_conflicts(placements: &[PlacementRow], violations: &mut Vec<Violation>) {
    for (i, earlier) in placements.iter().enumerate() {
        for later in &placements[i + 1..] {
            if earlier.teacher_user_id != later.teacher_user_id
                || earlier.weekday != later.weekday
                || !overlaps(
                    &earlier.starts_at,
                    &earlier.ends_at,
                    &later.starts_at,
                    &later.ends_at,
                )
            {
                continue;
            }
            violations.push(Violation::TeacherConflict {
                teacher_name: earlier.teacher_name.clone(),
                weekday: earlier.weekday,
                starts_at: earlier.starts_at.clone(),
                ends_at: earlier.ends_at.clone(),
                conflicting_starts_at: later.starts_at.clone(),
                conflicting_ends_at: later.ends_at.clone(),
            });
        }
    }
}

fn check_section_conflicts(placements: &[PlacementRow], violations: &mut Vec<Violation>) {
    for (i, earlier) in placements.iter().enumerate() {
        for later in &placements[i + 1..] {
            if earlier.section_id != later.section_id
                || earlier.weekday != later.weekday
                || !overlaps(
                    &earlier.starts_at,
                    &earlier.ends_at,
                    &later.starts_at,
                    &later.ends_at,
                )
            {
                continue;
            }
            violations.push(Violation::SectionConflict {
                section_name: earlier.section_name.clone(),
                weekday: earlier.weekday,
                starts_at: earlier.starts_at.clone(),
                ends_at: earlier.ends_at.clone(),
                conflicting_starts_at: later.starts_at.clone(),
                conflicting_ends_at: later.ends_at.clone(),
            });
        }
    }
}

fn check_room_conflicts(placements: &[PlacementRow], violations: &mut Vec<Violation>) {
    for (i, earlier) in placements.iter().enumerate() {
        for later in &placements[i + 1..] {
            if earlier.room.is_none()
                || earlier.room != later.room
                || earlier.weekday != later.weekday
                || !overlaps(
                    &earlier.starts_at,
                    &earlier.ends_at,
                    &later.starts_at,
                    &later.ends_at,
                )
            {
                continue;
            }
            violations.push(Violation::RoomConflict {
                room: earlier.room.clone().expect("checked non-empty above"),
                weekday: earlier.weekday,
                starts_at: earlier.starts_at.clone(),
                ends_at: earlier.ends_at.clone(),
                conflicting_starts_at: later.starts_at.clone(),
                conflicting_ends_at: later.ends_at.clone(),
            });
        }
    }
}

/// The passing buffer between a teacher's own consecutive meetings. Only
/// *adjacent* meetings are compared — the buffer is travel time between
/// two consecutive classes, not a minimum gap across the whole day.
fn check_passing_buffers(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let required: i64 = conn.query_row(
        "SELECT passing_minutes FROM schedule_settings WHERE school_id = ?1",
        [school_id],
        |row| row.get(0),
    )?;
    if required == 0 {
        return Ok(());
    }

    let mut by_teacher: std::collections::HashMap<&str, Vec<&PlacementRow>> =
        std::collections::HashMap::new();
    for placement in placements {
        by_teacher
            .entry(&placement.teacher_user_id)
            .or_default()
            .push(placement);
    }
    for meetings in by_teacher.values_mut() {
        meetings.sort_by(|a, b| {
            a.weekday
                .cmp(&b.weekday)
                .then(a.starts_at.cmp(&b.starts_at))
        });
        for pair in meetings.windows(2) {
            let [earlier, later] = pair else {
                continue;
            };
            if earlier.weekday != later.weekday {
                continue;
            }
            let gap = gap_minutes(&earlier.ends_at, &later.starts_at);
            if gap >= 0 && gap < required {
                violations.push(Violation::MissingPassingBuffer {
                    teacher_name: earlier.teacher_name.clone(),
                    weekday: earlier.weekday,
                    gap_minutes: gap,
                    required,
                });
            }
        }
    }
    Ok(())
}

fn check_teacher_unavailability(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT teacher_user_id, weekday, starts_at, ends_at \
         FROM teacher_unavailability WHERE school_id = ?1",
    )?;
    let blocked = stmt.query_map([school_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    let mut blocked = blocked.collect::<Result<Vec<_>, _>>()?;
    blocked.sort();

    for placement in placements {
        for (teacher_user_id, weekday, starts_at, ends_at) in &blocked {
            if &placement.teacher_user_id != teacher_user_id
                || placement.weekday != *weekday
                || !overlaps(&placement.starts_at, &placement.ends_at, starts_at, ends_at)
            {
                continue;
            }
            violations.push(Violation::TeacherUnavailable {
                teacher_name: placement.teacher_name.clone(),
                weekday: placement.weekday,
                starts_at: placement.starts_at.clone(),
                ends_at: placement.ends_at.clone(),
                unavailable_starts_at: starts_at.clone(),
                unavailable_ends_at: ends_at.clone(),
            });
        }
    }
    Ok(())
}

/// Daily and weekly load, each against its own limit. Both are computed
/// here from the placements themselves rather than trusting the
/// generator's running totals.
fn check_daily_and_weekly_load(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let (daily_limit, weekly_limit): (i64, i64) = conn.query_row(
        "SELECT max_daily_teaching_minutes, max_weekly_teaching_minutes \
         FROM schedule_settings WHERE school_id = ?1",
        [school_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let mut daily: std::collections::HashMap<(&str, i64), i64> = std::collections::HashMap::new();
    let mut weekly: std::collections::HashMap<&str, i64> = std::collections::HashMap::new();
    let mut names: std::collections::HashMap<&str, &str> = std::collections::HashMap::new();
    for placement in placements {
        let Some(minutes) = duration_minutes(&placement.starts_at, &placement.ends_at) else {
            continue;
        };
        *daily
            .entry((&placement.teacher_user_id, placement.weekday))
            .or_default() += minutes;
        *weekly.entry(&placement.teacher_user_id).or_default() += minutes;
        names.insert(&placement.teacher_user_id, &placement.teacher_name);
    }

    let mut daily_overloads = daily.into_iter().collect::<Vec<_>>();
    daily_overloads.sort_by_key(|(key, _)| *key);
    for ((teacher_user_id, weekday), minutes) in daily_overloads {
        if minutes > daily_limit {
            violations.push(Violation::TeacherDailyOverload {
                teacher_name: names
                    .get(teacher_user_id)
                    .copied()
                    .unwrap_or("Unknown")
                    .to_string(),
                weekday,
                minutes,
                limit: daily_limit,
            });
        }
    }

    let mut weekly_overloads = weekly.into_iter().collect::<Vec<_>>();
    weekly_overloads.sort_by_key(|(teacher, _)| *teacher);
    for (teacher_user_id, minutes) in weekly_overloads {
        if minutes > weekly_limit {
            violations.push(Violation::TeacherWeeklyOverload {
                teacher_name: names
                    .get(teacher_user_id)
                    .copied()
                    .unwrap_or("Unknown")
                    .to_string(),
                minutes,
                limit: weekly_limit,
            });
        }
    }
    Ok(())
}

/// Sections sharing an enrolled learner, scheduled concurrently. The
/// shared-learner relation is read from `section_memberships` at check
/// time — never from a cached pairing the generator computed earlier.
fn check_shared_learners(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT m1.section_id, m2.section_id \
         FROM section_memberships m1 \
         JOIN section_memberships m2 \
           ON m2.learner_id = m1.learner_id AND m2.section_id > m1.section_id \
         WHERE m1.school_id = ?1 AND m2.school_id = ?1 \
         ORDER BY m1.section_id, m2.section_id",
    )?;
    let pairs = stmt.query_map([school_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut pairs = pairs.collect::<Result<Vec<_>, _>>()?;
    pairs.sort();

    for (section_a, section_b) in &pairs {
        for (i, earlier) in placements.iter().enumerate() {
            for later in &placements[i + 1..] {
                let pair = (earlier.section_id.as_str(), later.section_id.as_str());
                if pair != (section_a.as_str(), section_b.as_str())
                    || earlier.weekday != later.weekday
                    || !overlaps(
                        &earlier.starts_at,
                        &earlier.ends_at,
                        &later.starts_at,
                        &later.ends_at,
                    )
                {
                    continue;
                }
                violations.push(Violation::SharedLearners {
                    section_name: earlier.section_name.clone(),
                    conflicting_section_name: later.section_name.clone(),
                    weekday: earlier.weekday,
                    starts_at: earlier.starts_at.clone(),
                    ends_at: earlier.ends_at.clone(),
                });
            }
        }
    }
    Ok(())
}

/// Scheduled minutes per assignment against that subject's weekly
/// requirement. A section taking Mathematics on a 300-minute requirement
/// must end the week with at least 300 minutes of Mathematics scheduled.
fn check_requirement_shortfalls(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT subject_id, required_weekly_minutes FROM subject_schedule_requirements \
         WHERE school_id = ?1",
    )?;
    let requirements = stmt.query_map([school_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let requirements =
        requirements.collect::<Result<std::collections::HashMap<String, i64>, _>>()?;

    let mut scheduled: std::collections::HashMap<&str, i64> = std::collections::HashMap::new();
    for placement in placements {
        let Some(minutes) = duration_minutes(&placement.starts_at, &placement.ends_at) else {
            continue;
        };
        *scheduled.entry(&placement.subject_id).or_default() += minutes;
    }

    let mut shortfalls = Vec::new();
    for placement in placements {
        let Some(required) = requirements.get(&placement.subject_id).copied() else {
            continue;
        };
        let scheduled_minutes = scheduled
            .get(placement.subject_id.as_str())
            .copied()
            .unwrap_or(0);
        if scheduled_minutes >= required {
            continue;
        }
        shortfalls.push(Violation::RequirementShortfall {
            subject_name: placement.subject_name.clone(),
            section_name: placement.section_name.clone(),
            required_minutes: required,
            scheduled_minutes,
        });
    }
    shortfalls.sort_by_key(shortfall_key);
    shortfalls.dedup();
    violations.extend(shortfalls);
    Ok(())
}

/// The sort key for shortfall violations. `Violation` is an enum, so its
/// variant fields are not reachable as `.subject_name` on the enum value
/// — pattern-match, and fall back to a stable empty key for any other
/// kind (which cannot appear in this vector, but the match must total).
fn shortfall_key(violation: &Violation) -> (String, String) {
    match violation {
        Violation::RequirementShortfall {
            subject_name,
            section_name,
            ..
        } => (subject_name.clone(), section_name.clone()),
        _ => (String::new(), String::new()),
    }
}

fn check_unknown_rooms(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let mut stmt = conn.prepare("SELECT name FROM schedule_rooms WHERE school_id = ?1")?;
    let rooms = stmt.query_map([school_id], |row| row.get::<_, String>(0))?;
    let rooms = rooms.collect::<Result<std::collections::HashSet<String>, _>>()?;

    for placement in placements {
        let Some(room) = &placement.room else {
            continue;
        };
        if !rooms.contains(room) {
            violations.push(Violation::UnknownRoom {
                room: room.clone(),
                weekday: placement.weekday,
                starts_at: placement.starts_at.clone(),
            });
        }
    }
    Ok(())
}

/// Collisions with the school's manually-created schedule — rows of
/// `schedule_meetings` with no `plan_id`, which publication never
/// replaces. Meetings of the currently published plan are excluded, for
/// the same reason the generator excludes them: publication deletes
/// those rows and writes this plan in their place.
fn check_legacy_conflicts(
    conn: &Connection,
    school_id: &str,
    placements: &[PlacementRow],
    violations: &mut Vec<Violation>,
) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT weekday, starts_at, ends_at FROM schedule_meetings \
         WHERE school_id = ?1 AND plan_id IS NULL",
    )?;
    let legacy = stmt.query_map([school_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let legacy = legacy.collect::<Result<Vec<_>, _>>()?;

    for placement in placements {
        for (weekday, starts_at, ends_at) in &legacy {
            if placement.weekday != *weekday
                || !overlaps(&placement.starts_at, &placement.ends_at, starts_at, ends_at)
            {
                continue;
            }
            violations.push(Violation::LegacyConflict {
                weekday: placement.weekday,
                starts_at: placement.starts_at.clone(),
                ends_at: placement.ends_at.clone(),
                conflicting_starts_at: starts_at.clone(),
                conflicting_ends_at: ends_at.clone(),
            });
        }
    }
    Ok(())
}

/// True when `[start_a, end_a)` and `[start_b, end_b)` share a moment.
/// The zero-padded fixed-width "HH:MM" text compares correctly
/// lexicographically — the same trick `schedule_meeting`'s own conflict
/// queries already rely on.
fn overlaps(start_a: &str, end_a: &str, start_b: &str, end_b: &str) -> bool {
    start_a < end_b && start_b < end_a
}

/// Minutes the meeting occupies, or `None` if a bound is not a valid time.
fn duration_minutes(starts_at: &str, ends_at: &str) -> Option<i64> {
    let start = parse_minutes(starts_at)?;
    let end = parse_minutes(ends_at)?;
    (end > start).then_some((end - start) as i64)
}

/// Minutes between the end of one meeting and the start of the next;
/// negative when they overlap.
fn gap_minutes(earlier_end: &str, later_start: &str) -> i64 {
    let (Some(end), Some(start)) = (parse_minutes(earlier_end), parse_minutes(later_start)) else {
        return i64::MAX;
    };
    start as i64 - end as i64
}

fn kind_order(violation: &Violation) -> u8 {
    match violation {
        Violation::TeacherConflict { .. } => 0,
        Violation::SectionConflict { .. } => 1,
        Violation::RoomConflict { .. } => 2,
        Violation::TeacherUnavailable { .. } => 3,
        Violation::TeacherDailyOverload { .. } => 4,
        Violation::TeacherWeeklyOverload { .. } => 5,
        Violation::MissingPassingBuffer { .. } => 6,
        Violation::SharedLearners { .. } => 7,
        Violation::RequirementShortfall { .. } => 8,
        Violation::UnknownRoom { .. } => 9,
        Violation::LegacyConflict { .. } => 10,
    }
}

fn weekday_of(violation: &Violation) -> i64 {
    match violation {
        Violation::TeacherConflict { weekday, .. }
        | Violation::SectionConflict { weekday, .. }
        | Violation::RoomConflict { weekday, .. }
        | Violation::TeacherUnavailable { weekday, .. }
        | Violation::TeacherDailyOverload { weekday, .. }
        | Violation::MissingPassingBuffer { weekday, .. }
        | Violation::SharedLearners { weekday, .. }
        | Violation::UnknownRoom { weekday, .. }
        | Violation::LegacyConflict { weekday, .. } => *weekday,
        Violation::TeacherWeeklyOverload { .. } | Violation::RequirementShortfall { .. } => -1,
    }
}

fn starts_at_of(violation: &Violation) -> String {
    match violation {
        Violation::TeacherConflict { starts_at, .. }
        | Violation::SectionConflict { starts_at, .. }
        | Violation::RoomConflict { starts_at, .. }
        | Violation::TeacherUnavailable { starts_at, .. }
        | Violation::SharedLearners { starts_at, .. }
        | Violation::UnknownRoom { starts_at, .. }
        | Violation::LegacyConflict { starts_at, .. } => starts_at.clone(),
        Violation::TeacherDailyOverload { .. }
        | Violation::TeacherWeeklyOverload { .. }
        | Violation::MissingPassingBuffer { .. }
        | Violation::RequirementShortfall { .. } => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::schedule_plan::{self, PublishOutcome};
    use crate::scheduling::generate::Placement;
    use crate::{
        db, repository::school, repository::section, repository::subject, repository::user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// One school, one teacher, one section, one subject, one assignment.
    fn setup(conn: &Connection) -> (String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = crate::repository::teaching_assignment::create(
            conn,
            &s.id,
            &teacher.id,
            &sec.id,
            &sub.id,
        )
        .unwrap()
        .unwrap();
        (s.id, teacher.id, assignment.id)
    }

    /// A second assignment of the same teacher, so a plan can hold two
    /// meetings that compete for one person.
    fn second_assignment(conn: &Connection, school_id: &str, teacher_id: &str) -> String {
        let sec = section::create(conn, school_id, "2026-2027", "8", "Bonifacio").unwrap();
        let sub = subject::create(conn, school_id, "Science").unwrap();
        crate::repository::teaching_assignment::create(
            conn, school_id, teacher_id, &sec.id, &sub.id,
        )
        .unwrap()
        .unwrap()
        .id
    }

    /// Writes placements directly into a draft plan, bypassing the
    /// generator entirely — the point of these tests is that the checker
    /// must catch a plan the generator would never have produced.
    fn draft_with_placements(
        conn: &Connection,
        school_id: &str,
        placements: &[Placement],
    ) -> String {
        let plan = schedule_plan::create_plan(
            conn,
            school_id,
            &crate::scheduling::constraints::fingerprint(
                &crate::scheduling::constraints::load(conn, school_id).unwrap(),
            ),
            None,
        )
        .unwrap();
        for placement in placements {
            schedule_plan::add_placement(
                conn,
                school_id,
                &plan.id,
                &placement.teaching_assignment_id,
                placement.weekday,
                &placement.starts_at,
                &placement.ends_at,
                placement.room.as_deref(),
            )
            .unwrap();
        }
        plan.id
    }

    #[test]
    fn a_clean_plan_has_no_violations() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: None,
            }],
        );

        assert!(check(&conn, &school_id, &plan_id).unwrap().is_empty());
    }

    #[test]
    fn two_overlapping_placements_of_one_teacher_are_flagged() {
        let conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        // A second assignment of the same teacher to a different
        // section, so only the teacher constraint can fire: the same
        // assignment twice would trip the section constraint as well.
        let other_assignment = second_assignment(&conn, &school_id, &teacher_id);
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[
                Placement {
                    teaching_assignment_id: assignment_id,
                    weekday: 1,
                    starts_at: "08:00".to_string(),
                    ends_at: "08:50".to_string(),
                    room: None,
                },
                Placement {
                    teaching_assignment_id: other_assignment,
                    weekday: 1,
                    starts_at: "08:30".to_string(),
                    ends_at: "09:20".to_string(),
                    room: None,
                },
            ],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert_eq!(violations.len(), 1, "exactly one teacher conflict, not two");
        assert!(matches!(violations[0], Violation::TeacherConflict { .. }));
    }

    #[test]
    fn one_section_scheduled_twice_at_once_is_flagged() {
        let conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();
        let sec = section::list_by_school(&conn, &school_id)
            .unwrap()
            .into_iter()
            .find(|sec| sec.name == "Mabini")
            .unwrap();
        // A different subject: `teaching_assignments` allows one teacher
        // per (section, subject), so reusing Mathematics would be a
        // schema violation, not a scheduling conflict.
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let other_assignment = crate::repository::teaching_assignment::create(
            &conn,
            &school_id,
            &other_teacher.id,
            &sec.id,
            &sub.id,
        )
        .unwrap()
        .unwrap();
        let _ = teacher_id;

        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[
                Placement {
                    teaching_assignment_id: other_assignment.id.clone(),
                    weekday: 1,
                    starts_at: "08:00".to_string(),
                    ends_at: "08:50".to_string(),
                    room: None,
                },
                Placement {
                    teaching_assignment_id: other_assignment.id,
                    weekday: 1,
                    starts_at: "08:30".to_string(),
                    ends_at: "09:20".to_string(),
                    room: None,
                },
            ],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations
            .iter()
            .any(|violation| matches!(violation, Violation::SectionConflict { .. })));
    }

    #[test]
    fn one_room_double_booked_is_flagged() {
        let conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let other_assignment = second_assignment(&conn, &school_id, &teacher_id);

        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[
                Placement {
                    teaching_assignment_id: other_assignment.clone(),
                    weekday: 1,
                    starts_at: "08:00".to_string(),
                    ends_at: "08:50".to_string(),
                    room: Some("Room 101".to_string()),
                },
                Placement {
                    teaching_assignment_id: other_assignment,
                    weekday: 1,
                    starts_at: "08:30".to_string(),
                    ends_at: "09:20".to_string(),
                    room: Some("Room 101".to_string()),
                },
            ],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations
            .iter()
            .any(|violation| matches!(violation, Violation::RoomConflict { room, .. } if room == "Room 101")));
    }

    #[test]
    fn adjacent_meetings_without_the_passing_buffer_are_flagged() {
        let conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        let other_assignment = second_assignment(&conn, &school_id, &teacher_id);

        // Back to back with no gap: the default passing buffer is 10.
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[
                Placement {
                    teaching_assignment_id: assignment_id,
                    weekday: 1,
                    starts_at: "08:00".to_string(),
                    ends_at: "08:50".to_string(),
                    room: None,
                },
                Placement {
                    teaching_assignment_id: other_assignment,
                    weekday: 1,
                    starts_at: "08:50".to_string(),
                    ends_at: "09:40".to_string(),
                    room: None,
                },
            ],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations.iter().any(|violation| matches!(
            violation,
            Violation::MissingPassingBuffer { gap_minutes, required, .. }
                if *gap_minutes == 0 && *required == 10
        )));
    }

    #[test]
    fn a_placement_inside_a_blocked_window_is_flagged() {
        let conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        crate::repository::scheduling_inputs::add_unavailability(
            &conn,
            &school_id,
            &teacher_id,
            1,
            "12:00",
            "13:00",
            None,
        )
        .unwrap();
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "12:10".to_string(),
                ends_at: "13:00".to_string(),
                room: None,
            }],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations
            .iter()
            .any(|violation| matches!(violation, Violation::TeacherUnavailable { .. })));
    }

    #[test]
    fn a_daily_overload_is_reported_per_day_not_as_a_weekly_average() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        // 360-minute daily cap, so nine 50-minute periods on one day
        // (450 minutes) overloads Monday while the week as a whole is
        // far below the 1800-minute weekly cap.
        let mut placements = Vec::new();
        for period in 0..9u32 {
            let start = 7 * 60 + 30 + period as usize * 60;
            placements.push(Placement {
                teaching_assignment_id: assignment_id.clone(),
                weekday: 1,
                starts_at: format!("{:02}:{:02}", start / 60, start % 60),
                ends_at: format!("{:02}:{:02}", (start + 50) / 60, (start + 50) % 60),
                room: None,
            });
        }
        let plan_id = draft_with_placements(&conn, &school_id, &placements);

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations.iter().any(|violation| matches!(
            violation,
            Violation::TeacherDailyOverload { minutes, limit, .. } if *minutes == 450 && *limit == 360
        )));
        assert!(!violations
            .iter()
            .any(|violation| matches!(violation, Violation::TeacherWeeklyOverload { .. })));
    }

    #[test]
    fn a_weekly_overload_is_flagged() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        // Raise the daily cap out of the way and lower the weekly cap to
        // 1000, so the daily check cannot fire and only the weekly one
        // can: four 60-minute meetings a day is 240 minutes, far below
        // the 1440 daily cap, but 1200 for the week is over 1000.
        crate::repository::scheduling_inputs::update(
            &conn, &school_id, "07:30", "17:00", 5, 50, 10, 1440, 1000,
        )
        .unwrap();
        let mut placements = Vec::new();
        for weekday in 1..=5u32 {
            for (start, end) in [
                (8 * 60, 9 * 60),
                (9 * 60 + 10, 10 * 60 + 10),
                (10 * 60 + 20, 11 * 60 + 20),
                (13 * 60, 14 * 60),
            ] {
                placements.push(Placement {
                    teaching_assignment_id: assignment_id.clone(),
                    weekday: weekday as i64,
                    starts_at: format!("{:02}:{:02}", start / 60, start % 60),
                    ends_at: format!("{:02}:{:02}", end / 60, end % 60),
                    room: None,
                });
            }
        }
        let plan_id = draft_with_placements(&conn, &school_id, &placements);

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations.iter().any(|violation| matches!(
            violation,
            Violation::TeacherWeeklyOverload { minutes, limit, .. } if *minutes == 1200 && *limit == 1000
        )));
        assert!(!violations
            .iter()
            .any(|violation| matches!(violation, Violation::TeacherDailyOverload { .. })));
    }

    #[test]
    fn a_requirement_shortfall_is_flagged() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let math_id = crate::repository::subject::list_by_school(&conn, &school_id)
            .unwrap()
            .pop()
            .unwrap()
            .id;
        crate::repository::scheduling_inputs::set_requirement(&conn, &school_id, &math_id, 300)
            .unwrap();
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: None,
            }],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations.iter().any(|violation| matches!(
            violation,
            Violation::RequirementShortfall {
                required_minutes: 300,
                scheduled_minutes: 50,
                ..
            }
        )));
    }

    #[test]
    fn a_room_the_school_never_registered_is_flagged() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: Some("Imaginary Room".to_string()),
            }],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations
            .iter()
            .any(|violation| matches!(violation, Violation::UnknownRoom { room, .. } if room == "Imaginary Room")));
    }

    #[test]
    fn a_collision_with_a_manually_created_meeting_is_flagged() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        crate::repository::schedule_meeting::create(
            &conn,
            &school_id,
            &assignment_id,
            1,
            "08:00",
            "08:50",
            None,
        )
        .unwrap();
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "08:30".to_string(),
                ends_at: "09:20".to_string(),
                room: None,
            }],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations
            .iter()
            .any(|violation| matches!(violation, Violation::LegacyConflict { .. })));
    }

    #[test]
    fn shared_learners_scheduled_concurrently_are_flagged() {
        let conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();
        let grade7 = section::list_by_school(&conn, &school_id)
            .unwrap()
            .into_iter()
            .find(|sec| sec.name == "Mabini")
            .unwrap();
        let grade8 = section::create(&conn, &school_id, "2026-2027", "8", "Bonifacio").unwrap();
        let sub = subject::list_by_school(&conn, &school_id)
            .unwrap()
            .pop()
            .unwrap();
        let other_assignment = crate::repository::teaching_assignment::create(
            &conn,
            &school_id,
            &other_teacher.id,
            &grade8.id,
            &sub.id,
        )
        .unwrap()
        .unwrap();

        // One learner enrolled in both sections.
        let shared =
            crate::repository::learner::create(&conn, &school_id, "Ana", "Dela Cruz", None, None)
                .unwrap();
        crate::repository::section_membership::enroll(
            &conn,
            &school_id,
            &grade7.id,
            &shared.id,
            "2026-06-15",
        )
        .unwrap();
        crate::repository::section_membership::enroll(
            &conn,
            &school_id,
            &grade8.id,
            &shared.id,
            "2026-06-15",
        )
        .unwrap();
        let assignment =
            crate::repository::teaching_assignment::list_all_in_school(&conn, &school_id)
                .unwrap()
                .into_iter()
                .find(|detail| detail.teacher_user_id == teacher_id)
                .unwrap();

        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[
                Placement {
                    teaching_assignment_id: assignment.id,
                    weekday: 1,
                    starts_at: "08:00".to_string(),
                    ends_at: "08:50".to_string(),
                    room: None,
                },
                Placement {
                    teaching_assignment_id: other_assignment.id,
                    weekday: 1,
                    starts_at: "08:30".to_string(),
                    ends_at: "09:20".to_string(),
                    room: None,
                },
            ],
        );

        let violations = check(&conn, &school_id, &plan_id).unwrap();
        assert!(violations
            .iter()
            .any(|violation| matches!(violation, Violation::SharedLearners { .. })));
    }

    #[test]
    fn check_reports_the_same_violations_in_the_same_order() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[
                Placement {
                    teaching_assignment_id: assignment_id.clone(),
                    weekday: 1,
                    starts_at: "08:00".to_string(),
                    ends_at: "08:50".to_string(),
                    room: None,
                },
                Placement {
                    teaching_assignment_id: assignment_id,
                    weekday: 1,
                    starts_at: "08:30".to_string(),
                    ends_at: "09:20".to_string(),
                    room: None,
                },
            ],
        );

        let first = check(&conn, &school_id, &plan_id).unwrap();
        let second = check(&conn, &school_id, &plan_id).unwrap();

        assert_eq!(first, second);
    }

    /// The checker and the publisher agree on what a clean plan is: a
    /// hand-built clean plan must publish without surfacing violations.
    #[test]
    fn a_hand_built_clean_plan_publishes() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        let plan_id = draft_with_placements(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: None,
            }],
        );

        let outcome = schedule_plan::publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap();

        assert!(
            matches!(outcome, PublishOutcome::Published { .. }),
            "got {outcome:?}"
        );
    }
}
