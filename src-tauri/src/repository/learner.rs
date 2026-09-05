use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

/// `Deserialize` exists for `commands::learner`'s ADR-0067/0069 sync
/// wiring, which round-trips a `Learner` through JSON as the (encrypted)
/// outbox payload -- not needed by the Tauri IPC boundary itself, which
/// only ever serializes this struct outbound to the frontend. A
/// deliberately simple wire format for this first payload; a real
/// materializer may need a more considered schema later.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

/// Applies a decrypted sync payload for this entity kind (ADR-0067/0069's
/// pull-side materialization). `learner` is the already-decrypted,
/// already-authenticated (AES-GCM tag verified) contents of an
/// `AcceptedChange` -- this function trusts it completely, the same way
/// `create`/`update` trust their own direct String/Option<&str> arguments;
/// `sync_client::pull_once` is responsible for having decrypted the
/// payload and rejected a tampered one BEFORE ever calling this. Deliberate
/// `INSERT ... ON CONFLICT(id) DO UPDATE`, not a separate insert-or-update
/// branch: an id this device has never seen locally (the common case --
/// most learners are created on a different device) and an id this device
/// already has a stale copy of (this device pulled an earlier version of
/// the same learner before) are the same write here, by design -- unlike
/// `update`, there is no "no such learner in this school" outcome to
/// distinguish, because a `PendingChange` this device chose to apply (see
/// `pull_once`'s conflict check) is, by definition, not something this
/// device disputes owning.
pub fn upsert_from_sync(conn: &Connection, learner: &Learner) -> AppResult<()> {
    conn.execute(
        "INSERT INTO learners (id, school_id, given_name, family_name, lrn, sex, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
             school_id = excluded.school_id,
             given_name = excluded.given_name,
             family_name = excluded.family_name,
             lrn = excluded.lrn,
             sex = excluded.sex",
        (
            &learner.id,
            &learner.school_id,
            &learner.given_name,
            &learner.family_name,
            &learner.lrn,
            &learner.sex,
            &learner.created_at,
        ),
    )?;
    Ok(())
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

/// Typed result of `create_with_duplicate_check` — see that function's doc
/// comment. Mirrors the house pattern used by other write commands with
/// more than one legitimate outcome (e.g. `CorrectPlacementOutcome`,
/// `EnrollOutcome`) rather than surfacing a raw DB error for the
/// conflict case.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CreateLearnerOutcome {
    Created {
        learner: Learner,
    },
    /// The entered LRN exactly matches a different learner already in
    /// this school. Never overridable by `confirmed` -- an LRN is
    /// DepEd's own stable per-learner identifier (see ADR-0017) and the
    /// `learners` table's own unique index already treats this as a hard
    /// rule; this variant exists so the conflict surfaces as a typed
    /// result instead of a raw constraint-violation error.
    LrnConflict {
        existing: Learner,
    },
    /// One or more learners already in this school share this name (or,
    /// with no exact-LRN hit, this LRN) closely enough to warrant a
    /// human look before creating a new record -- never auto-blocked.
    /// Call again with `confirmed: true` to create anyway.
    DuplicateCandidates {
        candidates: Vec<Learner>,
    },
}

