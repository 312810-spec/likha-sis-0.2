//! Tauri commands for the SF8 Health & Nutrition Engine (ADR-0071).
//! `school_id` is always derived from the authenticated session, never a
//! client-supplied argument, per `docs/adr/0004-authentication-and-local-session.md`.
//! Both commands gate on `Capability::ManageHealthRecords` (Registrar,
//! School Head) -- see that capability's doc comment in `auth::mod` for
//! the scope decision.

use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::health::consolidation::{self, ConsolidationResult, GradeLevelPercentages};
use crate::repository::nutrition::{self, NutritionRecord, Period};
use crate::repository::{
    device_credential, device_identity, grading, section, section_membership, sync_outbox,
};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// Records one BOSY/EOSY nutrition measurement for a learner. Age and BMI
/// are always computed server-side from `birth_date`/`measurement_date`/
/// `height_m`/`weight_kg` -- never accepted pre-computed from the caller.
/// See `repository::nutrition::record_measurement` for validation detail.
///
/// ADR-0067/0069 sync wiring (Batch 6, continuing the LessonPlan slice):
/// the exact same enrollment-gated encrypt-on-enqueue pattern as
/// `commands::lesson_plan::create_lesson_plan`. Create-only, matching
/// `Section`/`AssessmentItem`/`Subject`/`GradingPeriod`'s own precedent --
/// there is no `update_nutrition_measurement` command, so
/// `upsert_from_sync` is the only materializer this entity needs.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_nutrition_measurement(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    school_year: String,
    period: String,
    grade_level: String,
    sex: String,
    birth_date: String,
    measurement_date: String,
    height_m: f64,
    weight_kg: f64,
) -> AppResult<NutritionRecord> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = crate::auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageHealthRecords,
    )?;
    let period = Period::parse(&period)
        .ok_or_else(|| AppError::InvalidInput("unrecognized nutrition period".to_string()))?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_nutrition_measurement_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &learner_id,
        &school_year,
        period,
        &grade_level,
        &sex,
        &birth_date,
        &measurement_date,
        height_m,
        weight_kg,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::lesson_plan::resolve_sspk_if_enrolled`.
fn resolve_sspk_if_enrolled(
    app: &AppHandle,
    conn: &Connection,
    school_id: &str,
) -> AppResult<Option<[u8; PAYLOAD_KEY_LEN]>> {
    if device_credential::has_active_for_school(conn, school_id)? {
        Ok(Some(db::load_or_mint_sspk(app)?))
    } else {
        Ok(None)
    }
}

/// Shared logic behind `record_nutrition_measurement`, kept separate so
/// it can be exercised directly in this module's own tests without a
/// real Tauri `AppHandle` -- same reason as
/// `commands::lesson_plan::create_lesson_plan_with_optional_sync`. `sspk`
/// is `None` when this school has never enrolled a device: behaves
/// exactly as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox
/// row. When `Some`, the measurement insert and the outbox enqueue are
/// atomic together in one `SAVEPOINT` -- a rejected create (invalid sex,
/// out-of-order dates, non-positive height/weight) never enqueues an
/// outbox row, since `record_measurement` returning `Err` short-circuits
/// before the enqueue is ever reached.
#[allow(clippy::too_many_arguments)]
fn record_nutrition_measurement_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    learner_id: &str,
    school_year: &str,
    period: Period,
    grade_level: &str,
    sex: &str,
    birth_date: &str,
    measurement_date: &str,
    height_m: f64,
    weight_kg: f64,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<NutritionRecord> {
    let Some(sspk) = sspk else {
        return nutrition::record_measurement(
            conn,
            school_id,
            learner_id,
            school_year,
            period,
            grade_level,
            sex,
            birth_date,
            measurement_date,
            height_m,
            weight_kg,
        );
    };

    conn.execute_batch("SAVEPOINT record_nutrition_measurement_with_sync")?;
    let outcome = (|| -> AppResult<NutritionRecord> {
        let created = nutrition::record_measurement(
            conn,
            school_id,
            learner_id,
            school_year,
            period,
            grade_level,
            sex,
            birth_date,
            measurement_date,
            height_m,
            weight_kg,
        )?;
        enqueue_nutrition_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE record_nutrition_measurement_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_nutrition_measurement_with_sync; RELEASE record_nutrition_measurement_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a newly recorded nutrition
/// measurement. `base_version` always comes from
/// `sync_version_cache::known_version` -- `0` for a record this device
/// has never pushed before, matching every create-only entity's own
/// shape.
fn enqueue_nutrition_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    record: &NutritionRecord,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = crate::repository::sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::NutritionRecord,
        &record.id,
    )?;
    let plaintext = serde_json::to_vec(record)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::NutritionRecord,
        entity_id: parse_sync_uuid(&record.id, "nutrition record id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::lesson_plan::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// The learner's own nutrition record for one school year + period, if
/// any.
#[tauri::command]
pub fn get_nutrition_record_for_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    school_year: String,
    period: String,
) -> AppResult<Option<NutritionRecord>> {
    let conn = lock_db(&db);
    let school_id =
        crate::auth::authorize_capability(&conn, &sessions, Capability::ManageHealthRecords)?;
    let period = Period::parse(&period)
        .ok_or_else(|| AppError::InvalidInput("unrecognized nutrition period".to_string()))?;
    nutrition::find_for_learner(&conn, &school_id, &learner_id, &school_year, period)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeLevelWithPercentages {
    #[serde(flatten)]
    pub row: crate::health::consolidation::GradeLevelRow,
    pub pct: GradeLevelPercentages,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionConsolidationReport {
    pub grade_levels: Vec<GradeLevelWithPercentages>,
    pub grand_total: GradeLevelWithPercentages,
}

fn with_pct(row: crate::health::consolidation::GradeLevelRow) -> GradeLevelWithPercentages {
    let pct = consolidation::with_percentages(&row);
    GradeLevelWithPercentages { row, pct }
}

fn to_report(result: ConsolidationResult) -> NutritionConsolidationReport {
    NutritionConsolidationReport {
        grade_levels: result.grade_levels.into_iter().map(with_pct).collect(),
        grand_total: with_pct(result.grand_total),
    }
}

/// The school-wide BOSY-vs-EOSY Nutritional Status Report for one school
/// year + period, aggregated by grade level. Enrolment is derived from
/// every section active during `school_year` (mirroring
/// `commands::export::export_school_eosy_sf6`'s own roster-building
/// pattern); nutrition data comes from every `nutrition_records` row
/// captured for the same school year + period. `grade_levels_offered`
/// controls display order only.
#[tauri::command]
pub fn get_nutrition_consolidation_report(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    period: String,
    grade_levels_offered: Vec<String>,
) -> AppResult<NutritionConsolidationReport> {
    let conn = lock_db(&db);
    let school_id =
        crate::auth::authorize_capability(&conn, &sessions, Capability::ManageHealthRecords)?;
    let period = Period::parse(&period)
        .ok_or_else(|| AppError::InvalidInput("unrecognized nutrition period".to_string()))?;

    let sections: Vec<_> = section::list_by_school(&conn, &school_id)?
        .into_iter()
        .filter(|s| s.school_year == school_year)
        .collect();

    // Same fallback shape as `commands::export::export_school_eosy_sf6`:
    // the school's own grading periods bound the school year when
    // present, else a wide-open default range.
    let school_periods = grading::list_by_school_year(&conn, &school_id, &school_year)?;
    let start_date = school_periods
        .first()
        .map(|p| p.starts_on.clone())
        .unwrap_or_else(|| "2000-01-01".to_string());
    let end_date = school_periods
        .last()
        .map(|p| p.ends_on.clone())
        .unwrap_or_else(|| "2099-12-31".to_string());

    let mut enrollment = Vec::new();
    for sec in &sections {
        let roster = section_membership::roster_for_section_over_range(
            &conn,
            &school_id,
            &sec.id,
            &start_date,
            &end_date,
        )?;
        for member in roster {
            if let Some(row) = nutrition::to_enrollment_row(&sec.grade_level, member.sex.as_deref())
            {
                enrollment.push(row);
            }
        }
    }

    let records = nutrition::list_for_school_year_period(&conn, &school_id, &school_year, period)?;
    let summaries: Vec<_> = records
        .iter()
        .filter_map(nutrition::to_consolidation_summary)
        .collect();

    let result =
        consolidation::consolidate_by_grade_level(&enrollment, &summaries, &grade_levels_offered);
    Ok(to_report(result))
}

#[cfg(test)]
mod sync_tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        user_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let school = crate::repository::school::create(conn, "Rizal Elementary").unwrap();
        let user = crate::repository::user::create_user(
            conn,
            "registrar.a",
            "correct horse battery staple",
            "Registrar A",
        )
        .unwrap();
        crate::repository::user::add_school_membership(conn, &user.id, &school.id).unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', ?1, 'Juan', 'Dela Cruz')",
            (&school.id,),
        )
        .unwrap();
        Fixture {
            school_id: school.id,
            user_id: user.id,
        }
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x5c; PAYLOAD_KEY_LEN]
    }

    #[allow(clippy::too_many_arguments)]
    fn record(
        conn: &Connection,
        f: &Fixture,
        sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
    ) -> AppResult<NutritionRecord> {
        record_nutrition_measurement_with_optional_sync(
            conn,
            &f.school_id,
            &f.user_id,
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "M",
            "2020-06-15",
            "2026-06-20",
            1.10,
            18.5,
            sspk,
        )
    }

    #[test]
    fn with_no_sspk_behaves_exactly_like_a_plain_record() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = record(&conn, &f, None).unwrap();

        assert!(!created.id.is_empty());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = record(&conn, &f, Some(&sspk)).unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::NutritionRecord);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), f.user_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: NutritionRecord = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn stamps_the_change_with_this_installations_own_device_id() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        record(&conn, &f, Some(&sspk)).unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        // An unrecognized sex -- `nutrition::record_measurement` returns
        // `Err(AppError::InvalidInput(_))`.
        let result = record_nutrition_measurement_with_optional_sync(
            &conn,
            &f.school_id,
            &f.user_id,
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "X",
            "2020-06-15",
            "2026-06-20",
            1.10,
            18.5,
            Some(&sspk),
        );

        assert!(result.is_err());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected create must never enqueue an outbox row"
        );
    }
}
