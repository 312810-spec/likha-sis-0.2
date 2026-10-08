use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::schedule_meeting::parse_minutes;
use crate::scheduling::check::{self, Violation};

/// One revision of a school's timetable plan. A plan is born a `draft`,
/// becomes `published` when a School Head publishes it, and later becomes
/// `superseded` when the next plan is published — so the school's history
/// is a chain of revisions, each one frozen at the moment it went live.
///
/// `input_fingerprint` is the Lock step of CTOS.md §M09's workflow: the
/// SHA-256 of every constraint input the generation ran against, taken at
/// plan creation. Publication recomputes it and refuses to write when it
/// no longer matches, which is the acceptance clause's "stale-generation
/// publication rejection" — a plan built against last term's assignments
/// can never silently become this term's live schedule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchedulePlan {
    pub id: String,
    pub school_id: String,
    pub revision: i64,
    pub status: String,
    pub input_fingerprint: String,
    pub generator_note: Option<String>,
    pub created_at: String,
    pub published_at: Option<String>,
    pub published_by_user_id: Option<String>,
}

/// One placement inside a plan, with the names a repair screen or a
/// violation message has to quote already joined in.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanPlacement {
    pub id: String,
    pub plan_id: String,
    pub teaching_assignment_id: String,
    pub teacher_name: String,
    pub section_id: String,
    pub section_name: String,
    pub subject_name: String,
    pub weekday: i64,
    pub starts_at: String,
    pub ends_at: String,
    pub room: Option<String>,
}

/// Every reason `publish` can decline. These are outcomes, not errors: a
/// stale plan or a plan with violations is the workflow telling the
/// School Head something they need to act on, not a crash. The frontend
/// switches on `outcome` the same way it already switches on
/// `CreateMeetingOutcome`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum PublishOutcome {
    /// The plan is live. `meeting_count` rows were written into
    /// `schedule_meetings` as one transaction.
    Published { revision: i64, meeting_count: i64 },
    /// An input moved between generation and publication — the plan was
    /// built against a school that no longer exists as stated, and must
    /// be regenerated before it can go live. Both fingerprints are
    /// returned so the screen can show what changed without exposing
    /// either as anything more meaningful than a digest.
    Stale {
        stored_fingerprint: String,
        current_fingerprint: String,
    },
    /// The independent checker found constraints the plan violates as it
    /// stands right now. Repair, then publish again.
    Violations { violations: Vec<Violation> },
    /// The plan id is not a draft — already published, already
    /// superseded, or not this school's plan at all.
    NotADraft { status: String },
    /// No such plan in this school.
    UnknownPlan,
}

/// The teacher, section and room views of the currently published plan.
/// CTOS.md §M09's "version-consistent teacher/section/room views": all
/// three are read from the *same* published revision in one call, so
/// there is no way for a teacher's view and a room's view to disagree
/// about which timetable is live — the schema's one-published-plan
/// partial index makes that a provable property, not a query convention.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishedViews {
    pub plan: SchedulePlan,
    pub by_teacher: Vec<ViewRow>,
    pub by_section: Vec<ViewRow>,
    pub by_room: Vec<ViewRow>,
}

/// One row of any of the three views: the meeting itself plus whichever
/// grouping the view is organised by. A single shape serves all three so
/// the frontend renders one component three ways.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ViewRow {
    pub teacher_name: String,
    pub section_name: String,
    pub subject_name: String,
    pub room: Option<String>,
    pub weekday: i64,
    pub starts_at: String,
    pub ends_at: String,
}

const PLAN_SELECT: &str = "SELECT id, school_id, revision, status, input_fingerprint, \
     generator_note, created_at, published_at, published_by_user_id \
     FROM schedule_plans";

