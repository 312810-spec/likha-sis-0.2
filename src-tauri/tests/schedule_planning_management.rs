//! Command-boundary proofs for CTOS M09 — the Teacher Load Maker. Every
//! clause of CTOS.md §M09's acceptance list is proven here, through the
//! same `authorize_capability_with_actor` / `require_active_session`
//! boundary the `#[tauri::command]` functions stand on, rather than
//! directly against the repository:
//!
//! - **independent checker** — `validate` re-derives conflicts over a
//!   draft the generator never produced, after a human repair;
//! - **conflict fixtures** — one teacher double-booked, one section
//!   double-booked, one room double-booked, and a teacher booked into a
//!   window they are not available for;
//! - **stale-generation publication rejection** — an input moves between
//!   generation and publication, and publication is refused;
//! - **atomic publication** — a violating plan publishes *nothing*;
//! - **version-consistent teacher/section/room views** — all three views
//!   describe one and the same set of meetings, from one published
//!   revision.
//!
//! The three required generation states are exercised against the
//! pipeline in `src/scheduling/pipeline.rs`'s own tests; this file proves
//! the authorization boundary in front of them.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::{AppError, AppResult};
use app_lib::repository::role;
use app_lib::repository::schedule_plan::{self, PublishOutcome, SchedulePlan};
use app_lib::repository::scheduling_inputs::{self, ScheduleSettings};
use app_lib::repository::school;
use app_lib::repository::section;
use app_lib::repository::subject;
use app_lib::repository::teaching_assignment;
use app_lib::repository::user;
use app_lib::scheduling::check::{self, Violation};
use app_lib::scheduling::pipeline;

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn login_as_a_school_head_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> SessionManager {
    let head = user::create_user(conn, username, "password", "A School Head").unwrap();
    user::add_school_membership(conn, &head.id, school_id).unwrap();
    role::grant(conn, &head.id, school_id, role::SCHOOL_HEAD).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

/// The same shape `commands::schedule_planning::publish_schedule_plan`
/// uses: resolve the school *and the actor* from the session, then hand
/// both to the repository so the actor is stamped on the publication.
/// A capability failure here is an `Err`, because a caller that cannot be
/// authorized never reaches the workflow at all.
fn publish_as_current_session(
    conn: &mut rusqlite::Connection,
    sessions: &SessionManager,
    plan_id: &str,
) -> AppResult<PublishOutcome> {
    let (school_id, actor_user_id) = auth::authorize_capability_with_actor(
        conn,
        sessions,
        Capability::ManageTeachingAssignments,
    )?;
    schedule_plan::publish(conn, &school_id, plan_id, &actor_user_id)
}

/// The same shape `commands::schedule_planning::validate_schedule_plan`
/// uses: a plain-authenticated read, since a teacher checking a draft is
/// reading their own school's plan.
fn validate_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    plan_id: &str,
) -> AppResult<Vec<Violation>> {
    let (_, school_id) = sessions.require_active_session(conn)?;
    check::check(conn, &school_id, plan_id)
}

fn generate_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> AppResult<pipeline::GenerationResponse> {
    let (school_id, _) = auth::authorize_capability_with_actor(
        conn,
        sessions,
        Capability::ManageTeachingAssignments,
    )?;
    pipeline::generate_plan(conn, &school_id)
}

fn settings_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> AppResult<ScheduleSettings> {
    let (_, school_id) = sessions.require_active_session(conn)?;
    scheduling_inputs::ensure(conn, &school_id)
}

#[allow(dead_code)]
struct School {
    school_id: String,
    teacher_a: String,
    teacher_b: String,
    section_a: String,
    section_b: String,
    subject_math: String,
    subject_science: String,
    subject_english: String,
    assignment_a: String,
    assignment_b: String,
}