/// Wraps `create` with the same deterministic, school-scoped candidate
/// check `find_candidates` already provides to SF1 import (Wave 2C) --
/// reused here rather than re-implemented, per
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`'s
/// "Deferred" section, which left exactly this manual-creation warning
/// for a later milestone. Deliberately does not reuse
/// `import::matching::classify_row`: that function's `MatchKind::ExactLrn`
/// is *soft* there (SF1 import auto-resolves it to "use existing"), while
/// a manual duplicate LRN must be a *hard*, non-overridable conflict here
/// -- the two callers need different policy on the same underlying
/// query, not a shared enum whose meaning would have to change per
/// caller. Reusing `find_candidates` (the actual matching engine) while
/// keeping the two policies separate avoids a second competing
/// detection engine without blurring either call site's guarantees.
///
/// `confirmed` distinguishes an initial submission (`false`) from a
/// teacher's explicit "create separate learner anyway" (`true`) after
/// reviewing `DuplicateCandidates`. Candidates are always re-fetched
/// fresh on every call (never trusting a caller-supplied list from an
/// earlier response), so a `confirmed: true` call still atomically
/// re-checks the hard LRN-conflict rule against the database's current
/// state -- catching a conflict that appeared after the first check --
/// while a soft `DuplicateCandidates` warning, once explicitly
/// confirmed, does not re-block on a shifted candidate set.
pub fn create_with_duplicate_check(
    conn: &Connection,
    school_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
    sex: Option<&str>,
    confirmed: bool,
) -> AppResult<CreateLearnerOutcome> {
    let candidates = find_candidates(conn, school_id, given_name, family_name, lrn)?;

    if let Some(lrn_value) = lrn {
        if let Some(exact) = candidates
            .iter()
            .find(|c| c.lrn.as_deref() == Some(lrn_value))
        {
            return Ok(CreateLearnerOutcome::LrnConflict {
                existing: exact.clone(),
            });
        }
    }

    if !candidates.is_empty() && !confirmed {
        return Ok(CreateLearnerOutcome::DuplicateCandidates { candidates });
    }

    let learner = create(conn, school_id, given_name, family_name, lrn, sex)?;
    Ok(CreateLearnerOutcome::Created { learner })
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
    use uuid::Uuid;

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
    fn upsert_from_sync_inserts_a_learner_this_device_has_never_seen() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let incoming = Learner {
            id: Uuid::now_v7().to_string(),
            school_id: s.id.clone(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: Some("123456789012".to_string()),
            sex: Some("F".to_string()),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };

        upsert_from_sync(&conn, &incoming).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &incoming.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.given_name, "Ana");
        assert_eq!(found.lrn.as_deref(), Some("123456789012"));
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let original = create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let updated = Learner {
            given_name: "Anna".to_string(),
            family_name: "Cruz-Reyes".to_string(),
            lrn: Some("987654321098".to_string()),
            sex: Some("F".to_string()),
            ..original.clone()
        };

        upsert_from_sync(&conn, &updated).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &original.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.given_name, "Anna");
        assert_eq!(found.family_name, "Cruz-Reyes");
        assert_eq!(found.lrn.as_deref(), Some("987654321098"));
        let count: i64 = conn
            .query_row("SELECT count(*) FROM learners", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1, "an update must never insert a second row");
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
    fn create_with_duplicate_check_creates_immediately_when_there_is_no_overlap() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let outcome =
            create_with_duplicate_check(&conn, &s.id, "Juan", "Dela Cruz", None, None, false)
                .unwrap();

        match outcome {
            CreateLearnerOutcome::Created { learner } => {
                assert_eq!(learner.given_name, "Juan");
            }
            other => panic!("expected Created, got {other:?}"),
        }
        assert_eq!(list_by_school(&conn, &s.id).unwrap().len(), 1);
    }

    #[test]
    fn create_with_duplicate_check_warns_without_creating_when_the_name_matches() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();

        let outcome =
            create_with_duplicate_check(&conn, &s.id, "Grace", "Torres", None, None, false)
                .unwrap();

        assert_eq!(
            outcome,
            CreateLearnerOutcome::DuplicateCandidates {
                candidates: vec![existing]
            }
        );
        assert_eq!(
            list_by_school(&conn, &s.id).unwrap().len(),
            1,
            "must not create a second record while the warning is unresolved"
        );
    }

    #[test]
    fn create_with_duplicate_check_creates_when_confirmed_despite_a_name_match() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(&conn, &s.id, "Grace", "Torres", None, None).unwrap();

        let outcome =
            create_with_duplicate_check(&conn, &s.id, "Grace", "Torres", None, None, true).unwrap();

        assert!(matches!(outcome, CreateLearnerOutcome::Created { .. }));
        assert_eq!(
            list_by_school(&conn, &s.id).unwrap().len(),
            2,
            "an explicitly confirmed separate learner must be created"
        );
    }

    #[test]
    fn create_with_duplicate_check_blocks_an_exact_lrn_conflict_even_when_confirmed() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = create(&conn, &s.id, "Grace", "Torres", Some("123456789012"), None).unwrap();

        let outcome = create_with_duplicate_check(
            &conn,
            &s.id,
            "Different",
            "Person",
            Some("123456789012"),
            None,
            true,
        )
        .unwrap();

        assert_eq!(outcome, CreateLearnerOutcome::LrnConflict { existing });
        assert_eq!(
            list_by_school(&conn, &s.id).unwrap().len(),
            1,
            "an exact LRN conflict must never be overridable, even when confirmed"
        );
    }

    #[test]
    fn create_with_duplicate_check_blocks_an_exact_lrn_conflict_when_unconfirmed() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = create(&conn, &s.id, "Grace", "Torres", Some("123456789012"), None).unwrap();

        let outcome = create_with_duplicate_check(
            &conn,
            &s.id,
            "Different",
            "Person",
            Some("123456789012"),
            None,
            false,
        )
        .unwrap();

        assert_eq!(outcome, CreateLearnerOutcome::LrnConflict { existing });
    }

    #[test]
    fn create_with_duplicate_check_never_flags_a_different_schools_learner() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let other = school::create(&conn, "Other School").unwrap();
        create(
            &conn,
            &other.id,
            "Grace",
            "Torres",
            Some("123456789012"),
            None,
        )
        .unwrap();

        let outcome = create_with_duplicate_check(
            &conn,
            &s.id,
            "Grace",
            "Torres",
            Some("123456789012"),
            None,
            false,
        )
        .unwrap();

        assert!(matches!(outcome, CreateLearnerOutcome::Created { .. }));
    }

    #[test]
    fn create_with_duplicate_check_rechecks_state_and_catches_a_conflict_that_appeared_after_the_first_check(
    ) {
        // Simulates the "stale candidate" scenario: a first call surfaces
        // no conflict, then a different LRN write lands before the
        // teacher's confirmed retry -- the confirmed call must still
        // re-run the check against current state, not trust the earlier
        // result.
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let first = create_with_duplicate_check(
            &conn,
            &s.id,
            "Juan",
            "Dela Cruz",
            Some("123456789012"),
            None,
            false,
        )
        .unwrap();
        assert!(matches!(first, CreateLearnerOutcome::Created { .. }));

        // A second, unrelated submission for the same LRN arrives before
        // any "confirmed" retry of a *different* duplicate warning would
        // occur -- re-using the same LRN must still be caught.
        let second = create_with_duplicate_check(
            &conn,
            &s.id,
            "Maria",
            "Santos",
            Some("123456789012"),
            None,
            true,
        )
        .unwrap();

        assert!(matches!(second, CreateLearnerOutcome::LrnConflict { .. }));
        assert_eq!(list_by_school(&conn, &s.id).unwrap().len(), 1);
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