const PLACEMENT_SELECT: &str = "SELECT spm.id, spm.plan_id, spm.teaching_assignment_id, \
     COALESCE(u.display_name, 'Unknown teacher'), \
     ta.section_id, sec.name, sub.name, spm.weekday, spm.starts_at, spm.ends_at, spm.room \
     FROM schedule_plan_meetings spm \
     JOIN teaching_assignments ta ON ta.id = spm.teaching_assignment_id AND ta.school_id = spm.school_id \
     JOIN sections sec ON sec.id = ta.section_id AND sec.school_id = spm.school_id \
     JOIN subjects sub ON sub.id = ta.subject_id AND sub.school_id = spm.school_id \
     LEFT JOIN users u ON u.id = ta.teacher_user_id";

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<SchedulePlan> {
    Ok(SchedulePlan {
        id: row.get(0)?,
        school_id: row.get(1)?,
        revision: row.get(2)?,
        status: row.get(3)?,
        input_fingerprint: row.get(4)?,
        generator_note: row.get(5)?,
        created_at: row.get(6)?,
        published_at: row.get(7)?,
        published_by_user_id: row.get(8)?,
    })
}

fn row_to_placement(row: &rusqlite::Row) -> rusqlite::Result<PlanPlacement> {
    Ok(PlanPlacement {
        id: row.get(0)?,
        plan_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        teacher_name: row.get(3)?,
        section_id: row.get(4)?,
        section_name: row.get(5)?,
        subject_name: row.get(6)?,
        weekday: row.get(7)?,
        starts_at: row.get(8)?,
        ends_at: row.get(9)?,
        room: row.get(10)?,
    })
}

/// Creates the school's working draft, or — when one already exists —
/// reuses that same draft row and replaces its staging area. Reuse is
/// deliberate: the schema permits at most one draft per school, and a
/// "generate again" that had to delete and recreate the plan would
/// either fight that index or silently discard a plan the School Head
/// had already begun repairing. Instead the revision number is kept, the
/// placements are cleared, and the new fingerprint is recorded against
/// the same draft.
pub fn create_plan(
    conn: &Connection,
    school_id: &str,
    input_fingerprint: &str,
    generator_note: Option<&str>,
) -> AppResult<SchedulePlan> {
    if let Some(draft) = current_draft(conn, school_id)? {
        conn.execute(
            "DELETE FROM schedule_plan_meetings WHERE plan_id = ?1",
            [&draft.id],
        )?;
        conn.execute(
            "UPDATE schedule_plans \
             SET input_fingerprint = ?2, generator_note = ?3 \
             WHERE id = ?1 AND status = 'draft'",
            (&draft.id, input_fingerprint, generator_note),
        )?;
        return find_plan_in_school(conn, school_id, &draft.id)?
            .map(Ok)
            .expect("the draft row just updated must still exist");
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO schedule_plans (id, school_id, revision, status, input_fingerprint, generator_note) \
         SELECT ?1, ?2, COALESCE(MAX(revision), 0) + 1, 'draft', ?3, ?4 \
         FROM schedule_plans WHERE school_id = ?2",
        (&id, school_id, input_fingerprint, generator_note),
    )?;

    find_plan_in_school(conn, school_id, &id)?
        .map(Ok)
        .expect("the row just inserted must exist")
}

pub fn find_plan_in_school(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
) -> AppResult<Option<SchedulePlan>> {
    let sql = format!("{PLAN_SELECT} WHERE id = ?1 AND school_id = ?2");
    conn.query_row(&sql, (plan_id, school_id), row_to_plan)
        .optional()
        .map_err(Into::into)
}

pub fn current_draft(conn: &Connection, school_id: &str) -> AppResult<Option<SchedulePlan>> {
    let sql = format!("{PLAN_SELECT} WHERE school_id = ?1 AND status = 'draft'");
    conn.query_row(&sql, [school_id], row_to_plan)
        .optional()
        .map_err(Into::into)
}

pub fn current_published(conn: &Connection, school_id: &str) -> AppResult<Option<SchedulePlan>> {
    let sql = format!("{PLAN_SELECT} WHERE school_id = ?1 AND status = 'published'");
    conn.query_row(&sql, [school_id], row_to_plan)
        .optional()
        .map_err(Into::into)
}