/// Two teachers, two sections, three subjects and a 300-minute weekly
/// requirement — the smallest school that can produce a real conflict. The
/// third subject exists because `teaching_assignments` is unique on
/// `(section_id, subject_id)`, so a conflict fixture needs a subject the
/// conflicted section does not already have scheduled.
fn seed_school(conn: &rusqlite::Connection) -> School {
    let s = school::create(conn, "Rizal Elementary").unwrap();
    let teacher_a = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
    let teacher_b = user::create_user(conn, "teacher.b", "password", "Teacher B").unwrap();
    user::add_school_membership(conn, &teacher_a.id, &s.id).unwrap();
    user::add_school_membership(conn, &teacher_b.id, &s.id).unwrap();

    let section_a = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(conn, &s.id, "2026-2027", "8", "Bonifacio").unwrap();
    let subject_math = subject::create(conn, &s.id, "Mathematics").unwrap();
    let subject_science = subject::create(conn, &s.id, "Science").unwrap();
    let subject_english = subject::create(conn, &s.id, "English").unwrap();

    // Both subjects demand a real weekly load, so the generator stages
    // placements for both assignments — a fixture that moves one of them
    // needs something to move.
    scheduling_inputs::set_requirement(conn, &s.id, &subject_math.id, 300).unwrap();
    scheduling_inputs::set_requirement(conn, &s.id, &subject_science.id, 300).unwrap();

    let assignment_a =
        teaching_assignment::create(conn, &s.id, &teacher_a.id, &section_a.id, &subject_math.id)
            .unwrap()
            .unwrap();
    let assignment_b = teaching_assignment::create(
        conn,
        &s.id,
        &teacher_b.id,
        &section_b.id,
        &subject_science.id,
    )
    .unwrap()
    .unwrap();

    School {
        school_id: s.id,
        teacher_a: teacher_a.id,
        teacher_b: teacher_b.id,
        section_a: section_a.id,
        section_b: section_b.id,
        subject_math: subject_math.id,
        subject_science: subject_science.id,
        subject_english: subject_english.id,
        assignment_a: assignment_a.id,
        assignment_b: assignment_b.id,
    }
}

fn draft(conn: &rusqlite::Connection, school_id: &str) -> SchedulePlan {
    schedule_plan::current_draft(conn, school_id)
        .unwrap()
        .expect("a generate call stages a draft")
}

/// One placement of the named assignment, as the generator staged it —
/// the slot a later repair is built against.
fn placement_of(
    conn: &rusqlite::Connection,
    school_id: &str,
    plan_id: &str,
    assignment_id: &str,
) -> schedule_plan::PlanPlacement {
    schedule_plan::list_placements(conn, school_id, plan_id)
        .unwrap()
        .into_iter()
        .find(|placement| placement.teaching_assignment_id == assignment_id)
        .expect("the assignment must have a staged placement")
}

#[test]
fn a_school_head_generates_validates_and_publishes_a_plan() {
    let mut conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");

    // Generate — settings, unavailability, rooms, requirements and
    // assignments are locked into the plan's fingerprint as one set.
    let response = generate_as_current_session(&conn, &sessions).unwrap();
    let plan = draft(&conn, &s.school_id);
    assert_eq!(plan.id, response.plan_id);

    // Validate — the independent checker, over the draft as it stands.
    let violations = validate_as_current_session(&conn, &sessions, &plan.id).unwrap();
    assert!(
        violations.is_empty(),
        "a generated plan must be clean: {violations:?}"
    );

    // Publish — the outcome is a value, not an error.
    let outcome = publish_as_current_session(&mut conn, &sessions, &plan.id).unwrap();
    let PublishOutcome::Published {
        revision,
        meeting_count,
    } = outcome
    else {
        panic!("a clean generated plan must publish, got {outcome:?}");
    };
    assert_eq!(revision, plan.revision);
    assert!(
        meeting_count > 0,
        "publication must write the placed meetings"
    );
}

