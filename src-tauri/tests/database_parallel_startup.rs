//! A fresh subprocess is essential: another test must not warm the cipher runtime.
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Barrier};

#[test]
fn parallel_cold_database_startup_preserves_isolated_keyed_connections() {
    const CHILD: &str = "LIKHA_SYNTHETIC_PARALLEL_DATABASE_CHILD";
    if std::env::var_os(CHILD).is_some() {
        let barrier = Arc::new(Barrier::new(32));
        let workers: Vec<_> = (0..32)
            .map(|index| {
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    let key = app_lib::crypto::generate_key();
                    barrier.wait();
                    let conn = app_lib::db::open(Path::new(":memory:"), &key)
                        .expect("parallel cold encrypted open must initialize fully");
                    let school_id = format!("synthetic-cold-{index}");
                    conn.execute(
                        "INSERT INTO schools(id,name) VALUES(?1,'Synthetic cold startup')",
                        [&school_id],
                    )
                    .unwrap();
                    let found: String = conn
                        .query_row("SELECT id FROM schools", [], |row| row.get(0))
                        .unwrap();
                    assert_eq!(found, school_id, "connections must remain isolated");
                    let cipher: String = conn
                        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
                        .unwrap();
                    assert!(!cipher.is_empty(), "the encrypted provider must be present");
                })
            })
            .collect();
        for worker in workers {
            worker.join().expect("cold startup worker must succeed");
        }
        return;
    }
    for round in 0..4 {
        let result = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "parallel_cold_database_startup_preserves_isolated_keyed_connections",
                "--nocapture",
            ])
            .env(CHILD, "1")
            .output()
            .expect("isolated startup subprocess must launch");
        assert!(
            result.status.success(),
            "cold startup round {round} failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
}