/// Every plan revision, newest first — the school's scheduling history,
/// superseded revisions included. A superseded plan is not deletable
/// history: it records which timetable was actually live for which weeks.
pub fn list_plans(conn: &Connection, school_id: &str) -> AppResult<Vec<SchedulePlan>> {
    let sql = format!("{PLAN_SELECT} WHERE school_id = ?1 ORDER BY revision DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([school_id], row_to_plan)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_placements(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
) -> AppResult<Vec<PlanPlacement>> {
    let sql = format!(
        "{PLACEMENT_SELECT} \
         WHERE spm.school_id = ?1 AND spm.plan_id = ?2 \
         ORDER BY spm.weekday, spm.starts_at"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map((school_id, plan_id), row_to_placement)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Validates a slot the same way the manual path does: the assignment
/// must resolve in this school, the weekday must be real, and the times
/// must be real "HH:MM" values in order. Returns `false` (not an error)
/// for an exact duplicate of a placement already in this plan, so a
/// repair screen can treat "nothing changed" as a no-op rather than a
/// failure.
#[allow(clippy::too_many_arguments)]
pub fn add_placement(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
    teaching_assignment_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
    room: Option<&str>,
) -> AppResult<bool> {
    validate_slot(
        conn,
        school_id,
        teaching_assignment_id,
        weekday,
        starts_at,
        ends_at,
    )?;

    let id = Uuid::now_v7().to_string();
    let inserted = conn.execute(
        "INSERT INTO schedule_plan_meetings \
             (id, school_id, plan_id, teaching_assignment_id, weekday, starts_at, ends_at, room) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT (plan_id, teaching_assignment_id, weekday, starts_at, ends_at) DO NOTHING",
        (
            &id,
            school_id,
            plan_id,
            teaching_assignment_id,
            weekday,
            starts_at,
            ends_at,
            room,
        ),
    )?;
    Ok(inserted > 0)
}

/// Moves one placement to a new slot — the Repair step of CTOS.md §M09's
/// workflow, performed by a human on the checker's findings rather than
/// by the generator. `false` when there is no such placement in this
/// plan, or the target slot is already taken by another placement.
#[allow(clippy::too_many_arguments)]
pub fn move_placement(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
    placement_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
    room: Option<&str>,
) -> AppResult<bool> {
    let Some(placement) = find_placement(conn, school_id, plan_id, placement_id)? else {
        return Ok(false);
    };

    if placement.teaching_assignment_id.is_empty() {
        return Ok(false);
    }
    validate_slot(
        conn,
        school_id,
        &placement.teaching_assignment_id,
        weekday,
        starts_at,
        ends_at,
    )?;

    // Delete-then-insert rather than `UPDATE ... SET`, because the target
    // slot may already hold a placement and the plan's `UNIQUE` constraint
    // must not turn a repair into an error — a move onto an occupied slot
    // is a no-op the caller can report plainly.
    let id = Uuid::now_v7().to_string();
    let inserted = conn.execute(
        "INSERT INTO schedule_plan_meetings \
             (id, school_id, plan_id, teaching_assignment_id, weekday, starts_at, ends_at, room) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT (plan_id, teaching_assignment_id, weekday, starts_at, ends_at) DO NOTHING",
        (
            &id,
            school_id,
            plan_id,
            &placement.teaching_assignment_id,
            weekday,
            starts_at,
            ends_at,
            room,
        ),
    )?;
    if inserted == 0 {
        return Ok(false);
    }
    conn.execute(
        "DELETE FROM schedule_plan_meetings WHERE id = ?1 AND school_id = ?2 AND plan_id = ?3",
        (placement_id, school_id, plan_id),
    )?;
    Ok(true)
}

pub fn remove_placement(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
    placement_id: &str,
) -> AppResult<bool> {
    let affected = conn.execute(
        "DELETE FROM schedule_plan_meetings \
         WHERE id = ?1 AND school_id = ?2 AND plan_id = ?3",
        (placement_id, school_id, plan_id),
    )?;
    Ok(affected > 0)
}

fn find_placement(
    conn: &Connection,
    school_id: &str,
    plan_id: &str,
    placement_id: &str,
) -> AppResult<Option<PlanPlacement>> {
    let sql = format!(
        "{PLACEMENT_SELECT} \
         WHERE spm.school_id = ?1 AND spm.plan_id = ?2 AND spm.id = ?3"
    );
    conn.query_row(&sql, (school_id, plan_id, placement_id), row_to_placement)
        .optional()
        .map_err(Into::into)
}

fn validate_slot(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM teaching_assignments \
         WHERE id = ?1 AND school_id = ?2)",
        (teaching_assignment_id, school_id),
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::Validation(
            "Unknown teaching assignment".to_string(),
        ));
    }
    if !(0..=6).contains(&weekday) {
        return Err(AppError::Validation(
            "Weekday must be between 0 and 6".to_string(),
        ));
    }
    let (Some(start), Some(end)) = (parse_minutes(starts_at), parse_minutes(ends_at)) else {
        return Err(AppError::Validation(
            "Start and end times must be valid HH:MM".to_string(),
        ));
    };
    if start >= end {
        return Err(AppError::Validation(
            "Start time must be before end time".to_string(),
        ));
    }
    Ok(())
}

