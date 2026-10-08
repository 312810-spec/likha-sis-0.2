use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repository::schedule_plan;
use crate::scheduling::constraints::{fingerprint, load};
use crate::scheduling::generate::{generate_with_budget, GenerationOutcome};

/// The result of a Generate run: the plan the placements were staged
/// into, and which of the three required states the generator landed in.
/// The plan exists in *every* case, including `Impossible` and `Stopped`
/// — the placements that did succeed are worth showing the School Head
/// next to the proof of why the rest could not be placed, and the
/// revision is theirs to repair.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationResponse {
    pub plan_id: String,
    pub revision: i64,
    pub outcome: GenerationOutcome,
}

/// The default step budget for `generate_plan`. Generous by design: a
/// school-size timetable is a few thousand placements, and a run that
/// hits this ceiling has found something worth reporting as `Stopped`
/// rather than silently timing out on. `generate_with_budget` remains
/// public so the Stopped state can be exercised with a deliberately
/// starved budget instead of a deliberately huge school.
pub const DEFAULT_STEP_BUDGET: u64 = 200_000;

/// Prepare → Confirm → Lock → Generate, persisted: loads every constraint
/// input for `school_id`, fingerprints it into the plan as the Lock,
/// runs the generator, and stages whatever placements it produced into
/// the school's draft. The draft's previous placements are cleared first
/// (see `schedule_plan::create_plan`), so re-running this is always a
/// fresh generation against the inputs as they stand now.
pub fn generate_plan(conn: &Connection, school_id: &str) -> AppResult<GenerationResponse> {
    generate_plan_with_budget(conn, school_id, DEFAULT_STEP_BUDGET)
}

pub fn generate_plan_with_budget(
    conn: &Connection,
    school_id: &str,
    step_budget: u64,
) -> AppResult<GenerationResponse> {
    let inputs = load(conn, school_id)?;
    let fingerprint = fingerprint(&inputs);
    let outcome = generate_with_budget(&inputs, step_budget);

    let placements = match &outcome {
        GenerationOutcome::Valid { placements, .. }
        | GenerationOutcome::Impossible { placements, .. }
        | GenerationOutcome::Stopped { placements, .. } => placements.clone(),
    };

    let note = generator_note(&outcome);
    let plan = schedule_plan::create_plan(conn, school_id, &fingerprint, note.as_deref())?;
    for placement in &placements {
        schedule_plan::add_placement(
            conn,
            school_id,
            &plan.id,
            &placement.teaching_assignment_id,
            placement.weekday,
            &placement.starts_at,
            &placement.ends_at,
            placement.room.as_deref(),
        )?;
    }

    Ok(GenerationResponse {
        plan_id: plan.id,
        revision: plan.revision,
        outcome,
    })
}

/// One short human-readable line recording which state this generation
/// landed in, stamped on the plan so the revision history says more than
/// a revision number.
fn generator_note(outcome: &GenerationOutcome) -> Option<String> {
    match outcome {
        GenerationOutcome::Valid { placements, notes } => Some(format!(
            "Generated {} meetings{}",
            placements.len(),
            if notes.is_empty() {
                String::new()
            } else {
                format!(" — {}", notes.join("; "))
            }
        )),
        GenerationOutcome::Impossible { placements, proofs } => Some(format!(
            "Proven impossible: {} of {} assignments placed, {} blocking proof(s)",
            placements.len(),
            placements.len() + proofs.len(),
            proofs.len()
        )),
        GenerationOutcome::Stopped {
            placements,
            unplaced,
            steps_used,
        } => Some(format!(
            "Search stopped at {} steps: {} placed, {} unplaced",
            steps_used,
            placements.len(),
            unplaced.len()
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::schedule_plan::{self, PublishOutcome};
    use crate::scheduling::generate::GenerationOutcome;
    use crate::{
        db, repository::school, repository::section, repository::subject, repository::user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

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

    #[test]
    fn generate_stages_a_valid_plan_and_publishes() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        crate::repository::scheduling_inputs::set_requirement(
            &conn,
            &school_id,
            &subject_id_of(&conn, &school_id),
            100,
        )
        .unwrap();

        let response = generate_plan(&conn, &school_id).unwrap();

        assert!(matches!(response.outcome, GenerationOutcome::Valid { .. }));
        let placements =
            schedule_plan::list_placements(&conn, &school_id, &response.plan_id).unwrap();
        assert!(!placements.is_empty());
        assert_eq!(placements[0].teaching_assignment_id, assignment_id);
        assert_eq!(placements[0].teacher_name, "Teacher A");

        // A freshly generated plan must pass the independent checker and
        // publish — the two halves of the acceptance clause, end to end.
        let outcome =
            schedule_plan::publish(&mut conn, &school_id, &response.plan_id, &teacher_id).unwrap();
        assert!(
            matches!(outcome, PublishOutcome::Published { .. }),
            "got {outcome:?}"
        );
    }

    #[test]
    fn a_starved_budget_stops_instead_of_failing() {
        let conn = open_test_db();
        let (school_id, _, _) = setup(&conn);
        // Without a requirement the assignment needs no meetings, so a
        // starved budget would have nothing to stop on: give the subject
        // a real weekly requirement first.
        crate::repository::scheduling_inputs::set_requirement(
            &conn,
            &school_id,
            &subject_id_of(&conn, &school_id),
            200,
        )
        .unwrap();

        let response = generate_plan_with_budget(&conn, &school_id, 0).unwrap();

        assert!(
            matches!(response.outcome, GenerationOutcome::Stopped { .. }),
            "a zero-step budget must yield Stopped, not an error"
        );
    }

    #[test]
    fn an_impossible_school_is_reported_not_crashed() {
        let conn = open_test_db();
        let (school_id, _, _) = setup(&conn);
        // More weekly minutes required than the week holds: 2400 minutes
        // against a 07:30-17:00 five-day grid of 50-minute periods.
        crate::repository::scheduling_inputs::set_requirement(
            &conn,
            &school_id,
            &subject_id_of(&conn, &school_id),
            2400,
        )
        .unwrap();

        let response = generate_plan(&conn, &school_id).unwrap();

        match response.outcome {
            GenerationOutcome::Impossible { proofs, .. } => {
                assert!(
                    !proofs.is_empty(),
                    "impossibility must be proven, not asserted"
                );
            }
            other => panic!("expected Impossible, got {other:?}"),
        }
    }

    #[test]
    fn regenerating_clears_the_previous_draft() {
        let conn = open_test_db();
        let (school_id, _, _) = setup(&conn);
        let first = generate_plan(&conn, &school_id).unwrap();
        let first_count = schedule_plan::list_placements(&conn, &school_id, &first.plan_id)
            .unwrap()
            .len();

        let second = generate_plan(&conn, &school_id).unwrap();

        assert_eq!(first.plan_id, second.plan_id, "the same draft is reused");
        let second_count = schedule_plan::list_placements(&conn, &school_id, &second.plan_id)
            .unwrap()
            .len();
        assert_eq!(
            first_count, second_count,
            "regeneration is idempotent for unchanged inputs"
        );
    }

    fn subject_id_of(conn: &Connection, school_id: &str) -> String {
        subject::list_by_school(conn, school_id)
            .unwrap()
            .pop()
            .unwrap()
            .id
    }
}
