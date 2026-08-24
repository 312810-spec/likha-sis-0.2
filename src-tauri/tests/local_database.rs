//! Integration proofs for the M1 LocalDatabase foundation: transactional
//! rollback and cross-school data isolation. Persistence-across-restart and
//! foreign-key enforcement are covered by the unit tests in `src/db/mod.rs`.

use std::path::Path;

use app_lib::db;
use app_lib::repository::{learner, school};

fn open_test_db() -> rusqlite::Connection {
    db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

#[test]
fn a_rolled_back_transaction_persists_nothing() {
    let mut conn = open_test_db();
    let s = school::create(&conn, "Bonifacio High School").unwrap();

    {
        let tx = conn.transaction().unwrap();
        learner::create(&tx, &s.id, "Emilio", "Aguinaldo", None, None).unwrap();
        learner::create(&tx, &s.id, "Melchora", "Aquino", None, None).unwrap();
        tx.rollback().unwrap();
    }

    assert_eq!(learner::list_by_school(&conn, &s.id).unwrap(), vec![]);
}

#[test]
fn a_committed_transaction_persists_all_statements() {
    let mut conn = open_test_db();
    let s = school::create(&conn, "Bonifacio High School").unwrap();

    {
        let tx = conn.transaction().unwrap();
        learner::create(&tx, &s.id, "Emilio", "Aguinaldo", None, None).unwrap();
        learner::create(&tx, &s.id, "Melchora", "Aquino", None, None).unwrap();
        tx.commit().unwrap();
    }

    assert_eq!(learner::list_by_school(&conn, &s.id).unwrap().len(), 2);
}

#[test]
fn a_failed_statement_inside_a_transaction_rolls_back_the_whole_batch() {
    let mut conn = open_test_db();
    let s = school::create(&conn, "Bonifacio High School").unwrap();

    let outcome = (|| -> app_lib::error::AppResult<()> {
        let tx = conn.transaction().unwrap();
        learner::create(&tx, &s.id, "Emilio", "Aguinaldo", None, None).unwrap();
        // Violates the school_id foreign key: the whole batch must not land.
        learner::create(&tx, "missing-school", "Bad", "Record", None, None)?;
        tx.commit().unwrap();
        Ok(())
    })();

    assert!(outcome.is_err());
    assert_eq!(learner::list_by_school(&conn, &s.id).unwrap(), vec![]);
}

#[test]
fn learners_are_isolated_by_school() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();

    learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();
    learner::create(&conn, &school_a.id, "Ben", "Reyes", None, None).unwrap();
    learner::create(&conn, &school_b.id, "Cora", "Ramos", None, None).unwrap();

    let a_learners = learner::list_by_school(&conn, &school_a.id).unwrap();
    let b_learners = learner::list_by_school(&conn, &school_b.id).unwrap();

    assert_eq!(a_learners.len(), 2);
    assert!(a_learners.iter().all(|l| l.school_id == school_a.id));
    assert_eq!(b_learners.len(), 1);
    assert!(b_learners.iter().all(|l| l.school_id == school_b.id));
}