/// Publishes a draft plan: Lock again, Validate independently, then make
/// it live in one transaction. Nothing is written until every gate has
/// passed, and a failure anywhere after the transaction opens rolls the
/// school back to the timetable it already had — that is the acceptance
/// clause's "atomic publication".
///
/// The meetings the *previous* published plan owned are deleted and
/// replaced by this plan's; meetings the school created by hand
/// (`plan_id IS NULL`) are untouched, because they are the school's own
/// existing valid schedule, not something a plan may discard.
pub fn publish(
    conn: &mut Connection,
    school_id: &str,
    plan_id: &str,
    published_by_user_id: &str,
) -> AppResult<PublishOutcome> {
    let Some(plan) = find_plan_in_school(conn, school_id, plan_id)? else {
        return Ok(PublishOutcome::UnknownPlan);
    };
    if plan.status != "draft" {
        return Ok(PublishOutcome::NotADraft {
            status: plan.status,
        });
    }

    // Lock: recompute the fingerprint against the inputs as they stand
    // now. Anything else is stale and must be regenerated, not published.
    let inputs = crate::scheduling::constraints::load(conn, school_id)?;
    let current_fingerprint = crate::scheduling::constraints::fingerprint(&inputs);
    if current_fingerprint != plan.input_fingerprint {
        return Ok(PublishOutcome::Stale {
            stored_fingerprint: plan.input_fingerprint,
            current_fingerprint,
        });
    }

    // Validate: the independent checker, not the generator's own
    // bookkeeping, decides whether this plan may go live.
    let violations = check::check(conn, school_id, plan_id)?;
    if !violations.is_empty() {
        return Ok(PublishOutcome::Violations { violations });
    }

    let placements = list_placements(conn, school_id, plan_id)?;

    // Everything from here is one statement group that either fully
    // commits or fully rolls back: supersede the old plan, replace its
    // live meetings, publish this one.
    let tx = conn.transaction()?;
    let status: String = tx.query_row(
        "SELECT status FROM schedule_plans WHERE id = ?1 AND school_id = ?2",
        (plan_id, school_id),
        |row| row.get(0),
    )?;
    if status != "draft" {
        // No writes have happened; dropping the transaction rolls back
        // an empty change set.
        return Ok(PublishOutcome::NotADraft { status });
    }

    let previously_published: Option<String> = tx
        .query_row(
            "SELECT id FROM schedule_plans WHERE school_id = ?1 AND status = 'published'",
            [school_id],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(old_plan_id) = &previously_published {
        tx.execute(
            "UPDATE schedule_plans SET status = 'superseded' WHERE id = ?1 AND school_id = ?2",
            (old_plan_id, school_id),
        )?;
        // Only the old plan's own meetings go; the school's hand-created
        // meetings (`plan_id IS NULL`) stay exactly where they are.
        tx.execute(
            "DELETE FROM schedule_meetings WHERE school_id = ?1 AND plan_id = ?2",
            (school_id, old_plan_id),
        )?;
    }

    for placement in &placements {
        let meeting_id = Uuid::now_v7().to_string();
        tx.execute(
            "INSERT INTO schedule_meetings \
                 (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at, room, plan_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                &meeting_id,
                school_id,
                &placement.teaching_assignment_id,
                placement.weekday,
                &placement.starts_at,
                &placement.ends_at,
                &placement.room,
                plan_id,
            ),
        )?;
    }

    tx.execute(
        "UPDATE schedule_plans \
         SET status = 'published', \
             published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             published_by_user_id = ?2 \
         WHERE id = ?1 AND school_id = ?3",
        (plan_id, published_by_user_id, school_id),
    )?;

    tx.commit()?;

    Ok(PublishOutcome::Published {
        revision: plan.revision,
        meeting_count: placements.len() as i64,
    })
}

