//! Wave 2Q — real two-connection concurrency proofs for the membership
//! write verbs (`enroll_membership`, `transfer_membership`,
//! `end_membership`). See `docs/adr/0042-*` Wave 2Q addendum.
//!
//! `tests/enrollment.rs` uses `:memory:`, where each `Connection` is a
//! *private* database — useless for a race. This file opens a real
//! SQLCipher file with `db::open` and holds two independent connections to
//! it with the same key, the same pattern `tests/bootstrap.rs` established
//! for the first-run singleton race.
//!
//! Findings this file pins:
//!
//! * When two connections start from the same eligible state and both
//!   attempt an incompatible membership write, **exactly one commits**.
//!   The unique index `idx_one_active_membership_per_learner` and WAL
//!   snapshot isolation together guarantee the other cannot also commit —
//!   it fails either with a typed conflict (`AlreadyEnrolled` /
//!   `NotCurrent`) or, if its snapshot went stale mid-transaction, with a
//!   clean `SQLITE_BUSY_SNAPSHOT` rollback that writes **nothing partial**.
//! * Retrying the loser from a *refreshed* connection is deterministic: it
//!   returns the correct typed outcome, not a "database busy" error, and
//!   never a second overlapping membership.
//! * In the shipping app all in-process writes are serialised by
//!   `Mutex<Connection>` (see `commands::lock_db`), so the stale-snapshot
//!   path is not reachable there; these tests exercise the raw
//!   worse-than-production case anyway.

use app_lib::repository::{learner, school, section, section_membership};

const KEY_MSG: &str = "opening the same encrypted file twice with the same key must succeed";

struct Fixture {
    _dir: tempfile::TempDir,
    path: std::path::PathBuf,
    key: [u8; app_lib::crypto::KEY_LEN],
    school_id: String,
    section_a: String,
    section_b: String,
    section_c: String,
    learner_id: String,
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("enrollment-race.db");
    let key = app_lib::crypto::generate_key();

    let conn = app_lib::db::open(&path, &key).expect(KEY_MSG);
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let a = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
    let b = section::create(&conn, &s.id, "2026-2027", "7", "Rizal").unwrap();
    let c = section::create(&conn, &s.id, "2026-2027", "7", "Bonifacio").unwrap();
    let l = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();

    Fixture {
        _dir: dir,
        path,
        key,
        school_id: s.id,
        section_a: a.id,
        section_b: b.id,
        section_c: c.id,
        learner_id: l.id,
    }
}

fn open_conn(fx: &Fixture) -> rusqlite::Connection {
    app_lib::db::open(&fx.path, &fx.key).expect(KEY_MSG)
}

fn open_membership_count(conn: &rusqlite::Connection, learner_id: &str) -> i64 {
    conn.query_row(
        "SELECT count(*) FROM section_memberships WHERE learner_id = ?1 AND ends_on IS NULL",
        [learner_id],
        |row| row.get(0),
    )
    .unwrap()
}

fn total_membership_rows(conn: &rusqlite::Connection, learner_id: &str) -> i64 {
    conn.query_row(
        "SELECT count(*) FROM section_memberships WHERE learner_id = ?1",
        [learner_id],
        |row| row.get(0),
    )
    .unwrap()
}