#[test]
fn a_teacher_cannot_generate_or_publish() {
    let mut conn = open_test_db();
    let s = seed_school(&conn);
    let teacher = user::create_user(&conn, "plain.teacher", "password", "Plain Teacher").unwrap();
    user::add_school_membership(&conn, &teacher.id, &s.school_id).unwrap();
    role::grant(&conn, &teacher.id, &s.school_id, role::TEACHER).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "plain.teacher", "password", &s.school_id).unwrap();

    let generate = generate_as_current_session(&conn, &sessions);
    assert!(
        matches!(generate, Err(AppError::Unauthorized)),
        "a teacher must not be able to generate, got {generate:?}"
    );

    let publish = publish_as_current_session(&mut conn, &sessions, "no-such-plan");
    assert!(
        matches!(publish, Err(AppError::Unauthorized)),
        "a teacher must not be able to publish, got {publish:?}"
    );

    // A teacher may still read the published views — that is their own
    // schedule — and there is nothing to see before a first publication.
    assert!(schedule_plan::published_views(&conn, &s.school_id)
        .unwrap()
        .is_none());
}

#[test]
fn the_checker_flags_one_teacher_double_booked() {
    let conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    generate_as_current_session(&conn, &sessions).unwrap();
    let plan = draft(&conn, &s.school_id);

    // A human repair that double-books Teacher A: a second class of
    // theirs moved onto the slot their Mathematics already occupies. The
    // generator would never have produced this, which is the point — the
    // checker re-derives the conflict from the placements alone.
    let math = placement_of(&conn, &s.school_id, &plan.id, &s.assignment_a);
    let extra = teaching_assignment::create(
        &conn,
        &s.school_id,
        &s.teacher_a,
        &s.section_b,
        &s.subject_english,
    )
    .unwrap()
    .unwrap();
    schedule_plan::add_placement(
        &conn,
        &s.school_id,
        &plan.id,
        &extra.id,
        math.weekday,
        &math.starts_at,
        &math.ends_at,
        None,
    )
    .unwrap();

    let violations = validate_as_current_session(&conn, &sessions, &plan.id).unwrap();

    let flagged = violations
        .iter()
        .filter(|violation| matches!(violation, Violation::TeacherConflict { .. }))
        .count();
    assert_eq!(
        flagged, 1,
        "one double-booked teacher must be reported once: {violations:?}"
    );
}

#[test]
fn the_checker_flags_one_section_double_booked_and_one_room_double_booked() {
    let conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    scheduling_inputs::create_room(&conn, &s.school_id, "Science Laboratory", true).unwrap();
    generate_as_current_session(&conn, &sessions).unwrap();
    let plan = draft(&conn, &s.school_id);
    let math = placement_of(&conn, &s.school_id, &plan.id, &s.assignment_a);

    // A second class for Mabini on the slot their Mathematics already
    // occupies — one section, two meetings at once.
    let extra = teaching_assignment::create(
        &conn,
        &s.school_id,
        &s.teacher_b,
        &s.section_a,
        &s.subject_english,
    )
    .unwrap()
    .unwrap();
    schedule_plan::add_placement(
        &conn,
        &s.school_id,
        &plan.id,
        &extra.id,
        math.weekday,
        &math.starts_at,
        &math.ends_at,
        Some("Science Laboratory"),
    )
    .unwrap();
    // ...and Teacher B's own Science class moved into the same room at
    // the same time — one lab, two classes at once.
    let science = placement_of(&conn, &s.school_id, &plan.id, &s.assignment_b);
    schedule_plan::move_placement(
        &conn,
        &s.school_id,
        &plan.id,
        &science.id,
        math.weekday,
        &math.starts_at,
        &math.ends_at,
        Some("Science Laboratory"),
    )
    .unwrap();

    let violations = validate_as_current_session(&conn, &sessions, &plan.id).unwrap();

    assert!(
        violations
            .iter()
            .any(|violation| matches!(violation, Violation::SectionConflict { .. })),
        "a double-booked section must be flagged: {violations:?}"
    );
    assert!(
        violations
            .iter()
            .any(|violation| matches!(violation, Violation::RoomConflict { .. })),
        "a double-booked room must be flagged: {violations:?}"
    );
}

