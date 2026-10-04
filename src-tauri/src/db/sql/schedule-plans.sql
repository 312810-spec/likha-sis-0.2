CREATE TABLE schedule_plans (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','published')), input_json TEXT NOT NULL,
 result_json TEXT, published_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX schedule_plans_school ON schedule_plans(school_id,status);
