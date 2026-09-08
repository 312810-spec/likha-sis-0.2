//! Persistence for `nutrition_records` (SF8 Health & Nutrition Engine,
//! ADR-0071, migration 43). All SQL for this feature lives here, per
//! `.claude/rules/architecture.md` -- `commands::nutrition` calls only
//! these functions, never raw SQL. Every query is tenant-scoped by
//! `school_id` (never a client-supplied trust boundary on its own --
//! callers derive it from the authenticated session, see
//! `commands::nutrition`).

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::health::consolidation::{
    EnrollmentRow as ConsolidationEnrollmentRow, NutritionRecordSummary,
};
use crate::health::nutrition::{self, HeightForAgeStatus, NutritionalStatus, Sex};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Period {
    Bosy,
    Eosy,
}

impl Period {
    fn as_db_str(self) -> &'static str {
        match self {
            Period::Bosy => "BOSY",
            Period::Eosy => "EOSY",
        }
    }

    pub fn parse(raw: &str) -> Option<Period> {
        match raw.trim().to_uppercase().as_str() {
            "BOSY" => Some(Period::Bosy),
            "EOSY" => Some(Period::Eosy),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionRecord {
    pub id: String,
    pub school_id: String,
    pub learner_id: String,
    pub school_year: String,
    pub period: String,
    pub grade_level: String,
    pub sex: String,
    pub birth_date: String,
    pub measurement_date: String,
    pub height_m: f64,
    pub weight_kg: f64,
    pub age_in_months: i64,
    pub bmi: f64,
    pub nutritional_status: Option<String>,
    pub height_for_age_status: Option<String>,
    pub created_at: String,
}

fn status_to_db_str(status: NutritionalStatus) -> &'static str {
    match status {
        NutritionalStatus::SeverelyWasted => "SEVERELY_WASTED",
        NutritionalStatus::Wasted => "WASTED",
        NutritionalStatus::Normal => "NORMAL",
        NutritionalStatus::Overweight => "OVERWEIGHT",
        NutritionalStatus::Obese => "OBESE",
    }
}

fn hfa_status_to_db_str(status: HeightForAgeStatus) -> &'static str {
    match status {
        HeightForAgeStatus::SeverelyStunted => "SEVERELY_STUNTED",
        HeightForAgeStatus::Stunted => "STUNTED",
        HeightForAgeStatus::Normal => "NORMAL",
        HeightForAgeStatus::Tall => "TALL",
    }
}

fn status_from_db_str(raw: &str) -> Option<NutritionalStatus> {
    match raw {
        "SEVERELY_WASTED" => Some(NutritionalStatus::SeverelyWasted),
        "WASTED" => Some(NutritionalStatus::Wasted),
        "NORMAL" => Some(NutritionalStatus::Normal),
        "OVERWEIGHT" => Some(NutritionalStatus::Overweight),
        "OBESE" => Some(NutritionalStatus::Obese),
        _ => None,
    }
}

fn hfa_status_from_db_str(raw: &str) -> Option<HeightForAgeStatus> {
    match raw {
        "SEVERELY_STUNTED" => Some(HeightForAgeStatus::SeverelyStunted),
        "STUNTED" => Some(HeightForAgeStatus::Stunted),
        "NORMAL" => Some(HeightForAgeStatus::Normal),
        "TALL" => Some(HeightForAgeStatus::Tall),
        _ => None,
    }
}

