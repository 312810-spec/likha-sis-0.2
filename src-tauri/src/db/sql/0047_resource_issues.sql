CREATE TABLE resource_issues (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
 learner_id TEXT NOT NULL REFERENCES learners(id), resource_name TEXT NOT NULL, issued_quantity INTEGER NOT NULL CHECK(issued_quantity>0),
 issued_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE resource_returns (
 id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES resource_issues(id), quantity INTEGER NOT NULL CHECK(quantity>0), reason TEXT NOT NULL,
 actor_user_id TEXT NOT NULL REFERENCES users(id), returned_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER resource_return_limit BEFORE INSERT ON resource_returns WHEN NEW.quantity + COALESCE((SELECT SUM(quantity) FROM resource_returns WHERE issue_id=NEW.issue_id),0) > (SELECT issued_quantity FROM resource_issues WHERE id=NEW.issue_id) BEGIN SELECT RAISE(ABORT,'Cannot return more than issued'); END;
CREATE TRIGGER resource_return_no_update BEFORE UPDATE ON resource_returns BEGIN SELECT RAISE(ABORT,'Return history is immutable'); END;
CREATE TRIGGER resource_return_no_delete BEFORE DELETE ON resource_returns BEGIN SELECT RAISE(ABORT,'Return history is retained'); END;