/// The three published views, all resolved from the one live revision.
/// `None` when the school has never published a plan — My Day and the
/// rest of the app then continue to read whatever meetings exist, which
/// before M09 is all of them.
pub fn published_views(conn: &Connection, school_id: &str) -> AppResult<Option<PublishedViews>> {
    let Some(plan) = current_published(conn, school_id)? else {
        return Ok(None);
    };

    let meeting_select = "SELECT COALESCE(u.display_name, 'Unknown teacher'), \
         sec.name, sub.name, sm.room, sm.weekday, sm.starts_at, sm.ends_at \
         FROM schedule_meetings sm \
         JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id AND ta.school_id = sm.school_id \
         JOIN sections sec ON sec.id = ta.section_id AND sec.school_id = sm.school_id \
         JOIN subjects sub ON sub.id = ta.subject_id AND sub.school_id = sm.school_id \
         LEFT JOIN users u ON u.id = ta.teacher_user_id \
         WHERE sm.school_id = ?1 AND sm.plan_id = ?2";

    let mut by_teacher = query_views(
        conn,
        &format!("{meeting_select} ORDER BY 1, 5, 6"),
        school_id,
        &plan.id,
    )?;
    let mut by_section = query_views(
        conn,
        &format!("{meeting_select} ORDER BY 2, 5, 6"),
        school_id,
        &plan.id,
    )?;
    let mut by_room = query_views(
        conn,
        &format!("{meeting_select} ORDER BY 4, 5, 6"),
        school_id,
        &plan.id,
    )?;

    // Rooms with no name sort last on the room view: an unscheduled room
    // is not a schedulable resource, but a meeting whose room was left
    // optional still belongs somewhere readable.
    by_room.sort_by(|a, b| {
        a.room
            .as_deref()
            .unwrap_or("zzz")
            .cmp(b.room.as_deref().unwrap_or("zzz"))
            .then(a.weekday.cmp(&b.weekday))
            .then(a.starts_at.cmp(&b.starts_at))
    });
    by_teacher.sort_by(|a, b| {
        a.teacher_name
            .cmp(&b.teacher_name)
            .then(a.weekday.cmp(&b.weekday))
            .then(a.starts_at.cmp(&b.starts_at))
    });
    by_section.sort_by(|a, b| {
        a.section_name
            .cmp(&b.section_name)
            .then(a.weekday.cmp(&b.weekday))
            .then(a.starts_at.cmp(&b.starts_at))
    });

    Ok(Some(PublishedViews {
        plan,
        by_teacher,
        by_section,
        by_room,
    }))
}

