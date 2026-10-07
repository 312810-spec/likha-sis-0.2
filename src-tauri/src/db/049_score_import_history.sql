CREATE TABLE score_import_batches (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
 assessment_item_id TEXT NOT NULL REFERENCES assessment_items(id),
 content_hash TEXT NOT NULL, imported_by TEXT NOT NULL REFERENCES users(id),
 imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(school_id,assessment_item_id,content_hash)
);
CREATE TABLE score_change_history (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
 assessment_item_id TEXT NOT NULL REFERENCES assessment_items(id),
 learner_id TEXT NOT NULL REFERENCES learners(id), actor_user_id TEXT NOT NULL REFERENCES users(id),
 previous_json TEXT, next_json TEXT NOT NULL, reason TEXT NOT NULL,
 changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