#[test]
fn the_checker_flags_a_class_inside_an_unavailable_window() {
    let conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    generate_as_current_session(&conn, &sessions).unwrap();
    let plan = draft(&conn, &s.school_id);

    // Block the whole week for Teacher A, which the generator would have
    // honoured; the checker must catch the now-conflicting placement from
    // the inputs alone. Every weekday is blocked, so whichever weekday
    // the generator chose is covered.
    for weekday in 0..=6 {
        scheduling_inputs::add_unavailability(
            &conn,
            &s.school_id,
            &s.teacher_a,
            weekday,
            "00:00",
            "23:59",
            Some("Standing ancillary duty"),
        )
        .unwrap();
    }

    let violations = validate_as_current_session(&conn, &sessions, &plan.id).unwrap();
    assert!(
        violations
            .iter()
            .any(|violation| matches!(violation, Violation::TeacherUnavailable { .. })),
        "a placement inside an unavailable window must be flagged: {violations:?}"
    );
}

#[test]
fn a_stale_generation_is_refused_at_publication() {
    let mut conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    generate_as_current_session(&conn, &sessions).unwrap();
    let plan = draft(&conn, &s.school_id);

    // The school moves between generation and publication: one more
    // blocked window is enough to change the fingerprint.
    scheduling_inputs::add_unavailability(
        &conn,
        &s.school_id,
        &s.teacher_b,
        5,
        "12:00",
        "13:00",
        None,
    )
    .unwrap();

    let outcome = publish_as_current_session(&mut conn, &sessions, &plan.id).unwrap();

    match outcome {
        PublishOutcome::Stale {
            stored_fingerprint,
            current_fingerprint,
        } => {
            assert_ne!(
                stored_fingerprint, current_fingerprint,
                "a stale refusal must show both fingerprints"
            );
        }
        other => panic!("a stale plan must be refused, got {other:?}"),
    }

    // And nothing went live.
    assert!(
        schedule_plan::current_published(&conn, &s.school_id)
            .unwrap()
            .is_none(),
        "a stale publication must leave no plan live"
    );
    assert_eq!(
        schedule_plan::current_draft(&conn, &s.school_id)
            .unwrap()
            .map(|row| row.id),
        Some(plan.id),
        "the draft must still be repairable"
    );
}

#[test]
fn publication_is_atomic_a_violating_plan_publishes_nothing() {
    let mut conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    generate_as_current_session(&conn, &sessions).unwrap();
    let plan = draft(&conn, &s.school_id);

    // A repair that only touches *placements* leaves the plan's
    // fingerprint untouched, so the Lock step passes and the checker is
    // the only thing standing between this plan and the live timetable.
    // Teacher A now has two of their own classes overlapping.
    let math = placement_of(&conn, &s.school_id, &plan.id, &s.assignment_a);
    schedule_plan::add_placement(
        &conn,
        &s.school_id,
        &plan.id,
        &s.assignment_a,
        math.weekday,
        "08:30",
        "09:20",
        None,
    )
    .unwrap();

    let outcome = publish_as_current_session(&mut conn, &sessions, &plan.id).unwrap();
    match outcome {
        PublishOutcome::Violations { violations } => {
            assert!(
                violations
                    .iter()
                    .any(|violation| matches!(violation, Violation::TeacherConflict { .. })),
                "the refusal must carry the checker's findings: {violations:?}"
            );
        }
        other => panic!("a violating plan must be refused, got {other:?}"),
    }

    assert!(
        schedule_plan::current_published(&conn, &s.school_id)
            .unwrap()
            .is_none(),
        "a refused publication must leave nothing live"
    );
    assert_eq!(
        schedule_plan::current_draft(&conn, &s.school_id)
            .unwrap()
            .map(|row| row.id),
        Some(plan.id),
        "the draft must still be the draft"
    );
}