fn query_views(
    conn: &Connection,
    sql: &str,
    school_id: &str,
    plan_id: &str,
) -> AppResult<Vec<ViewRow>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map((school_id, plan_id), |row| {
        Ok(ViewRow {
            teacher_name: row.get(0)?,
            section_name: row.get(1)?,
            subject_name: row.get(2)?,
            room: row.get(3)?,
            weekday: row.get(4)?,
            starts_at: row.get(5)?,
            ends_at: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::schedule_meeting;
    use crate::scheduling::generate::Placement;
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

    fn fingerprint_of(conn: &Connection, school_id: &str) -> String {
        crate::scheduling::constraints::fingerprint(
            &crate::scheduling::constraints::load(conn, school_id).unwrap(),
        )
    }

    fn draft_with(conn: &Connection, school_id: &str, placements: &[Placement]) -> String {
        let plan = create_plan(conn, school_id, &fingerprint_of(conn, school_id), None).unwrap();
        for placement in placements {
            add_placement(
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
    fn create_plan_starts_at_revision_one() {
        let conn = open_test_db();
        let (school_id, _, _) = setup(&conn);

        let plan = create_plan(&conn, &school_id, "fingerprint", None).unwrap();

        assert_eq!(plan.revision, 1);
        assert_eq!(plan.status, "draft");
        assert_eq!(plan.input_fingerprint, "fingerprint");
    }

    #[test]
    fn create_plan_reuses_the_existing_draft_and_clears_its_placements() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let first = create_plan(&conn, &school_id, "one", None).unwrap();
        add_placement(
            &conn,
            &school_id,
            &first.id,
            &assignment_id,
            1,
            "08:00",
            "08:50",
            None,
        )
        .unwrap();

        let second = create_plan(&conn, &school_id, "two", None).unwrap();

        assert_eq!(first.id, second.id, "the same draft row is reused");
        assert_eq!(second.revision, 1);
        assert_eq!(second.input_fingerprint, "two");
        assert!(list_placements(&conn, &school_id, &second.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn revisions_are_monotonic_across_plans() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let mut plan =
            create_plan(&conn, &school_id, &fingerprint_of(&conn, &school_id), None).unwrap();
        assert_eq!(plan.revision, 1);
        // Force a second revision by publishing the first, then drafting again.
        assert!(matches!(
            publish(&mut conn, &school_id, &plan.id, &teacher_id).unwrap(),
            PublishOutcome::Published { .. }
        ));
        plan = create_plan(&conn, &school_id, &fingerprint_of(&conn, &school_id), None).unwrap();
        assert_eq!(
            plan.revision, 2,
            "a new draft after publication is revision 2"
        );
    }

    #[test]
    fn add_placement_rejects_an_unknown_assignment() {
        let conn = open_test_db();
        let (school_id, _, _) = setup(&conn);
        let plan = create_plan(&conn, &school_id, "fingerprint", None).unwrap();

        let result = add_placement(
            &conn, &school_id, &plan.id, "nope", 1, "08:00", "08:50", None,
        );

        assert!(result.is_err());
        assert!(list_placements(&conn, &school_id, &plan.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn add_placement_rejects_an_inverted_time_range() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan = create_plan(&conn, &school_id, "fingerprint", None).unwrap();

        let result = add_placement(
            &conn,
            &school_id,
            &plan.id,
            &assignment_id,
            1,
            "09:00",
            "08:00",
            None,
        );

        assert!(result.is_err());
    }

    #[test]
    fn add_placement_treats_an_exact_duplicate_as_a_no_op() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan = create_plan(&conn, &school_id, "fingerprint", None).unwrap();

        assert!(add_placement(
            &conn,
            &school_id,
            &plan.id,
            &assignment_id,
            1,
            "08:00",
            "08:50",
            None
        )
        .unwrap());
        assert!(
            !add_placement(
                &conn,
                &school_id,
                &plan.id,
                &assignment_id,
                1,
                "08:00",
                "08:50",
                None
            )
            .unwrap(),
            "the duplicate insert must report false, not error"
        );
        assert_eq!(
            list_placements(&conn, &school_id, &plan.id).unwrap().len(),
            1
        );
    }

    #[test]
    fn move_placement_moves_and_returns_true() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan_id = draft_with(
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
        let placement = list_placements(&conn, &school_id, &plan_id)
            .unwrap()
            .pop()
            .unwrap();

        let moved = move_placement(
            &conn,
            &school_id,
            &plan_id,
            &placement.id,
            2,
            "09:00",
            "09:50",
            Some("Room 101"),
        )
        .unwrap();

        assert!(moved);
        let after = list_placements(&conn, &school_id, &plan_id).unwrap();
        assert_eq!(after.len(), 1, "a move must not leave a duplicate behind");
        assert_eq!(after[0].weekday, 2);
        assert_eq!(after[0].starts_at, "09:00");
        assert_eq!(after[0].room.as_deref(), Some("Room 101"));
    }

    #[test]
    fn move_placement_onto_an_occupied_slot_is_a_no_op() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan_id = draft_with(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id.clone(),
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: None,
            }],
        );
        // A second slot the teacher already occupies.
        add_placement(
            &conn,
            &school_id,
            &plan_id,
            &assignment_id,
            2,
            "09:00",
            "09:50",
            None,
        )
        .unwrap();
        let target = list_placements(&conn, &school_id, &plan_id)
            .unwrap()
            .into_iter()
            .find(|p| p.weekday == 1)
            .unwrap();

        // Move the Monday meeting onto the already-occupied Tuesday slot.
        let moved = move_placement(
            &conn, &school_id, &plan_id, &target.id, 2, "09:00", "09:50", None,
        )
        .unwrap();

        assert!(!moved, "moving onto an occupied slot must report false");
        assert_eq!(
            list_placements(&conn, &school_id, &plan_id).unwrap().len(),
            2
        );
        // The original Monday placement is still there, untouched.
        assert!(list_placements(&conn, &school_id, &plan_id)
            .unwrap()
            .iter()
            .any(|p| p.weekday == 1));
    }

    #[test]
    fn remove_placement_deletes_only_the_named_placement() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let plan_id = draft_with(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id.clone(),
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: None,
            }],
        );
        add_placement(
            &conn,
            &school_id,
            &plan_id,
            &assignment_id,
            2,
            "09:00",
            "09:50",
            None,
        )
        .unwrap();
        let target = list_placements(&conn, &school_id, &plan_id)
            .unwrap()
            .pop()
            .unwrap();

        assert!(remove_placement(&conn, &school_id, &plan_id, &target.id).unwrap());
        assert_eq!(
            list_placements(&conn, &school_id, &plan_id).unwrap().len(),
            1
        );
        assert!(!remove_placement(&conn, &school_id, &plan_id, &target.id).unwrap());
    }

    #[test]
    fn publish_rejects_an_unknown_plan() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);

        let outcome = publish(&mut conn, &school_id, "no-such-plan", &teacher_id).unwrap();

        assert_eq!(outcome, PublishOutcome::UnknownPlan);
    }

    #[test]
    fn publish_rejects_an_already_published_plan() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let plan_id = draft_with(&conn, &school_id, &[]);

        assert!(matches!(
            publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap(),
            PublishOutcome::Published { .. }
        ));
        assert!(matches!(
            publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap(),
            PublishOutcome::NotADraft { status } if status == "published"
        ));
    }

    #[test]
    fn publish_rejects_a_plan_whose_inputs_changed() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let plan_id = draft_with(&conn, &school_id, &[]);

        // Move an input: a blocked window the plan was not generated against.
        crate::repository::scheduling_inputs::add_unavailability(
            &conn,
            &school_id,
            &teacher_id,
            1,
            "07:00",
            "08:00",
            None,
        )
        .unwrap();

        let outcome = publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap();

        assert!(
            matches!(outcome, PublishOutcome::Stale { .. }),
            "got {outcome:?}"
        );
        assert!(
            current_published(&conn, &school_id).unwrap().is_none(),
            "a stale publish must not make any plan live"
        );
    }

    #[test]
    fn publish_rejects_a_plan_the_checker_finds_violations_in() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        // Two overlapping placements of one teacher — a plan the
        // generator would never have produced, hand-built to prove the
        // checker gates publication.
        let plan_id = draft_with(
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

        let outcome = publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap();

        assert!(
            matches!(outcome, PublishOutcome::Violations { .. }),
            "got {outcome:?}"
        );
        assert!(current_published(&conn, &school_id).unwrap().is_none());
    }

    #[test]
    fn publish_writes_meetings_and_marks_the_plan_live() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        let plan_id = draft_with(
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

        let outcome = publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap();

        let PublishOutcome::Published {
            revision,
            meeting_count,
        } = outcome
        else {
            panic!("expected Published, got {outcome:?}");
        };
        assert_eq!(revision, 1);
        assert_eq!(meeting_count, 1);

        let published = current_published(&conn, &school_id).unwrap().unwrap();
        assert_eq!(published.id, plan_id);
        assert_eq!(published.published_by_user_id, Some(teacher_id));
        let live: Vec<Option<String>> = conn
            .prepare("SELECT plan_id FROM schedule_meetings WHERE school_id = ?1")
            .unwrap()
            .query_map([school_id], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0], Some(plan_id));
    }

    #[test]
    fn a_second_publication_supersedes_the_first_and_replaces_its_meetings() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        let first = draft_with(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id.clone(),
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: None,
            }],
        );
        publish(&mut conn, &school_id, &first, &teacher_id).unwrap();

        // Repair the draft into a different slot and publish again.
        let second =
            create_plan(&conn, &school_id, &fingerprint_of(&conn, &school_id), None).unwrap();
        add_placement(
            &conn,
            &school_id,
            &second.id,
            &assignment_id,
            2,
            "09:00",
            "09:50",
            None,
        )
        .unwrap();
        let outcome = publish(&mut conn, &school_id, &second.id, &teacher_id).unwrap();
        assert!(
            matches!(outcome, PublishOutcome::Published { revision: 2, .. }),
            "got {outcome:?}"
        );

        let plans = list_plans(&conn, &school_id).unwrap();
        assert_eq!(plans.len(), 2);
        assert_eq!(plans[0].status, "published");
        assert_eq!(plans[1].status, "superseded");

        // The first plan's meeting is gone; only the new plan's is live.
        let live: Vec<Option<String>> = conn
            .prepare("SELECT plan_id FROM schedule_meetings WHERE school_id = ?1")
            .unwrap()
            .query_map([school_id], |row| row.get::<_, Option<String>>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(live.len(), 1, "the superseded plan's meetings are replaced");
        assert_eq!(live[0], Some(second.id));
    }

    #[test]
    fn publication_preserves_manually_created_meetings() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        // The school's own existing schedule, created by hand before M09.
        schedule_meeting::create(&conn, &school_id, &assignment_id, 3, "10:00", "10:50", None)
            .unwrap();

        let plan_id = draft_with(
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
        publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM schedule_meetings WHERE school_id = ?1 AND plan_id IS NULL",
                [school_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 1,
            "the hand-created meeting must survive publication"
        );
    }

    #[test]
    fn published_views_resolve_one_revision_three_ways() {
        let mut conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        crate::repository::scheduling_inputs::create_room(&conn, &school_id, "Room 101", false)
            .unwrap();
        let plan_id = draft_with(
            &conn,
            &school_id,
            &[Placement {
                teaching_assignment_id: assignment_id,
                weekday: 1,
                starts_at: "08:00".to_string(),
                ends_at: "08:50".to_string(),
                room: Some("Room 101".to_string()),
            }],
        );
        publish(&mut conn, &school_id, &plan_id, &teacher_id).unwrap();

        let views = published_views(&conn, &school_id).unwrap().unwrap();

        assert_eq!(views.plan.id, plan_id);
        assert_eq!(views.by_teacher.len(), 1);
        assert_eq!(views.by_section.len(), 1);
        assert_eq!(views.by_room.len(), 1);
        assert_eq!(views.by_teacher[0].teacher_name, "Teacher A");
        assert_eq!(views.by_section[0].section_name, "Mabini");
        assert_eq!(views.by_room[0].room.as_deref(), Some("Room 101"));
        // All three views describe the same meeting.
        assert_eq!(views.by_teacher[0].starts_at, "08:00");
        assert_eq!(views.by_section[0].starts_at, "08:00");
        assert_eq!(views.by_room[0].starts_at, "08:00");
    }

    #[test]
    fn published_views_are_none_before_the_first_publication() {
        let conn = open_test_db();
        let (school_id, _, _) = setup(&conn);

        assert!(published_views(&conn, &school_id).unwrap().is_none());
    }

    #[test]
    fn plans_and_placements_are_scoped_to_their_school() {
        let conn = open_test_db();
        let (school_id, _, assignment_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let plan_id = draft_with(
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

        // The other school must see neither the plan nor its placements.
        assert!(find_plan_in_school(&conn, &other_school.id, &plan_id)
            .unwrap()
            .is_none());
        assert!(list_placements(&conn, &other_school.id, &plan_id)
            .unwrap()
            .is_empty());
        assert!(list_plans(&conn, &other_school.id).unwrap().is_empty());
    }
}
