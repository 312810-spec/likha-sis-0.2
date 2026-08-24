use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;

/// A named, versioned grading-period structure with its own source
/// citation — see migration 6's comment and
/// `docs/adr/0010-grading-period-foundation.md` for why this is
/// policy-driven reference data rather than a hardcoded set of DepEd
/// quarters: DepEd's own terminology has genuinely changed within this
/// project's lifetime (DepEd Order No. 9, s. 2026).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GradingPolicy {
    pub id: String,
    pub name: String,
    pub source_citation: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GradingPolicyPeriod {
    pub id: String,
    pub policy_id: String,
    pub sequence: i64,
    pub label: String,
}

/// A school's actual grading period for one school year — a policy
/// period's fixed label, instantiated with school-entered dates. This
/// app has no source for any individual school's real calendar, so
/// `starts_on`/`ends_on` are never defaulted or guessed.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GradingPeriod {
    pub id: String,
    pub school_id: String,
    pub school_year: String,
    pub policy_period_id: String,
    pub label: String,
    pub starts_on: String,
    pub ends_on: String,
    pub created_at: String,
}

/// Reference data, not school-scoped — every school sees the same set of
/// DepEd-sourced policies. Ordered by `is_default DESC` so the current
/// default policy is always first.
pub fn list_policies(conn: &Connection) -> AppResult<Vec<GradingPolicy>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, source_citation, is_default, created_at \
         FROM grading_policies ORDER BY is_default DESC, name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(GradingPolicy {
            id: row.get(0)?,
            name: row.get(1)?,
            source_citation: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_periods_for_policy(
    conn: &Connection,
    policy_id: &str,
) -> AppResult<Vec<GradingPolicyPeriod>> {
    let mut stmt = conn.prepare(
        "SELECT id, policy_id, sequence, label \
         FROM grading_policy_periods WHERE policy_id = ?1 ORDER BY sequence",
    )?;
    let rows = stmt.query_map([policy_id], |row| {
        Ok(GradingPolicyPeriod {
            id: row.get(0)?,
            policy_id: row.get(1)?,
            sequence: row.get(2)?,
            label: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Creates a grading period for `school_id`/`school_year`, instantiating
/// `policy_period_id` (a fixed reference-data id, not school-scoped
/// itself) with school-entered dates. Returns `Ok(None)` if
/// `policy_period_id` doesn't resolve to any known policy period — the
/// same "don't distinguish not-found from foreign" convention as every
/// other create path in this codebase, even though policy periods aren't
/// school-scoped (there's nothing to leak, but the shape stays
/// consistent). The `CHECK (starts_on <= ends_on)` constraint and the
/// `UNIQUE (school_id, school_year, policy_period_id)` constraint (no
/// duplicate period for the same school year) are enforced by the schema
/// itself, not re-checked here — see migration 6.
pub fn create(
    conn: &Connection,
    school_id: &str,
    school_year: &str,
    policy_period_id: &str,
    starts_on: &str,
    ends_on: &str,
) -> AppResult<Option<GradingPeriod>> {
    let period_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM grading_policy_periods WHERE id = ?1)",
        [policy_period_id],
        |row| row.get(0),
    )?;
    if !period_exists {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO grading_periods \
             (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&id, school_id, school_year, policy_period_id, starts_on, ends_on),
    )?;

    find_by_id_in_school(conn, school_id, &id)
}

/// The school-scoped lookup safe to expose as a command: a caller can only
/// ever resolve a grading period within the school they explicitly ask
/// about. Also used by `class_record::create` to verify a grading period
/// belongs to the school before a class record can reference it.
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<GradingPeriod>> {
    conn.query_row(
        "SELECT gp.id, gp.school_id, gp.school_year, gp.policy_period_id, \
                pp.label, gp.starts_on, gp.ends_on, gp.created_at \
         FROM grading_periods gp \
         JOIN grading_policy_periods pp ON pp.id = gp.policy_period_id \
         WHERE gp.id = ?1 AND gp.school_id = ?2",
        (id, school_id),
        row_to_grading_period,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Only returns `school_id`'s own grading periods for `school_year` —
/// isolation enforced in the query, matching `section::list_by_school`.
pub fn list_by_school_year(
    conn: &Connection,
    school_id: &str,
    school_year: &str,
) -> AppResult<Vec<GradingPeriod>> {
    let mut stmt = conn.prepare(
        "SELECT gp.id, gp.school_id, gp.school_year, gp.policy_period_id, \
                pp.label, gp.starts_on, gp.ends_on, gp.created_at \
         FROM grading_periods gp \
         JOIN grading_policy_periods pp ON pp.id = gp.policy_period_id \
         WHERE gp.school_id = ?1 AND gp.school_year = ?2 \
         ORDER BY pp.sequence",
    )?;
    let rows = stmt.query_map((school_id, school_year), row_to_grading_period)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_grading_period(row: &rusqlite::Row) -> rusqlite::Result<GradingPeriod> {
    Ok(GradingPeriod {
        id: row.get(0)?,
        school_id: row.get(1)?,
        school_year: row.get(2)?,
        policy_period_id: row.get(3)?,
        label: row.get(4)?,
        starts_on: row.get(5)?,
        ends_on: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    const THREE_TERM_POLICY: &str = "00000000-0000-7000-8000-000000000001";
    const FOUR_QUARTER_POLICY: &str = "00000000-0000-7000-8000-000000000002";
    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";

    #[test]
    fn list_policies_returns_the_two_seeded_policies_with_default_first() {
        let conn = open_test_db();

        let policies = list_policies(&conn).unwrap();

        assert_eq!(policies.len(), 2);
        assert!(policies[0].is_default);
        assert_eq!(policies[0].name, "DepEd Three-Term School Calendar");
    }

    #[test]
    fn list_periods_for_policy_returns_the_three_terms_in_order() {
        let conn = open_test_db();

        let periods = list_periods_for_policy(&conn, THREE_TERM_POLICY).unwrap();

        let labels: Vec<&str> = periods.iter().map(|p| p.label.as_str()).collect();
        assert_eq!(labels, vec!["1st Term", "2nd Term", "3rd Term"]);
    }

    #[test]
    fn list_periods_for_policy_returns_the_four_quarters_for_the_legacy_policy() {
        let conn = open_test_db();

        let periods = list_periods_for_policy(&conn, FOUR_QUARTER_POLICY).unwrap();

        assert_eq!(periods.len(), 4);
    }

    #[test]
    fn create_then_list_round_trips_with_the_correct_label() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let created = create(&conn, &s.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
            .unwrap()
            .unwrap();
        assert_eq!(created.label, "1st Term");

        let periods = list_by_school_year(&conn, &s.id, "2026-2027").unwrap();
        assert_eq!(periods, vec![created]);
    }

    #[test]
    fn create_rejects_an_unknown_policy_period_id() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let result = create(&conn, &s.id, "2026-2027", "does-not-exist", "2026-06-08", "2026-09-15")
            .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_an_end_date_before_the_start_date() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let result = create(&conn, &s.id, "2026-2027", TERM_1, "2026-09-15", "2026-06-08");

        assert!(result.is_err());
    }

    #[test]
    fn create_rejects_a_duplicate_period_for_the_same_school_year() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(&conn, &s.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15").unwrap();

        let result = create(&conn, &s.id, "2026-2027", TERM_1, "2026-06-10", "2026-09-20");

        assert!(result.is_err(), "the same period must not be entered twice for one school year");
    }

    #[test]
    fn list_by_school_year_does_not_include_another_schools_periods() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        create(&conn, &school_a.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15").unwrap();

        let periods = list_by_school_year(&conn, &school_b.id, "2026-2027").unwrap();

        assert!(periods.is_empty());
    }

    #[test]
    fn list_by_school_year_does_not_include_a_different_school_year() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(&conn, &s.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15").unwrap();

        let periods = list_by_school_year(&conn, &s.id, "2025-2026").unwrap();

        assert!(periods.is_empty());
    }
}