#[test]
fn two_connections_enrolling_the_same_unenrolled_learner_commit_exactly_one_membership() {
    let fx = fixture();
    let mut conn_a = open_conn(&fx);
    let mut conn_b = open_conn(&fx);

    // Both connections observe the learner as unenrolled.
    assert_eq!(open_membership_count(&conn_a, &fx.learner_id), 0);
    assert_eq!(open_membership_count(&conn_b, &fx.learner_id), 0);

    // A wins the race and fully commits.
    let out_a = section_membership::enroll_membership(
        &mut conn_a,
        &fx.school_id,
        &fx.learner_id,
        &fx.section_a,
        "2026-08-24",
    )
    .unwrap();
    assert!(matches!(
        out_a,
        section_membership::EnrollOutcome::Enrolled { .. }
    ));

    // B now attempts the same enrolment from its own fresh transaction.
    // Its SELECT sees A's committed row, so it loses *logically* with a
    // typed conflict — never a duplicate membership, never a raw error.
    let out_b = section_membership::enroll_membership(
        &mut conn_b,
        &fx.school_id,
        &fx.learner_id,
        &fx.section_b,
        "2026-08-24",
    )
    .unwrap();
    match out_b {
        section_membership::EnrollOutcome::AlreadyEnrolled {
            current_section_id, ..
        } => assert_eq!(current_section_id, fx.section_a),
        other => panic!("expected AlreadyEnrolled, got {other:?}"),
    }

    let checker = open_conn(&fx);
    assert_eq!(
        open_membership_count(&checker, &fx.learner_id),
        1,
        "exactly one open membership after the race"
    );
    assert_eq!(
        total_membership_rows(&checker, &fx.learner_id),
        1,
        "no partial second row was left behind"
    );
}

