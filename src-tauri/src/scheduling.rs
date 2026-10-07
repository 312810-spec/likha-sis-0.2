//! Bounded local constraint search. Configured limits are school inputs, not official policy.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub weekday: u8,
    pub starts_at: String,
    pub ends_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Teacher {
    pub id: String,
    pub daily_limit_minutes: u32,
    pub unavailable: Vec<Window>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub id: String,
    pub name: String,
    pub capacity: u32,
    pub kind: String,
    pub unavailable: Vec<Window>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub section_id: String,
    pub subject_id: String,
    pub eligible_teacher_ids: Vec<String>,
    pub room_ids: Vec<String>,
    pub learner_count: u32,
    pub meetings_per_week: u32,
    pub duration_minutes: u32,
    pub max_meetings_per_day: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingLock {
    pub course_id: String,
    pub meeting_index: u32,
    pub teacher_id: String,
    pub weekday: u8,
    pub starts_at: String,
    pub room_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulePlanInput {
    pub label: String,
    pub school_year: String,
    pub term_label: String,
    pub effective_from: String,
    pub effective_until: String,
    pub data_confirmed: bool,
    pub teachers: Vec<Teacher>,
    pub rooms: Vec<Room>,
    pub slots: Vec<Window>,
    pub courses: Vec<Course>,
    pub locks: Vec<MeetingLock>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleMeetingProposal {
    pub course_id: String,
    pub meeting_index: u32,
    pub teacher_id: String,
    pub weekday: u8,
    pub starts_at: String,
    pub ends_at: String,
    pub room_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationResult {
    pub status: String,
    pub meetings: Vec<ScheduleMeetingProposal>,
    pub issues: Vec<String>,
    pub explored_nodes: u64,
}
fn minute(s: &str) -> Option<u32> {
    if s.len() != 5 {
        return None;
    }
    let (h, m) = s.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    (h < 24 && m < 60 && format!("{h:02}:{m:02}") == s).then_some(h * 60 + m)
}
fn time(m: u32) -> String {
    format!("{:02}:{:02}", m / 60, m % 60)
}
pub fn valid_date(s: &str) -> bool {
    let parts: Vec<_> = s.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let (Ok(y), Ok(m), Ok(d)) = (
        parts[0].parse::<u32>(),
        parts[1].parse::<u32>(),
        parts[2].parse::<u32>(),
    ) else {
        return false;
    };
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    y > 0 && d > 0 && d <= days && format!("{y:04}-{m:02}-{d:02}") == s
}
fn window(w: &Window) -> bool {
    w.weekday < 7
        && minute(&w.starts_at)
            .zip(minute(&w.ends_at))
            .is_some_and(|(s, e)| s < e)
}
fn overlap(a: &str, b: &str, c: &str, d: &str) -> bool {
    minute(a)
        .zip(minute(b))
        .zip(minute(c).zip(minute(d)))
        .is_some_and(|((a, b), (c, d))| a < d && c < b)
}
fn unique<'a>(ids: impl Iterator<Item = &'a str>) -> bool {
    let mut set = HashSet::new();
    ids.into_iter()
        .all(|i| !i.trim().is_empty() && set.insert(i))
}
pub fn validate_input(p: &SchedulePlanInput) -> Vec<String> {
    let mut e = Vec::new();
    if p.label.trim().is_empty()
        || p.school_year.trim().is_empty()
        || p.term_label.trim().is_empty()
    {
        e.push("Name, school year and term are required".into());
    }
    if !valid_date(&p.effective_from)
        || !valid_date(&p.effective_until)
        || p.effective_from > p.effective_until
    {
        e.push("Check the effective dates".into());
    }
    if p.teachers.len() > 128
        || p.rooms.len() > 128
        || p.courses.len() > 128
        || p.slots.len() > 128
        || p.locks.len() > 512
        || p.courses
            .iter()
            .map(|c| u64::from(c.meetings_per_week))
            .sum::<u64>()
            > 512
    {
        e.push("Plan exceeds supported size".into());
    }
    if !unique(p.teachers.iter().map(|t| t.id.as_str()))
        || !unique(p.rooms.iter().map(|r| r.id.as_str()))
        || !unique(p.courses.iter().map(|c| c.id.as_str()))
    {
        e.push("IDs must be unique and nonempty".into());
    }
    if p.teachers.iter().any(|t| {
        t.daily_limit_minutes == 0
            || t.daily_limit_minutes > 1440
            || t.unavailable.iter().any(|w| !window(w))
    }) || p
        .rooms
        .iter()
        .any(|r| r.capacity == 0 || r.unavailable.iter().any(|w| !window(w)))
        || p.slots.iter().any(|w| !window(w))
    {
        e.push("Check time windows, room capacity and daily limits".into());
    }
    let mut pairs = HashSet::new();
    for c in &p.courses {
        if c.section_id.is_empty()
            || c.subject_id.is_empty()
            || !pairs.insert((&c.section_id, &c.subject_id))
            || c.meetings_per_week == 0
            || c.duration_minutes == 0
            || c.duration_minutes > 1440
            || c.max_meetings_per_day == 0
            || c.eligible_teacher_ids.is_empty()
            || c.room_ids.is_empty()
            || c.eligible_teacher_ids
                .iter()
                .any(|id| !p.teachers.iter().any(|t| &t.id == id))
            || c.room_ids
                .iter()
                .any(|id| !p.rooms.iter().any(|r| &r.id == id))
        {
            e.push(format!(
                "Check course {} and its eligible teachers/rooms",
                c.id
            ));
        }
    }
    let mut locks = HashSet::new();
    for l in &p.locks {
        if !locks.insert((&l.course_id, l.meeting_index))
            || !p
                .courses
                .iter()
                .any(|c| c.id == l.course_id && l.meeting_index < c.meetings_per_week)
            || l.weekday > 6
            || minute(&l.starts_at).is_none()
        {
            e.push("Check locked meetings".into());
        }
    }
    e
}
fn check(p: &SchedulePlanInput, ms: &[ScheduleMeetingProposal], complete: bool) -> Vec<String> {
    let mut e = validate_input(p);
    if !e.is_empty() {
        return e;
    }
    let mut seen = HashSet::new();
    let mut loads: HashMap<(&str, u8), u32> = HashMap::new();
    let mut counts: HashMap<(&str, u8), u32> = HashMap::new();
    let mut assigned: HashMap<&str, &str> = HashMap::new();
    for m in ms {
        let Some(c) = p.courses.iter().find(|c| c.id == m.course_id) else {
            e.push("Unknown course".into());
            continue;
        };
        let Some(t) = p.teachers.iter().find(|t| t.id == m.teacher_id) else {
            e.push("Unknown teacher".into());
            continue;
        };
        let Some(r) = p.rooms.iter().find(|r| r.id == m.room_id) else {
            e.push("Unknown room".into());
            continue;
        };
        if !seen.insert((m.course_id.as_str(), m.meeting_index))
            || m.meeting_index >= c.meetings_per_week
        {
            e.push("Duplicate or extra meeting".into());
        }
        let valid = minute(&m.starts_at)
            .zip(minute(&m.ends_at))
            .is_some_and(|(s, z)| z > s && z - s == c.duration_minutes);
        if !valid
            || !p.slots.iter().any(|w| {
                w.weekday == m.weekday && w.starts_at <= m.starts_at && w.ends_at >= m.ends_at
            })
        {
            e.push("Meeting is outside an allowed teaching window".into());
        }
        if !c.eligible_teacher_ids.contains(&m.teacher_id)
            || !c.room_ids.contains(&m.room_id)
            || r.capacity < c.learner_count
        {
            e.push("Teacher eligibility or room capacity does not fit".into());
        }
        if t.unavailable.iter().chain(r.unavailable.iter()).any(|w| {
            w.weekday == m.weekday && overlap(&m.starts_at, &m.ends_at, &w.starts_at, &w.ends_at)
        }) {
            e.push("Teacher or room is unavailable".into());
        }
        if assigned
            .insert(&m.course_id, &m.teacher_id)
            .is_some_and(|old| old != m.teacher_id)
        {
            e.push("A course must keep the same teacher".into());
        }
        *loads.entry((&m.teacher_id, m.weekday)).or_default() += c.duration_minutes;
        *counts.entry((&m.course_id, m.weekday)).or_default() += 1;
        if loads[&(m.teacher_id.as_str(), m.weekday)] > t.daily_limit_minutes
            || counts[&(m.course_id.as_str(), m.weekday)] > c.max_meetings_per_day
        {
            e.push("Daily teaching or subject meeting limit exceeded".into());
        }
        if p.locks.iter().any(|l| {
            l.course_id == m.course_id
                && l.meeting_index == m.meeting_index
                && (l.teacher_id != m.teacher_id
                    || l.weekday != m.weekday
                    || l.starts_at != m.starts_at
                    || l.room_id != m.room_id)
        }) {
            e.push("A locked meeting moved".into());
        }
    }
    for (i, a) in ms.iter().enumerate() {
        for b in &ms[i + 1..] {
            if a.weekday == b.weekday && overlap(&a.starts_at, &a.ends_at, &b.starts_at, &b.ends_at)
            {
                let ca = p.courses.iter().find(|c| c.id == a.course_id);
                let cb = p.courses.iter().find(|c| c.id == b.course_id);
                if a.teacher_id == b.teacher_id
                    || a.room_id == b.room_id
                    || ca
                        .zip(cb)
                        .is_some_and(|(a, b)| a.section_id == b.section_id)
                {
                    e.push("Teacher, section or room overlap".into());
                }
            }
        }
    }
    if complete {
        for c in &p.courses {
            for i in 0..c.meetings_per_week {
                if !seen.contains(&(c.id.as_str(), i)) {
                    e.push(format!("Missing meeting for {}", c.id));
                }
            }
        }
    }
    e.sort();
    e.dedup();
    e
}
pub fn validate_schedule(p: &SchedulePlanInput, ms: &[ScheduleMeetingProposal]) -> Vec<String> {
    check(p, ms, true)
}
fn search(
    p: &SchedulePlanInput,
    candidates: &[Vec<ScheduleMeetingProposal>],
    ms: &mut Vec<ScheduleMeetingProposal>,
    nodes: &mut u64,
    max: u64,
) -> bool {
    if ms.len() == candidates.len() {
        return true;
    }
    for m in &candidates[ms.len()] {
        if *nodes >= max {
            return false;
        }
        *nodes += 1;
        ms.push(m.clone());
        if check(p, ms, false).is_empty() && search(p, candidates, ms, nodes, max) {
            return true;
        }
        ms.pop();
    }
    false
}
pub fn generate(p: &SchedulePlanInput, max_nodes: u64) -> GenerationResult {
    let issues = validate_input(p);
    if !issues.is_empty() {
        return GenerationResult {
            status: "infeasible".into(),
            meetings: vec![],
            issues,
            explored_nodes: 0,
        };
    }
    let mut candidates = Vec::new();
    let mut count = 0;
    for c in &p.courses {
        for i in 0..c.meetings_per_week {
            let mut choices = Vec::new();
            for w in &p.slots {
                let s = minute(&w.starts_at).unwrap();
                let end = minute(&w.ends_at).unwrap();
                if end - s < c.duration_minutes {
                    continue;
                }
                for start in s..=end - c.duration_minutes {
                    for t in &c.eligible_teacher_ids {
                        for r in &c.room_ids {
                            count += 1;
                            if count > 200_000 {
                                return GenerationResult{status:"unknown".into(),meetings:vec![],issues:vec!["Candidate limit reached; narrow teaching windows or add locks".into()],explored_nodes:0};
                            }
                            let m = ScheduleMeetingProposal {
                                course_id: c.id.clone(),
                                meeting_index: i,
                                teacher_id: t.clone(),
                                weekday: w.weekday,
                                starts_at: time(start),
                                ends_at: time(start + c.duration_minutes),
                                room_id: r.clone(),
                            };
                            if check(p, std::slice::from_ref(&m), false).is_empty() {
                                choices.push(m);
                            }
                        }
                    }
                }
            }
            candidates.push(choices);
        }
    }
    candidates.sort_by_key(Vec::len);
    let mut ms = vec![];
    let mut nodes = 0;
    let max = max_nodes.min(2_000_000);
    let found = search(p, &candidates, &mut ms, &mut nodes, max);
    GenerationResult {
        status: if found {
            "feasible"
        } else if nodes >= max {
            "unknown"
        } else {
            "infeasible"
        }
        .into(),
        meetings: if found { ms } else { vec![] },
        issues: if found {
            vec![]
        } else {
            vec![if nodes >= max {
                "Search limit reached; a solution may still exist"
            } else {
                "No schedule satisfies the supplied constraints"
            }
            .into()]
        },
        explored_nodes: nodes,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> SchedulePlanInput {
        serde_json::from_str(r#"{"label":"Draft","schoolYear":"2026-2027","termLabel":"Term 1","effectiveFrom":"2026-06-01","effectiveUntil":"2026-08-31","dataConfirmed":false,"teachers":[{"id":"t","dailyLimitMinutes":60,"unavailable":[]}],"rooms":[{"id":"r","name":"Room","kind":"general","capacity":40,"unavailable":[]}],"slots":[{"weekday":0,"startsAt":"08:00","endsAt":"09:00"}],"courses":[{"id":"c","sectionId":"s","subjectId":"u","eligibleTeacherIds":["t"],"roomIds":["r"],"learnerCount":30,"meetingsPerWeek":1,"durationMinutes":60,"maxMeetingsPerDay":1}],"locks":[]}"#).unwrap()
    }
    #[test]
    fn feasible_independently_validated() {
        let p = input();
        let r = generate(&p, 100);
        assert_eq!(r.status, "feasible");
        assert!(validate_schedule(&p, &r.meetings).is_empty());
    }
    #[test]
    fn capacity_impossible() {
        let mut p = input();
        p.rooms[0].capacity = 1;
        assert_eq!(generate(&p, 100).status, "infeasible");
    }
    #[test]
    fn bounded_is_unknown() {
        assert_eq!(generate(&input(), 0).status, "unknown");
    }
    #[test]
    fn tamper_and_missing_rejected() {
        let p = input();
        assert!(!validate_schedule(&p, &[]).is_empty());
        let mut m = generate(&p, 100).meetings;
        m[0].ends_at = "08:30".into();
        assert!(!validate_schedule(&p, &m).is_empty());
    }
    #[test]
    fn impossible_lock() {
        let mut p = input();
        p.locks.push(MeetingLock {
            course_id: "c".into(),
            meeting_index: 0,
            teacher_id: "t".into(),
            weekday: 1,
            starts_at: "08:00".into(),
            room_id: "r".into(),
        });
        assert_eq!(generate(&p, 100).status, "infeasible");
    }
    #[test]
    fn invalid_dates() {
        let mut p = input();
        p.effective_from = "2026-02-30".into();
        assert!(!validate_input(&p).is_empty());
    }
}