/// Records one BOSY/EOSY nutrition measurement for a learner, computing
/// age-in-months and BMI here (server-side, never trusting a
/// caller-supplied computed value) and attempting WHO/DepEd
/// classification via `health::nutrition::lookup_bmi_cutoffs`/
/// `lookup_hfa_cutoffs` -- which return `None` today (see that module's
/// doc comment), so `nutritional_status`/`height_for_age_status` are
/// stored `NULL` until a verified table lands. Returns
/// `AppError::InvalidInput` for an unparseable sex, an invalid/
/// out-of-order date pair, or a non-positive height/weight -- validated
/// here before any DB write, not left to the `CHECK` constraints alone.
#[allow(clippy::too_many_arguments)]
pub fn record_measurement(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    school_year: &str,
    period: Period,
    grade_level: &str,
    sex: &str,
    birth_date: &str,
    measurement_date: &str,
    height_m: f64,
    weight_kg: f64,
) -> AppResult<NutritionRecord> {
    let parsed_sex = Sex::parse(sex)
        .ok_or_else(|| AppError::InvalidInput("unrecognized sex value".to_string()))?;
    let age_in_months =
        nutrition::age_in_months(birth_date, measurement_date).ok_or_else(|| {
            AppError::InvalidInput(
                "invalid birth date, measurement date, or measurement before birth".to_string(),
            )
        })?;
    let bmi = nutrition::compute_bmi(weight_kg, height_m)
        .ok_or_else(|| AppError::InvalidInput("invalid height or weight".to_string()))?;

    let nutritional_status = nutrition::lookup_bmi_cutoffs(age_in_months, parsed_sex)
        .map(|cutoffs| nutrition::classify_bmi_for_age(bmi, &cutoffs));
    let height_for_age_status = nutrition::lookup_hfa_cutoffs(age_in_months, parsed_sex)
        .map(|cutoffs| nutrition::classify_height_for_age(height_m, &cutoffs));

    let id = Uuid::now_v7().to_string();
    let sex_db = match parsed_sex {
        Sex::Male => "M",
        Sex::Female => "F",
    };
    conn.execute(
        "INSERT INTO nutrition_records \
            (id, school_id, learner_id, school_year, period, grade_level, sex, \
             birth_date, measurement_date, height_m, weight_kg, age_in_months, bmi, \
             nutritional_status, height_for_age_status) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        rusqlite::params![
            &id,
            school_id,
            learner_id,
            school_year,
            period.as_db_str(),
            grade_level,
            sex_db,
            birth_date,
            measurement_date,
            height_m,
            weight_kg,
            age_in_months,
            bmi,
            nutritional_status.map(status_to_db_str),
            height_for_age_status.map(hfa_status_to_db_str),
        ],
    )?;

    find_by_id(conn, school_id, &id)?.ok_or_else(|| {
        AppError::InvalidInput("nutrition record vanished immediately after insert".to_string())
    })
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<NutritionRecord> {
    Ok(NutritionRecord {
        id: row.get(0)?,
        school_id: row.get(1)?,
        learner_id: row.get(2)?,
        school_year: row.get(3)?,
        period: row.get(4)?,
        grade_level: row.get(5)?,
        sex: row.get(6)?,
        birth_date: row.get(7)?,
        measurement_date: row.get(8)?,
        height_m: row.get(9)?,
        weight_kg: row.get(10)?,
        age_in_months: row.get(11)?,
        bmi: row.get(12)?,
        nutritional_status: row.get(13)?,
        height_for_age_status: row.get(14)?,
        created_at: row.get(15)?,
    })
}

const SELECT_COLUMNS: &str = "id, school_id, learner_id, school_year, period, grade_level, sex, \
     birth_date, measurement_date, height_m, weight_kg, age_in_months, bmi, \
     nutritional_status, height_for_age_status, created_at";

pub fn find_by_id(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<NutritionRecord>> {
    let sql =
        format!("SELECT {SELECT_COLUMNS} FROM nutrition_records WHERE school_id = ?1 AND id = ?2");
    conn.query_row(&sql, (school_id, id), row_to_record)
        .optional()
        .map_err(AppError::from)
}

/// The learner's own record for one school year + period, if any --
/// tenant-scoped by `school_id`.
pub fn find_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    school_year: &str,
    period: Period,
) -> AppResult<Option<NutritionRecord>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM nutrition_records \
         WHERE school_id = ?1 AND learner_id = ?2 AND school_year = ?3 AND period = ?4"
    );
    conn.query_row(
        &sql,
        (school_id, learner_id, school_year, period.as_db_str()),
        row_to_record,
    )
    .optional()
    .map_err(AppError::from)
}

/// Every nutrition record captured for the whole school for one school
/// year + period -- the raw input `commands::nutrition`'s BOSY/EOSY
/// consolidation report reduces into `NutritionRecordSummary` rows.
pub fn list_for_school_year_period(
    conn: &Connection,
    school_id: &str,
    school_year: &str,
    period: Period,
) -> AppResult<Vec<NutritionRecord>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM nutrition_records \
         WHERE school_id = ?1 AND school_year = ?2 AND period = ?3 \
         ORDER BY grade_level, created_at"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map((school_id, school_year, period.as_db_str()), row_to_record)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Maps a persisted record into the pure-domain summary
