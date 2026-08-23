//! Integration proofs for the M6 first-run bootstrap. `tests/auth.rs`
//! covers ordinary session/authorization behavior; this file is specific
//! to `auth::bootstrap_installation` and the concurrency guarantee it
//! makes — see ADR-0006.

use std::sync::{Arc, Barrier};

use app_lib::auth::{self, SessionManager};
use app_lib::repository::school;

#[test]
fn two_concurrent_bootstrap_attempts_against_the_same_file_leave_exactly_one_school() {
    // Regression test for a real bug found during review: an earlier
    // version of `bootstrap_installation` only checked "does any user
    // exist yet" with a plain SELECT before writing. SQLite does not
    // invalidate an already-established read snapshot just because a
    // different connection committed in the meantime, so two connections
    // racing to bootstrap the same on-disk file could both pass that
    // check and both successfully create a "first" school. This test
    // uses two real `Connection`s (not `:memory:`, which is private per
    // connection) against the same temp file, started as close to
    // simultaneously as a `Barrier` allows, to prove the fix — a real
    // INSERT-based singleton claim — actually holds under contention,
    // not just under sequential re-calls.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bootstrap-race.db");
    let key = app_lib::crypto::generate_key();

    let mut conn_a = app_lib::db::open(&path, &key).unwrap();
    let mut conn_b = app_lib::db::open(&path, &key).unwrap();

    let barrier = Arc::new(Barrier::new(2));
    let (barrier_a, barrier_b) = (barrier.clone(), barrier.clone());

    let handle_a = std::thread::spawn(move || {
        let sessions = SessionManager::new();
        barrier_a.wait();
        auth::bootstrap_installation(
            &mut conn_a,
            &sessions,
            "School A",
            "teacher.a",
            "password-a",
            "Teacher A",
        )
    });
    let handle_b = std::thread::spawn(move || {
        let sessions = SessionManager::new();
        barrier_b.wait();
        auth::bootstrap_installation(
            &mut conn_b,
            &sessions,
            "School B",
            "teacher.b",
            "password-b",
            "Teacher B",
        )
    });

    let result_a = handle_a.join().unwrap();
    let result_b = handle_b.join().unwrap();

    let successes = [&result_a, &result_b]
        .into_iter()
        .filter(|r| r.is_ok())
        .count();
    assert_eq!(
        successes, 1,
        "exactly one of two concurrent bootstrap attempts must succeed, got a: {result_a:?}, b: {result_b:?}"
    );

    let conn = app_lib::db::open(&path, &key).unwrap();
    let schools = school::list_all(&conn).unwrap();
    assert_eq!(
        schools.len(),
        1,
        "only one school must exist after the race"
    );
}
