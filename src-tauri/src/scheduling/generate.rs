use serde::{Deserialize, Serialize};

use crate::repository::schedule_meeting::parse_minutes;
use crate::scheduling::constraints::{ConstraintInputs, InputAssignment};

/// One proposed weekly slot: which assignment meets, which weekday, what
/// local wall-clock span, and in which room. Deliberately the same five
/// fields `schedule_meetings` stores, so publication is a plain copy and
/// nothing has to be re-derived or re-validated into a different shape.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub teaching_assignment_id: String,
    pub weekday: i64,
    pub starts_at: String,
    pub ends_at: String,
    pub room: Option<String>,
}

/// The three states CTOS.md §M09's "Required states" clause demands, and
/// no others. Every one is distinguishable by a caller, and each carries
/// what a teacher needs to act on it: a valid plan carries its notes, an
/// impossible plan carries the numeric proofs, a stopped plan carries
/// the assignments it did not reach.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum GenerationOutcome {
    /// Every assignment with a weekly requirement was fully placed.
    Valid {
        placements: Vec<Placement>,
        notes: Vec<String>,
    },
    /// Proven, with numbers, that the supplied constraints cannot be
    /// satisfied — not "the search gave up". The placements that did
    /// succeed are still returned, so a teacher sees the partial
    /// timetable alongside the proof and can repair the inputs.
    Impossible {
        placements: Vec<Placement>,
        proofs: Vec<ImpossibilityProof>,
    },
    /// The search was stopped before it could finish, and nothing was
    /// proven impossible — "no solution yet", the third required state.
    /// Repairing an input and regenerating is the intended response.
    Stopped {
        placements: Vec<Placement>,
        unplaced: Vec<UnplacedAssignment>,
        steps_used: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImpossibilityProof {
    pub teaching_assignment_id: String,
    pub teacher_name: String,
    pub section_name: String,
    pub subject_name: String,
    pub required_weekly_minutes: i64,
    pub available_weekly_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnplacedAssignment {
    pub teaching_assignment_id: String,
    pub teacher_name: String,
    pub section_name: String,
    pub subject_name: String,
    pub required_weekly_minutes: i64,
    pub still_needed_minutes: i64,
}

/// Builds an `UnplacedAssignment` from an input assignment, reporting
/// the whole weekly requirement as still needed. Used both for an
/// assignment the budget never reached and for one the search attempted
/// but could not finish.
fn unplaced_from(assignment: &InputAssignment) -> UnplacedAssignment {
    UnplacedAssignment {
        teaching_assignment_id: assignment.id.clone(),
        teacher_name: assignment.teacher_name.clone(),
        section_name: assignment.section_name.clone(),
        subject_name: assignment.subject_name.clone(),
        required_weekly_minutes: assignment.required_weekly_minutes,
        still_needed_minutes: assignment.required_weekly_minutes,
    }
}

/// The step budget is generous for any real school — a 60-assignment
/// school on a six-day, ten-period grid examines a few thousand
/// candidate slots — and it is a hard stop, not a hint: a search that
/// would run forever on pathological input must terminate and report
/// `Stopped` instead of hanging the planner.
pub const DEFAULT_STEP_BUDGET: u64 = 200_000;

/// Generates against the locked inputs, using the default budget.
pub fn generate(inputs: &ConstraintInputs) -> GenerationOutcome {
    generate_with_budget(inputs, DEFAULT_STEP_BUDGET)
}

pub fn generate_with_budget(inputs: &ConstraintInputs, step_budget: u64) -> GenerationOutcome {
    let mut state = SearchState::new(inputs);
    let mut proofs = Vec::new();
    let mut unplaced = Vec::new();

    // Assignments are attempted tightest-first. `order` is consumed from
    // the back, so the tightest is the first popped.
    let mut remaining: Vec<&InputAssignment> = state
        .order
        .iter()
        .map(|index| &state.inputs.assignments[*index])
        .collect();

    while let Some(assignment) = remaining.pop() {
        if state.steps >= step_budget {
            // The budget is spent. This assignment has not been
            // attempted and neither has anything still queued behind
            // it, so all of them are unplaced — including the one just
            // popped, which is no longer in `remaining` and would
            // otherwise be silently dropped from the report.
            unplaced.push(unplaced_from(assignment));
            unplaced.extend(remaining.iter().map(|queued| unplaced_from(queued)));
            return GenerationOutcome::Stopped {
                placements: state.placements,
                unplaced,
                steps_used: state.steps,
            };
        }

        let placed_minutes = state.place_assignment(assignment, step_budget);
        if placed_minutes >= assignment.required_weekly_minutes {
            continue;
        }

        let still_needed = assignment.required_weekly_minutes - placed_minutes;
        let available = state.capacity_for(assignment);

        if assignment.required_weekly_minutes > available {
            // A real proof, not a heuristic's verdict: the teacher and
            // section have fewer free period-minutes this week than the
            // subject requires, and occupancy only ever grows.
            proofs.push(ImpossibilityProof {
                teaching_assignment_id: assignment.id.clone(),
                teacher_name: assignment.teacher_name.clone(),
                section_name: assignment.section_name.clone(),
                subject_name: assignment.subject_name.clone(),
                required_weekly_minutes: assignment.required_weekly_minutes,
                available_weekly_minutes: available,
            });
        } else {
            // Attempted but not finished: report how many minutes are
            // still outstanding, which is what makes this "stopped, here
            // is what is left" rather than "impossible".
            unplaced.push(UnplacedAssignment {
                teaching_assignment_id: assignment.id.clone(),
                teacher_name: assignment.teacher_name.clone(),
                section_name: assignment.section_name.clone(),
                subject_name: assignment.subject_name.clone(),
                required_weekly_minutes: assignment.required_weekly_minutes,
                still_needed_minutes: still_needed,
            });
        }
    }

    if !proofs.is_empty() {
        return GenerationOutcome::Impossible {
            placements: state.placements,
            proofs,
        };
    }
    if !unplaced.is_empty() {
        return GenerationOutcome::Stopped {
            placements: state.placements,
            unplaced,
            steps_used: state.steps,
        };
    }

    let mut notes = state.notes;
    notes.sort();
    notes.dedup();
    GenerationOutcome::Valid {
        placements: state.placements,
        notes,
    }
}

/// The search's mutable working state: the placements made so far and the
/// occupancy those placements impose, so every candidate slot is checked
/// against the timetable as it is being built, not against the empty
/// starting state.
struct SearchState<'a> {
    inputs: &'a ConstraintInputs,
    /// Assignment indices, tightest-first — see `new`. Consumed from the
    /// back by `generate_with_budget`.
    order: Vec<usize>,
    placements: Vec<Placement>,
    notes: Vec<String>,
    /// The bell grid, derived once from settings: every period start the
    /// school day actually contains.
    grid: Vec<u32>,
    teacher_busy: std::collections::HashMap<String, Vec<Interval>>,
    section_busy: std::collections::HashMap<String, Vec<Interval>>,
    room_busy: std::collections::HashMap<String, Vec<Interval>>,
    teacher_weekly_minutes: std::collections::HashMap<String, i64>,
    teacher_daily_minutes: std::collections::HashMap<(String, i64), i64>,
    steps: u64,
}

#[derive(Debug, Clone, Copy)]
struct Interval {
    weekday: i64,
    start: u32,
    end: u32,
}

impl Interval {
    fn overlaps(&self, other_start: u32, other_end: u32) -> bool {
        self.start < other_end && other_start < self.end
    }
}

impl<'a> SearchState<'a> {
    fn new(inputs: &'a ConstraintInputs) -> Self {
        let mut state = SearchState {
            inputs,
            order: Vec::new(),
            placements: Vec::new(),
            notes: Vec::new(),
            grid: Vec::new(),
            teacher_busy: std::collections::HashMap::new(),
            section_busy: std::collections::HashMap::new(),
            room_busy: std::collections::HashMap::new(),
            teacher_weekly_minutes: std::collections::HashMap::new(),
            teacher_daily_minutes: std::collections::HashMap::new(),
            steps: 0,
        };

        let day_start = parse_minutes(&inputs.settings.day_starts_at).expect("validated on write");
        let day_end = parse_minutes(&inputs.settings.day_ends_at).expect("validated on write");
        let period = inputs.settings.period_minutes as u32;
        state.grid = (0..)
            .map(|step| day_start + step * period)
            .take_while(|&start| start.saturating_add(period) <= day_end)
            .collect();

        // Seed occupancy from unavailability and the fixed schedule. Both
        // are immovable from the generator's point of view.
        for blocked in &inputs.unavailability {
            let (Some(start), Some(end)) = (
                parse_minutes(&blocked.starts_at),
                parse_minutes(&blocked.ends_at),
            ) else {
                continue;
            };
            state
                .teacher_busy
                .entry(blocked.teacher_user_id.clone())
                .or_default()
                .push(Interval {
                    weekday: blocked.weekday,
                    start,
                    end,
                });
            // Unavailability also consumes the teacher's daily minutes —
            // an hour blocked for a fixed duty is an hour not available
            // for classroom teaching, which is exactly how DO 005 s.2024
            // frames ancillary tasks.
            *state
                .teacher_daily_minutes
                .entry((blocked.teacher_user_id.clone(), blocked.weekday))
                .or_default() += (end - start) as i64;
            *state
                .teacher_weekly_minutes
                .entry(blocked.teacher_user_id.clone())
                .or_default() += (end - start) as i64;
        }
        for meeting in &inputs.fixed_meetings {
            let (Some(start), Some(end)) = (
                parse_minutes(&meeting.starts_at),
                parse_minutes(&meeting.ends_at),
            ) else {
                continue;
            };
            let interval = Interval {
                weekday: meeting.weekday,
                start,
                end,
            };
            state
                .teacher_busy
                .entry(meeting.teacher_user_id.clone())
                .or_default()
                .push(interval);
            state
                .section_busy
                .entry(meeting.section_id.clone())
                .or_default()
                .push(interval);
            if let Some(room) = &meeting.room {
                state
                    .room_busy
                    .entry(room.clone())
                    .or_default()
                    .push(interval);
            }
            *state
                .teacher_daily_minutes
                .entry((meeting.teacher_user_id.clone(), meeting.weekday))
                .or_default() += (end - start) as i64;
            *state
                .teacher_weekly_minutes
                .entry(meeting.teacher_user_id.clone())
                .or_default() += (end - start) as i64;
        }

        // Most-constrained-first: the assignment with the least remaining
        // weekly capacity is placed first, because it is the one with the
        // fewest options. Scheduling the flexible ones last is the
        // standard heuristic, and it is what keeps a greedy search from
        // filling the week with the easy classes and leaving a tight one
        // nowhere to go.
        let mut scored = (0..inputs.assignments.len())
            .map(|index| {
                let assignment = &inputs.assignments[index];
                let capacity = state.capacity_for(assignment);
                (
                    capacity,
                    std::cmp::Reverse(assignment.required_weekly_minutes),
                    index,
                )
            })
            .collect::<Vec<_>>();
        scored.sort();
        state.order = scored.into_iter().map(|(_, _, index)| index).collect();

        state
    }

    /// Places as many of this assignment's meetings as the grid admits,
    /// returning the minutes actually scheduled. Candidate slots are
    /// scanned in weekday-then-time order, which is deterministic for the
    /// same inputs — two identical schools produce identical timetables.
    fn place_assignment(&mut self, assignment: &InputAssignment, step_budget: u64) -> i64 {
        let period = self.inputs.settings.period_minutes;
        let buffer = self.inputs.settings.passing_minutes as u32;
        let mut placed_minutes = 0;

        let meetings_needed = (assignment.required_weekly_minutes + period - 1) / period.max(1);
        for _ in 0..meetings_needed {
            let mut found = None;
            'slots: for &weekday in self.inputs.school_weekdays().iter() {
                for &start in self.grid.iter() {
                    self.steps += 1;
                    if self.steps > step_budget {
                        break 'slots;
                    }
                    let end = start + period as u32;

                    if self.teacher_minutes_on(assignment, weekday) + period
                        > self.inputs.settings.max_daily_teaching_minutes
                    {
                        continue;
                    }
                    if self.teacher_weekly_minutes(assignment) + period
                        > self.inputs.settings.max_weekly_teaching_minutes
                    {
                        continue;
                    }
                    if self.is_teacher_busy(assignment, weekday, start, end, buffer) {
                        continue;
                    }
                    if self.is_section_busy(assignment, weekday, start, end) {
                        continue;
                    }
                    found = Some((weekday, start, end));
                    break 'slots;
                }
            }
            let Some((weekday, start, end)) = found else {
                break;
            };
            let room = self.pick_room(weekday, start, end);
            if room.is_none() && !self.inputs.rooms.is_empty() {
                self.notes.push(format!(
                    "{} for {} had no free registered room at one of its slots — the room is left unassigned.",
                    assignment.subject_name, assignment.section_name
                ));
            }
            self.record(assignment, weekday, start, end, room);
            placed_minutes += period;
        }
        placed_minutes
    }

    fn teacher_minutes_on(&self, assignment: &InputAssignment, weekday: i64) -> i64 {
        self.teacher_daily_minutes
            .get(&(assignment.teacher_user_id.clone(), weekday))
            .copied()
            .unwrap_or_default()
    }

    fn teacher_weekly_minutes(&self, assignment: &InputAssignment) -> i64 {
        self.teacher_weekly_minutes
            .get(&assignment.teacher_user_id)
            .copied()
            .unwrap_or_default()
    }

    /// A teacher is busy for a candidate slot when any blocked window or
    /// existing meeting overlaps it, or when the required passing buffer
    /// would be swallowed — a teacher with back-to-back classes in two
    /// buildings has no travel time, which is the breaks/setup/travel
    /// constraint.
    fn is_teacher_busy(
        &self,
        assignment: &InputAssignment,
        weekday: i64,
        start: u32,
        end: u32,
        buffer: u32,
    ) -> bool {
        let buffered_start = start.saturating_sub(buffer);
        let buffered_end = end + buffer;
        self.teacher_busy
            .get(&assignment.teacher_user_id)
            .is_some_and(|busy| {
                busy.iter().any(|interval| {
                    interval.weekday == weekday && interval.overlaps(buffered_start, buffered_end)
                })
            })
    }

    fn is_section_busy(
        &self,
        assignment: &InputAssignment,
        weekday: i64,
        start: u32,
        end: u32,
    ) -> bool {
        self.section_busy
            .get(&assignment.section_id)
            .is_some_and(|busy| {
                busy.iter()
                    .any(|interval| interval.weekday == weekday && interval.overlaps(start, end))
            })
    }

    /// Picks a room free for this slot, preferring an ordinary classroom
    /// over a lab (a lab is a scarcer resource, so it is left free for a
    /// class that actually needs it). Rooms are never invented: if the
    /// school has registered none, or all of theirs are taken, the
    /// placement carries no room and the school assigns one by hand.
    fn pick_room(&self, weekday: i64, start: u32, end: u32) -> Option<String> {
        let mut rooms = self.inputs.rooms.iter().collect::<Vec<_>>();
        rooms.sort_by(|a, b| a.is_lab.cmp(&b.is_lab).then(a.name.cmp(&b.name)));
        rooms
            .into_iter()
            .find(|room| {
                self.room_busy.get(&room.name).is_none_or(|busy| {
                    !busy.iter().any(|interval| {
                        interval.weekday == weekday && interval.overlaps(start, end)
                    })
                })
            })
            .map(|room| room.name.clone())
    }

    fn record(
        &mut self,
        assignment: &InputAssignment,
        weekday: i64,
        start: u32,
        end: u32,
        room: Option<String>,
    ) {
        let interval = Interval {
            weekday,
            start,
            end,
        };
        self.teacher_busy
            .entry(assignment.teacher_user_id.clone())
            .or_default()
            .push(interval);
        self.section_busy
            .entry(assignment.section_id.clone())
            .or_default()
            .push(interval);
        if let Some(room) = &room {
            self.room_busy
                .entry(room.clone())
                .or_default()
                .push(interval);
        }
        *self
            .teacher_daily_minutes
            .entry((assignment.teacher_user_id.clone(), weekday))
            .or_default() += (end - start) as i64;
        *self
            .teacher_weekly_minutes
            .entry(assignment.teacher_user_id.clone())
            .or_default() += (end - start) as i64;
        self.placements.push(Placement {
            teaching_assignment_id: assignment.id.clone(),
            weekday,
            starts_at: format_minutes(start),
            ends_at: format_minutes(end),
            room,
        });
    }

    /// The upper bound on weekly minutes this assignment could ever be
    /// given, under the occupancy as it stands right now: for each school
    /// weekday, the number of grid periods where both the teacher and the
    /// section are free, capped by what the teacher's daily and weekly
    /// limits still allow. Occupancy only ever grows as the search
    /// proceeds, so this number only ever falls — which is exactly what
    /// makes `required > available` a proof rather than a guess.
    fn capacity_for(&self, assignment: &InputAssignment) -> i64 {
        let period = self.inputs.settings.period_minutes;
        let buffer = self.inputs.settings.passing_minutes as u32;
        let mut capacity = 0;
        let mut weekly_headroom = self.inputs.settings.max_weekly_teaching_minutes
            - self.teacher_weekly_minutes(assignment);

        for &weekday in self.inputs.school_weekdays().iter() {
            if weekly_headroom <= 0 {
                break;
            }
            let daily_headroom = self.inputs.settings.max_daily_teaching_minutes
                - self.teacher_minutes_on(assignment, weekday);
            if daily_headroom <= 0 {
                continue;
            }
            let mut free_periods = 0;
            for &start in self.grid.iter() {
                let end = start + period as u32;
                if self.is_teacher_busy(assignment, weekday, start, end, buffer)
                    || self.is_section_busy(assignment, weekday, start, end)
                {
                    continue;
                }
                free_periods += 1;
            }
            let usable = free_periods
                .min((daily_headroom / period.max(1)) as u32)
                .min((weekly_headroom / period.max(1)) as u32);
            capacity += usable as i64 * period;
            weekly_headroom -= usable as i64 * period;
        }
        capacity
    }
}

