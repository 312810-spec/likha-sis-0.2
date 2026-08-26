use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Learner {
    pub id: String,
    pub school_id: String,
    pub given_name: String,
    pub family_name: String,
    /// DepEd's national Learner Reference Number, 12 digits. `None` for a
    /// learner not yet given one (enrolled before this field existed, or
    /// simply not yet recorded) -- see migration 13's own comment and
    /// `docs/adr/0017-learner-reference-number-and-sex.md` for why this
    /// field and `sex` exist but birthdate/guardian contact do not: both
    /// are required by this app's own already-shipped SF2/report-card
    /// exports, verified against DepEd's actual official templates,
    /// rather than added speculatively. Format (exactly 12 digits) and
    /// per-school uniqueness are enforced by the database, not just here.
    pub lrn: Option<String>,
    /// DepEd's own two-value Sex field ('M'/'F'), required by SF2's
    /// per-learner roster and its gender-based dropout/transfer
    /// statistics. `None` when not yet recorded.
    pub sex: Option<String>,
    pub created_at: String,
}

pub fn create(
    conn: &Connection,
    school_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
    sex: Option<&str>,
) -> AppResult<Learner> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO learners (id, school_id, given_name, family_name, lrn, sex) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&id, school_id, given_name, family_name, lrn, sex),
    )?;
    find_by_id(conn, &id).map(|l| l.expect("row just inserted must exist"))
}

