CREATE TABLE school_offering_versions (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
 previous_id TEXT REFERENCES school_offering_versions(id), school_year TEXT NOT NULL, grade_level TEXT NOT NULL,
 subject_id TEXT NOT NULL REFERENCES subjects(id), cohort TEXT NOT NULL, term_label TEXT NOT NULL,
 effective_from TEXT NOT NULL, effective_until TEXT NOT NULL, weekly_minutes INTEGER NOT NULL CHECK(weekly_minutes BETWEEN 1 AND 2400),
 source_title TEXT NOT NULL, source_reference TEXT NOT NULL, verification_state TEXT NOT NULL CHECK(verification_state IN ('draft','school_confirmed')),
 profile_manifest_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX offering_school_scope ON school_offering_versions(school_id,school_year,grade_level,subject_id);
CREATE TRIGGER offering_no_update BEFORE UPDATE ON school_offering_versions BEGIN SELECT RAISE(ABORT,'Offering snapshots are immutable'); END;
CREATE TRIGGER offering_no_delete BEFORE DELETE ON school_offering_versions BEGIN SELECT RAISE(ABORT,'Offering snapshots are retained'); END;
