pub mod assessment_category;
pub mod assessment_item;
pub mod attendance;
pub mod auth;
pub mod class_record;
pub mod export;
pub mod grading;
pub mod import;
pub mod learner;
pub mod learner_score;
pub mod reference_geo;
pub mod school;
pub mod section;
pub mod setup;
pub mod subject;
pub mod teaching_assignment;
pub mod user;

use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

/// Locks the managed database connection, recovering from a poisoned lock
/// instead of propagating the poison. A single SQLite statement/transaction
/// is atomic at the database level, so a Rust-side panic while the lock was
/// held does not corrupt on-disk state; refusing to ever use the connection
/// again would turn one bug into a permanently broken app for every
/// subsequent command.
pub(crate) fn lock_db(db: &Mutex<Connection>) -> MutexGuard<'_, Connection> {
    db.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