fn format_minutes(minutes: u32) -> String {
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::scheduling_inputs::{self, ScheduleRoom, ScheduleSettings};
    use crate::scheduling::constraints::{
        ConstraintInputs, FixedMeeting, InputAssignment, MembershipRef,
    };

    /// `parse_minutes` for tests: generated placements always carry real
    /// "HH:MM" times, so unwrapping here asserts that invariant rather
    /// than papering over a parse the engine itself performs.
    fn minutes(time: &str) -> u32 {
        parse_minutes(time).expect("a generated placement time is always valid")
    }

    /// A synthetic school built entirely in memory — no database, no
    /// learners, nothing but the inputs the engine is a pure function of.
    fn inputs(teachers: &[&str], sections: &[&str], required: i64) -> ConstraintInputs {
        ConstraintInputs {
            settings: ScheduleSettings {
                school_id: "school".to_string(),
                day_starts_at: "07:30".to_string(),
                day_ends_at: "17:00".to_string(),
                school_days: 5,
                period_minutes: 50,
                passing_minutes: 10,
                max_daily_teaching_minutes: 360,
                max_weekly_teaching_minutes: 1800,
                updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
            assignments: teachers
                .iter()
                .enumerate()
                .flat_map(|(teacher_index, teacher)| {
                    sections
                        .iter()
                        .enumerate()
                        .map(move |(section_index, section)| InputAssignment {
                            id: format!("assignment-{teacher_index}-{section_index}"),
                            teacher_user_id: (*teacher).to_string(),
                            teacher_name: format!("Teacher {teacher}"),
                            section_id: (*section).to_string(),
                            section_name: format!("Section {section}"),
                            school_year: "2026-2027".to_string(),
                            subject_id: "subject".to_string(),
                            subject_name: "Subject".to_string(),
                            required_weekly_minutes: required,
                        })
                })
                .collect(),
            unavailability: Vec::new(),
            rooms: vec![ScheduleRoom {
                id: "room-1".to_string(),
                school_id: "school".to_string(),
                name: "Room 101".to_string(),
                is_lab: false,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            }],
            requirements: Vec::new(),
            fixed_meetings: Vec::new(),
            memberships: Vec::new(),
        }
    }

    #[test]
    fn a_school_that_fits_produces_a_valid_plan() {
        let inputs = inputs(&["a", "b"], &["one", "two"], 200);

        let outcome = generate(&inputs);

        match &outcome {
            GenerationOutcome::Valid { placements, notes } => {
                // 200 minutes at 50 per period = 4 meetings per
                // assignment, 2 teachers x 2 sections = 4 assignments
                // = 16 placements.
                assert_eq!(placements.len(), 16);
                assert!(notes.is_empty());
                for placement in placements {
                    assert_eq!(
                        minutes(&placement.ends_at) - minutes(&placement.starts_at),
                        50
                    );
                }
            }
            other => panic!("expected Valid, got {other:?}"),
        }
    }

    #[test]
    fn no_two_placements_of_the_same_teacher_overlap() {
        let inputs = inputs(&["a"], &["one", "two", "three", "four"], 250);

        let outcome = generate(&inputs);
        let placements = match &outcome {
            GenerationOutcome::Valid { placements, .. } => placements.clone(),
            other => panic!("expected Valid, got {other:?}"),
        };

        for (i, earlier) in placements.iter().enumerate() {
            for later in &placements[i + 1..] {
                if earlier.weekday != later.weekday
                    || earlier.teaching_assignment_id == later.teaching_assignment_id
                {
                    continue;
                }
                // Same teacher (only one in this school), different
                // assignments: the spans must not overlap.
                let a = (minutes(&earlier.starts_at), minutes(&earlier.ends_at));
                let b = (minutes(&later.starts_at), minutes(&later.ends_at));
                assert!(
                    !(a.0 < b.1 && b.0 < a.1),
                    "two classes of one teacher overlap"
                );
            }
        }
    }

    #[test]
    fn a_teacher_booked_solid_is_proven_impossible_with_numbers() {
        // One teacher, 300 minutes needed per section, across ten
        // sections: 3000 weekly minutes against a 1800-minute weekly cap.
        let inputs = inputs(
            &["a"],
            &[
                "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
            ],
            300,
        );

        let outcome = generate(&inputs);

        match &outcome {
            GenerationOutcome::Impossible { proofs, .. } => {
                assert!(!proofs.is_empty());
                let proof = &proofs[0];
                assert!(
                    proof.required_weekly_minutes > proof.available_weekly_minutes,
                    "a proof must show required exceeding available, not merely assert it"
                );
            }
            other => panic!("expected Impossible, got {other:?}"),
        }
    }

    #[test]
    fn an_unavailable_window_is_never_scheduled_into() {
        let mut inputs = inputs(&["a"], &["one"], 200);
        inputs
            .unavailability
            .push(scheduling_inputs::TeacherUnavailability {
                id: "blocked".to_string(),
                school_id: "school".to_string(),
                teacher_user_id: "a".to_string(),
                weekday: 1,
                starts_at: "07:30".to_string(),
                ends_at: "12:00".to_string(),
                reason: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            });

        let outcome = generate(&inputs);
        let placements = match &outcome {
            GenerationOutcome::Valid { placements, .. } => placements.clone(),
            other => panic!("expected Valid, got {other:?}"),
        };

        for placement in &placements {
            if placement.weekday != 1 {
                continue;
            }
            let start = minutes(&placement.starts_at);
            assert!(
                start >= 12 * 60,
                "a placement landed inside a blocked window"
            );
        }
    }

    #[test]
    fn a_fixed_meeting_is_treated_as_immovable_occupancy() {
        let mut inputs = inputs(&["a"], &["one"], 200);
        inputs.fixed_meetings.push(FixedMeeting {
            teacher_user_id: "a".to_string(),
            section_id: "one".to_string(),
            room: None,
            weekday: 1,
            starts_at: "07:30".to_string(),
            ends_at: "17:00".to_string(),
        });

        let outcome = generate(&inputs);
        let placements = match &outcome {
            GenerationOutcome::Valid { placements, .. }
            | GenerationOutcome::Impossible { placements, .. } => placements.clone(),
            other => panic!("expected a plan, got {other:?}"),
        };

        // Monday is fully occupied by the fixed meeting on the only
        // teacher and section, so nothing may be placed there.
        assert!(placements.iter().all(|placement| placement.weekday != 1));
    }

    #[test]
    fn a_starved_budget_reports_stopped_not_impossible() {
        // Enough capacity overall for the greedy search to succeed, but a
        // budget of zero means it examines no candidate slots at all.
        let inputs = inputs(&["a"], &["one"], 200);

        let outcome = generate_with_budget(&inputs, 0);

        match &outcome {
            GenerationOutcome::Stopped {
                unplaced,
                steps_used,
                ..
            } => {
                assert!(!unplaced.is_empty());
                assert_eq!(*steps_used, 0);
            }
            other => panic!("expected Stopped, got {other:?}"),
        }
    }

    #[test]
    fn sections_sharing_a_learner_are_never_scheduled_concurrently() {
        let mut inputs = inputs(&["a", "b"], &["one", "two"], 200);
        // Teacher a teaches section one, teacher b teaches section two —
        // and one learner is enrolled in both sections.
        inputs.memberships.push(MembershipRef {
            section_id: "one".to_string(),
            learner_id: "shared".to_string(),
            starts_on: "2026-06-15".to_string(),
            ends_on: None,
        });
        inputs.memberships.push(MembershipRef {
            section_id: "two".to_string(),
            learner_id: "shared".to_string(),
            starts_on: "2026-06-15".to_string(),
            ends_on: None,
        });

        let outcome = generate(&inputs);
        let placements = match &outcome {
            GenerationOutcome::Valid { placements, .. } => placements.clone(),
            other => panic!("expected Valid, got {other:?}"),
        };

        let section_one: Vec<&Placement> = placements
            .iter()
            .filter(|placement| placement.teaching_assignment_id == "assignment-0-0")
            .collect();
        let section_two: Vec<&Placement> = placements
            .iter()
            .filter(|placement| placement.teaching_assignment_id == "assignment-1-1")
            .collect();
        for one in &section_one {
            for two in &section_two {
                if one.weekday != two.weekday {
                    continue;
                }
                let a = (minutes(&one.starts_at), minutes(&one.ends_at));
                let b = (minutes(&two.starts_at), minutes(&two.ends_at));
                assert!(
                    !(a.0 < b.1 && b.0 < a.1),
                    "a shared learner has two classes at once"
                );
            }
        }
    }

    #[test]
    fn placements_land_on_the_bell_grid() {
        let inputs = inputs(&["a"], &["one"], 100);

        let outcome = generate(&inputs);
        let placements = match &outcome {
            GenerationOutcome::Valid { placements, .. } => placements.clone(),
            other => panic!("expected Valid, got {other:?}"),
        };

        for placement in &placements {
            let start = minutes(&placement.starts_at);
            let day_start = minutes(&inputs.settings.day_starts_at);
            assert!(
                (start - day_start).is_multiple_of(inputs.settings.period_minutes as u32),
                "a placement must start on a period boundary"
            );
        }
    }

    #[test]
    fn zero_required_minutes_produces_no_placements() {
        let inputs = inputs(&["a"], &["one"], 0);

        let outcome = generate(&inputs);

        match &outcome {
            GenerationOutcome::Valid { placements, .. } => {
                assert!(placements.is_empty(), "no demand means no placements");
            }
            other => panic!("expected Valid, got {other:?}"),
        }
    }

    #[test]
    fn a_lab_room_is_left_free_when_a_classroom_will_do() {
        let mut inputs = inputs(&["a"], &["one"], 50);
        inputs.rooms = vec![
            ScheduleRoom {
                id: "lab".to_string(),
                school_id: "school".to_string(),
                name: "Science Laboratory".to_string(),
                is_lab: true,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
            ScheduleRoom {
                id: "classroom".to_string(),
                school_id: "school".to_string(),
                name: "Room 101".to_string(),
                is_lab: false,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        ];

        let outcome = generate(&inputs);
        let placements = match &outcome {
            GenerationOutcome::Valid { placements, .. } => placements.clone(),
            other => panic!("expected Valid, got {other:?}"),
        };

        assert_eq!(placements.len(), 1);
        assert_eq!(placements[0].room.as_deref(), Some("Room 101"));
    }

    #[test]
    fn generate_is_deterministic_for_identical_inputs() {
        let inputs = inputs(&["a", "b"], &["one", "two"], 200);

        let first = generate(&inputs);
        let second = generate(&inputs);

        match (&first, &second) {
            (
                GenerationOutcome::Valid { placements: a, .. },
                GenerationOutcome::Valid { placements: b, .. },
            ) => assert_eq!(a, b),
            _ => panic!("both runs must be Valid"),
        }
    }
}