/// Not school-scoped and intentionally module-private: this exists only to
/// read back a row this module just wrote (see `create`). Do not expose it
/// as a Tauri command or call it with a caller-supplied id — that would let
/// one school read another school's learner by guessing/enumerating ids.
fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<Learner>> {
    conn.query_row(
        "SELECT id, school_id, given_name, family_name, lrn, sex, created_at \
         FROM learners WHERE id = ?1",
        [id],
        row_to_learner,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Returns only the learners belonging to `school_id`. Callers must never
/// fetch all learners and filter client-side — isolation is enforced here,
/// at the query, not by hiding rows in the UI.
pub fn list_by_school(conn: &Connection, school_id: &str) -> AppResult<Vec<Learner>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, given_name, family_name, lrn, sex, created_at \
         FROM learners WHERE school_id = ?1 ORDER BY family_name, given_name",
    )?;
    let rows = stmt.query_map([school_id], row_to_learner)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The school-scoped counterpart to the private `find_by_id`: safe to
/// expose as a command, because a caller can only ever look up a learner
/// within the school they explicitly ask about — never any school's
/// records by id alone. Returns `None` both when no learner has this id
/// and when it belongs to a different school; the two are
/// indistinguishable on purpose (see `update`'s doc comment).
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Option<Learner>> {
    conn.query_row(
        "SELECT id, school_id, given_name, family_name, lrn, sex, created_at \
         FROM learners WHERE id = ?1 AND school_id = ?2",
        (learner_id, school_id),
        row_to_learner,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Updates a learner's name, scoped to `school_id` in the same statement
/// as the lookup — not as a separate check-then-update. This is what
/// makes it impossible for a caller who somehow obtained another school's
/// learner id (e.g. by guessing a UUID) to modify that record: the
/// `WHERE` clause itself excludes it, so the statement simply matches
/// zero rows rather than ever touching them. Returns `None` for "no such
/// learner in this school," never distinguishing "doesn't exist" from
/// "exists in a different school."
pub fn update(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
    sex: Option<&str>,
) -> AppResult<Option<Learner>> {
    let rows_affected = conn.execute(
        "UPDATE learners SET given_name = ?1, family_name = ?2, lrn = ?3, sex = ?4 \
         WHERE id = ?5 AND school_id = ?6",
        (given_name, family_name, lrn, sex, learner_id, school_id),
    )?;
    if rows_affected == 0 {
        return Ok(None);
    }
    find_by_id_in_school(conn, school_id, learner_id)
}

/// Learners in `school_id` that might be the same person as one described
/// by `given_name`/`family_name`/`lrn` -- for a Registrar to compare before
/// creating a new record, never to auto-merge. Matches on an exact LRN (a
/// stable, DepEd-issued identifier -- see ADR-0017) OR a case-insensitive,
/// trimmed exact name match. Deliberately no fuzzy/phonetic matching
/// (punctuation, middle names, Filipino naming conventions) -- see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`'s "Deferred"
/// section for why that's left to the SF1 import milestone, not guessed at
/// here. Always school-scoped, so a shared LRN or name in a different
/// school (a real, legitimate possibility) is never returned as a false
/// duplicate.
pub fn find_candidates(
    conn: &Connection,
    school_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
) -> AppResult<Vec<Learner>> {
    let trimmed_given = given_name.trim();
    let trimmed_family = family_name.trim();
    let mut stmt = conn.prepare(
        "SELECT id, school_id, given_name, family_name, lrn, sex, created_at \
         FROM learners \
         WHERE school_id = ?1 \
           AND ( \
             (?2 IS NOT NULL AND lrn = ?2) \
             OR (trim(given_name) = ?3 COLLATE NOCASE AND trim(family_name) = ?4 COLLATE NOCASE) \
           ) \
         ORDER BY family_name, given_name",
    )?;
    let rows = stmt.query_map(
        (school_id, lrn, trimmed_given, trimmed_family),
        row_to_learner,
    )?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_learner(row: &rusqlite::Row) -> rusqlite::Result<Learner> {
    Ok(Learner {
        id: row.get(0)?,
        school_id: row.get(1)?,
        given_name: row.get(2)?,
        family_name: row.get(3)?,
        lrn: row.get(4)?,
        sex: row.get(5)?,
        created_at: row.get(6)?,
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

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let created = create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();
        let found = find_by_id(&conn, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn create_rejects_unknown_school() {
        let conn = open_test_db();

        let result = create(&conn, "missing-school", "Juan", "Dela Cruz", None, None);

        assert!(result.is_err());
    }

    #[test]
    fn find_by_id_in_school_returns_the_learner_for_the_correct_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let created = create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_a_learner_in_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let learner = create(&conn, &school_a.id, "Juan", "Dela Cruz", None, None).unwrap();

        let found = find_by_id_in_school(&conn, &school_b.id, &learner.id).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_an_unknown_id() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        assert_eq!(
            find_by_id_in_school(&conn, &s.id, "does-not-exist").unwrap(),
            None
        );
    }

    #[test]
    fn update_changes_the_name_within_the_correct_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let created = create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();

        let updated = update(&conn, &s.id, &created.id, "Juana", "Dela Cruz", None, None).unwrap();

        assert_eq!(
            updated,
            Some(Learner {
                given_name: "Juana".to_string(),
                ..created
            })
        );
    }

    #[test]
    fn update_sets_lrn_and_sex() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let created = create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();

        let updated = update(
            &conn,
            &s.id,
            &created.id,
            "Juan",
            "Dela Cruz",
            Some("123456789012"),
            Some("M"),
        )
        .unwrap();

        assert_eq!(
            updated,
            Some(Learner {
                lrn: Some("123456789012".to_string()),
                sex: Some("M".to_string()),
                ..created
            })
        );
    }

    #[test]
    fn find_candidates_matches_an_exact_lrn() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = create(
            &conn,
            &s.id,
            "Juan",
            "Dela Cruz",
            Some("123456789012"),
            None,
        )
        .unwrap();

        let candidates =
            find_candidates(&conn, &s.id, "Different", "Name", Some("123456789012")).unwrap();

        assert_eq!(candidates, vec![existing]);
    }

    #[test]
    fn find_candidates_matches_the_same_name_case_and_whitespace_insensitively() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();

        let candidates = find_candidates(&conn, &s.id, "  juan ", " DELA CRUZ ", None).unwrap();

        assert_eq!(candidates, vec![existing]);
    }

    #[test]
    fn find_candidates_never_returns_another_schools_learner() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let other = school::create(&conn, "Other School").unwrap();
        create(
            &conn,
            &other.id,
            "Juan",
            "Dela Cruz",
            Some("123456789012"),
            None,
        )
        .unwrap();

        let candidates =
            find_candidates(&conn, &s.id, "Juan", "Dela Cruz", Some("123456789012")).unwrap();

        assert_eq!(candidates, Vec::new());
    }

    #[test]
    fn find_candidates_returns_none_for_a_genuinely_new_learner() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();

        let candidates = find_candidates(&conn, &s.id, "Maria", "Santos", None).unwrap();

        assert_eq!(candidates, Vec::new());
    }

    #[test]
    fn create_rejects_an_lrn_already_used_by_another_learner_in_the_same_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(
            &conn,
            &s.id,
            "Juan",
            "Dela Cruz",
            Some("123456789012"),
            None,
        )
        .unwrap();

        let result = create(&conn, &s.id, "Maria", "Santos", Some("123456789012"), None);

        assert!(result.is_err());
    }

    #[test]
    fn update_does_not_affect_a_learner_in_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let learner = create(&conn, &school_a.id, "Juan", "Dela Cruz", None, None).unwrap();

        let result = update(
            &conn,
            &school_b.id,
            &learner.id,
            "Someone",
            "Else",
            None,
            None,
        )
        .unwrap();

        assert_eq!(result, None);
        // The original learner, in its real school, is untouched.
        let unchanged = find_by_id_in_school(&conn, &school_a.id, &learner.id).unwrap();
        assert_eq!(unchanged, Some(learner));
    }

    #[test]
    fn update_returns_none_for_an_unknown_learner_id() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let result = update(
            &conn,
            &s.id,
            "does-not-exist",
            "Someone",
            "Else",
            None,
            None,
        )
        .unwrap();

        assert_eq!(result, None);
    }
}