/// `health::consolidation::consolidate_by_grade_level` expects. Skips a
/// record whose `sex` cannot be parsed (should be impossible given the
/// `CHECK` constraint, but this stays defensive rather than panicking)
/// or whose status strings fail to parse similarly.
pub fn to_consolidation_summary(record: &NutritionRecord) -> Option<NutritionRecordSummary> {
    let sex = Sex::parse(&record.sex)?;
    Some(NutritionRecordSummary {
        grade_level: record.grade_level.clone(),
        sex,
        nutritional_status: record
            .nutritional_status
            .as_deref()
            .and_then(status_from_db_str),
        height_for_age_status: record
            .height_for_age_status
            .as_deref()
            .and_then(hfa_status_from_db_str),
    })
}

/// One learner enrolled in the school for the given school year, for the
/// consolidation report's "Enrolment" columns -- built by
/// `commands::nutrition` from `repository::section`/`section_membership`
/// (this module owns only `nutrition_records`). Kept here purely as the
/// shared conversion helper both the command and its tests use.
pub fn to_enrollment_row(
    grade_level: &str,
    sex_raw: Option<&str>,
) -> Option<ConsolidationEnrollmentRow> {
    let sex = Sex::parse(sex_raw?)?;
    Some(ConsolidationEnrollmentRow {
        grade_level: grade_level.to_string(),
        sex,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn setup() -> Connection {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 's1', 'Juan', 'Dela Cruz')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn record_measurement_computes_age_and_bmi_and_persists() {
        let conn = setup();
        let record = record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "M",
            "2020-06-15",
            "2026-06-20",
            1.10,
            18.5,
        )
        .unwrap();

        assert_eq!(record.age_in_months, 72);
        assert!((record.bmi - 15.29).abs() < f64::EPSILON);
        assert_eq!(record.sex, "M");
        // No verified WHO table yet -- classification must stay unset,
        // never a guessed value.
        assert_eq!(record.nutritional_status, None);
        assert_eq!(record.height_for_age_status, None);
    }

    #[test]
    fn record_measurement_rejects_an_unrecognized_sex() {
        let conn = setup();
        let result = record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "X",
            "2020-06-15",
            "2026-06-20",
            1.10,
            18.5,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn record_measurement_rejects_a_measurement_date_before_birth() {
        let conn = setup();
        let result = record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "M",
            "2026-06-20",
            "2020-06-15",
            1.10,
            18.5,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn record_measurement_rejects_nonpositive_height() {
        let conn = setup();
        let result = record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "M",
            "2020-06-15",
            "2026-06-20",
            0.0,
            18.5,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn find_for_learner_is_tenant_scoped() {
        let conn = setup();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s2', 'Other School')",
            [],
        )
        .unwrap();
        record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "M",
            "2020-06-15",
            "2026-06-20",
            1.10,
            18.5,
        )
        .unwrap();

        let found = find_for_learner(&conn, "s1", "l1", "2026-2027", Period::Bosy).unwrap();
        assert!(found.is_some());

        // Same learner id, wrong school scope -- must not leak across
        // tenants even though the row's learner_id string matches.
        let cross_tenant = find_for_learner(&conn, "s2", "l1", "2026-2027", Period::Bosy).unwrap();
        assert!(cross_tenant.is_none());
    }

    #[test]
    fn list_for_school_year_period_returns_only_matching_rows() {
        let conn = setup();
        record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Bosy,
            "5",
            "M",
            "2020-06-15",
            "2026-06-20",
            1.10,
            18.5,
        )
        .unwrap();
        record_measurement(
            &conn,
            "s1",
            "l1",
            "2026-2027",
            Period::Eosy,
            "5",
            "M",
            "2020-06-15",
            "2027-03-15",
            1.15,
            20.0,
        )
        .unwrap();

        let bosy = list_for_school_year_period(&conn, "s1", "2026-2027", Period::Bosy).unwrap();
        assert_eq!(bosy.len(), 1);
        assert_eq!(bosy[0].period, "BOSY");
    }

    #[test]
    fn period_parse_accepts_known_values_case_insensitively() {
        assert_eq!(Period::parse("bosy"), Some(Period::Bosy));
        assert_eq!(Period::parse("EOSY"), Some(Period::Eosy));
        assert_eq!(Period::parse("midyear"), None);
    }

    #[test]
    fn to_enrollment_row_skips_an_unparseable_sex() {
        assert!(to_enrollment_row("5", Some("Other")).is_none());
        assert!(to_enrollment_row("5", None).is_none());
        assert!(to_enrollment_row("5", Some("M")).is_some());
    }
}
