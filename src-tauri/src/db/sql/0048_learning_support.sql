CREATE TABLE learning_support_plans (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), owner_user_id TEXT NOT NULL REFERENCES users(id), learner_id TEXT NOT NULL REFERENCES learners(id),
 goal TEXT NOT NULL, evidence TEXT NOT NULL, follow_up_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE learning_support_sessions (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES learning_support_plans(id), actor_user_id TEXT NOT NULL REFERENCES users(id), session_on TEXT NOT NULL,
 observation TEXT NOT NULL, next_step TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
