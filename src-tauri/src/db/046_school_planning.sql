CREATE TABLE school_planning_items (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
 kind TEXT NOT NULL CHECK(kind IN ('notice','program')),
 title TEXT NOT NULL, details TEXT NOT NULL, source_reference TEXT NOT NULL DEFAULT '',
 effective_on TEXT NOT NULL DEFAULT '', coordinator_user_id TEXT,
 calendar_decision TEXT NOT NULL DEFAULT 'noChange' CHECK(calendar_decision IN ('noChange','instructional','nonInstructional')),
 affected_area TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('draft','confirmed','inactive','active')),
 revision INTEGER NOT NULL CHECK(revision > 0), updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((kind='notice' AND status IN ('draft','confirmed')) OR (kind='program' AND status IN ('inactive','active')))
);
CREATE INDEX school_planning_scope ON school_planning_items(school_id,kind,updated_at);
CREATE TABLE school_planning_history (
 item_id TEXT NOT NULL REFERENCES school_planning_items(id), revision INTEGER NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id), snapshot_json TEXT NOT NULL,
 changed_by TEXT NOT NULL REFERENCES users(id), changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(item_id,revision)
);
