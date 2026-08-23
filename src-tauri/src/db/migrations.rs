use rusqlite_migration::{Migrations, M};

/// Deterministic, ordered schema migrations. Append new `M::up(..)` entries
/// for future changes; never edit or reorder an already-released migration.
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            r#"
        CREATE TABLE schools (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE learners (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            given_name TEXT NOT NULL,
            family_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX idx_learners_school_id ON learners(school_id);
        "#,
        ),
        M::up(
            r#"
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE user_school_memberships (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            PRIMARY KEY (user_id, school_id)
        );

        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            expires_at TEXT NOT NULL,
            revoked_at TEXT
        );

        CREATE INDEX idx_sessions_user_id ON sessions(user_id);
        "#,
        ),
        M::up(
            r#"
        CREATE TABLE installation_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            bootstrapped_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        "#,
        ),
    ])
}