#[test]
fn a_stale_snapshot_enrolment_fails_cleanly_and_retry_from_a_fresh_connection_is_deterministic() {
    let fx = fixture();
    let mut conn_a = open_conn(&fx);
    let mut conn_b = open_conn(&fx);

    // B pins a read snapshot in which the learner is still unenrolled.
    let tx_b = conn_b.transaction().unwrap();
    let seen: i64 = tx_b
        .query_row(
            "SELECT count(*) FROM section_memberships WHERE learner_id = ?1 AND ends_on IS NULL",
            [&fx.learner_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(seen, 0, "B's snapshot sees no membership yet");

    // A enrols and commits while B holds its snapshot.
    section_membership::enroll_membership(
        &mut conn_a,
        &fx.school_id,
        &fx.learner_id,
        &fx.section_a,
        "2026-08-24",
    )
    .unwrap();

    // B now tries to write the membership row its stale snapshot thinks is
    // safe. WAL refuses to promote the outdated snapshot: a clean
    // SQLITE_BUSY_SNAPSHOT, no partial row.
    let write = tx_b.execute(
        "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
         VALUES ('b-stale', ?1, ?2, ?3, '2026-08-24')",
        (&fx.school_id, &fx.section_b, &fx.learner_id),
    );
    assert!(
        write.is_err(),
        "a stale-snapshot write must fail, not silently overwrite"
    );
    drop(tx_b);

    let checker = open_conn(&fx);
    assert_eq!(open_membership_count(&checker, &fx.learner_id), 1);
    assert_eq!(total_membership_rows(&checker, &fx.learner_id), 1);

    // Retry from a refreshed connection: deterministic typed outcome, not
    // a busy error.
    let retry = section_membership::enroll_membership(
        &mut conn_b,
        &fx.school_id,
        &fx.learner_id,
        &fx.section_b,
        "2026-08-24",
    )
    .unwrap();
    assert!(matches!(
        retry,
        section_membership::EnrollOutcome::AlreadyEnrolled { .. }
    ));
}

#[test]
fn two_connections_transferring_the_same_membership_commit_exactly_one_transfer() {
    let fx = fixture();
    let setup = open_conn(&fx);
    let m_a = section_membership::enroll(
        &setup,
        &fx.school_id,
        &fx.section_a,
        &fx.learner_id,
        "2026-08-24",
    )
    .unwrap()
    .unwrap();
    drop(setup);

    let mut conn_a = open_conn(&fx);
    let mut conn_b = open_conn(&fx);

    // A transfers A -> B and commits.
    let out_a = section_membership::transfer_membership(
        &mut conn_a,
        &fx.school_id,
        &fx.learner_id,
        &m_a.id,
        &fx.section_b,
        "2026-09-01",
    )
    .unwrap();
    assert!(matches!(
        out_a,
        section_membership::TransferOutcome::Transferred { .. }
    ));

    // B, in a fresh transaction, tries to transfer the *same* source
    // membership A -> C. Its SELECT sees `m_a` already closed → NotCurrent.
    let out_b = section_membership::transfer_membership(
        &mut conn_b,
        &fx.school_id,
        &fx.learner_id,
        &m_a.id,
        &fx.section_c,
        "2026-09-15",
    )
    .unwrap();
    assert_eq!(
        out_b,
        section_membership::TransferOutcome::NotCurrent,
        "the second transfer of a now-closed source is refused, not applied to a different row"
    );

    let checker = open_conn(&fx);
    assert_eq!(
        open_membership_count(&checker, &fx.learner_id),
        1,
        "still exactly one open membership"
    );
    assert_eq!(
        total_membership_rows(&checker, &fx.learner_id),
        2,
        "original + one transfer destination; no third row from the loser"
    );
    let open_section: String = checker
        .query_row(
            "SELECT section_id FROM section_memberships WHERE learner_id = ?1 AND ends_on IS NULL",
            [&fx.learner_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        open_section, fx.section_b,
        "A's transfer is the one that stuck"
    );
}

#[test]
fn the_guarded_close_update_writes_nothing_once_the_row_is_already_closed() {
    // The SQL primitive `transfer_membership` / `end_membership` rely on:
    // `UPDATE ... WHERE id = ? AND ends_on IS NULL` affects zero rows once
    // some other writer has closed the row, which the functions map to
    // `NotCurrent` rather than clobbering a closed span.
    let fx = fixture();
    let mut setup = open_conn(&fx);
    let m_a = section_membership::enroll(
        &setup,
        &fx.school_id,
        &fx.section_a,
        &fx.learner_id,
        "2026-08-24",
    )
    .unwrap()
    .unwrap();
    section_membership::end_membership(
        &mut setup,
        &fx.school_id,
        &fx.learner_id,
        &m_a.id,
        "2026-09-01",
    )
    .unwrap();
    drop(setup);

    let fresh = open_conn(&fx);
    let affected = fresh
        .execute(
            "UPDATE section_memberships SET ends_on = '2026-10-01' \
             WHERE id = ?1 AND ends_on IS NULL",
            [&m_a.id],
        )
        .unwrap();
    assert_eq!(
        affected, 0,
        "the ends_on IS NULL guard rejects a stale close"
    );
}

#[test]
fn an_immediate_transaction_surfaces_contention_as_an_error_never_a_silent_partial_write() {
    // If a future change ever needs write-write serialisation stronger
    // than the app's `Mutex<Connection>`, `TransactionBehavior::Immediate`
    // is the bounded, non-retrying tool: the second writer gets an
    // immediate error, and its transaction rolls back whole.
    let fx = fixture();
    let mut conn_a = open_conn(&fx);
    let mut conn_b = open_conn(&fx);

    let tx_a = conn_a
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .unwrap();
    let tx_b_result = conn_b.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate);

    // Depending on the platform's busy handling one of two things happens,
    // both safe: the second Immediate begin errors now, or it blocks then
    // errors. Either way nothing is half-written.
    match tx_b_result {
        Err(rusqlite::Error::SqliteFailure(e, _)) => {
            assert!(
                matches!(
                    e.code,
                    rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked
                ),
                "unexpected error code: {e:?}"
            );
        }
        Err(other) => panic!("unexpected error: {other:?}"),
        Ok(tx_b) => {
            // Some builds let the second BEGIN IMMEDIATE through until the
            // first write; prove the write itself is what fails.
            let w = tx_b.execute(
                "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
                 VALUES ('imm', ?1, ?2, ?3, '2026-08-24')",
                (&fx.school_id, &fx.section_a, &fx.learner_id),
            );
            assert!(w.is_err(), "the contended write must fail cleanly");
        }
    }
    drop(tx_a);

    let checker = open_conn(&fx);
    assert_eq!(total_membership_rows(&checker, &fx.learner_id), 0);
}