/// The meeting each row describes, stripped of the grouping the view
/// sorted it into — the common identity the three views must share.
fn view_keys(views: &[app_lib::repository::schedule_plan::ViewRow]) -> Vec<(i64, String, String)> {
    let mut keys = views
        .iter()
        .map(|row| (row.weekday, row.starts_at.clone(), row.ends_at.clone()))
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

#[test]
fn published_views_are_version_consistent_across_teacher_section_and_room() {
    let mut conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    scheduling_inputs::create_room(&conn, &s.school_id, "Science Laboratory", true).unwrap();
    generate_as_current_session(&conn, &sessions).unwrap();
    let first = draft(&conn, &s.school_id);
    publish_as_current_session(&mut conn, &sessions, &first.id).unwrap();

    let views = schedule_plan::published_views(&conn, &s.school_id)
        .unwrap()
        .expect("a published plan has views");

    // All three views are read from the one live revision in a single
    // call, so they cannot disagree about which timetable is live. Prove
    // it by holding each view up as a set of the same meetings.
    assert_eq!(views.plan.id, first.id);
    assert!(!views.by_teacher.is_empty());
    assert_eq!(views.by_teacher.len(), views.by_section.len());
    assert_eq!(views.by_section.len(), views.by_room.len());

    let mut teacher_set = view_keys(&views.by_teacher);
    let mut section_set = view_keys(&views.by_section);
    let mut room_set = view_keys(&views.by_room);
    teacher_set.sort();
    section_set.sort();
    room_set.sort();
    assert_eq!(
        teacher_set, section_set,
        "the teacher view and the section view are the same meetings"
    );
    assert_eq!(
        section_set, room_set,
        "the section view and the room view are the same meetings"
    );
}

#[test]
fn a_second_publication_supersedes_the_first_and_the_views_follow() {
    let mut conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");
    generate_as_current_session(&conn, &sessions).unwrap();
    let first = draft(&conn, &s.school_id);
    publish_as_current_session(&mut conn, &sessions, &first.id).unwrap();

    // A new draft for the school as it stands now, published again.
    generate_as_current_session(&conn, &sessions).unwrap();
    let second = draft(&conn, &s.school_id);
    assert_ne!(first.id, second.id, "a new draft is a new row");
    let outcome = publish_as_current_session(&mut conn, &sessions, &second.id).unwrap();
    assert!(matches!(outcome, PublishOutcome::Published { .. }));

    let plans = schedule_plan::list_plans(&conn, &s.school_id).unwrap();
    assert!(
        plans
            .iter()
            .any(|plan| plan.id == first.id && plan.status == "superseded"),
        "the first publication is superseded, not deleted"
    );

    let views = schedule_plan::published_views(&conn, &s.school_id)
        .unwrap()
        .expect("views follow the live plan");
    assert_eq!(views.plan.id, second.id);
    assert_eq!(views.plan.status, "published");
    assert_eq!(
        schedule_plan::current_published(&conn, &s.school_id)
            .unwrap()
            .map(|plan| plan.id),
        Some(second.id)
    );
}

#[test]
fn settings_default_to_the_national_policy_grid_and_are_school_scoped() {
    let conn = open_test_db();
    let s = seed_school(&conn);
    let sessions = login_as_a_school_head_at(&conn, &s.school_id, "head");

    let settings = settings_as_current_session(&conn, &sessions).unwrap();

    assert_eq!(settings.school_id, s.school_id);
    // Schema defaults, not engine-invented ones: the six-hour daily
    // classroom-teaching ceiling from DepEd Order No. 005 s. 2024.
    assert_eq!(settings.max_daily_teaching_minutes, 360);
    assert_eq!(settings.max_weekly_teaching_minutes, 1800);
    assert_eq!(settings.period_minutes, 50);
    assert_eq!(settings.school_days, 5);
}
