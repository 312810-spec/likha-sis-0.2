CREATE TABLE review_packets (
 id TEXT PRIMARY KEY,
 school_id TEXT NOT NULL REFERENCES schools(id),
 owner_user_id TEXT NOT NULL REFERENCES users(id),
 reviewer_user_id TEXT REFERENCES users(id),
 section_id TEXT NOT NULL REFERENCES sections(id),
 revision INTEGER NOT NULL CHECK(revision > 0),
 status TEXT NOT NULL CHECK(status IN ('draft','submitted','returned','approved')),
 content_json TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 parent_packet_id TEXT REFERENCES review_packets(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX review_packets_scope ON review_packets(school_id,owner_user_id);
CREATE TABLE review_packet_history (
 packet_id TEXT NOT NULL REFERENCES review_packets(id),
 revision INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 reason TEXT NOT NULL,
 content_json TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 status TEXT NOT NULL,
 reviewer_user_id TEXT,
 recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(packet_id,revision)
);
CREATE TRIGGER review_history_no_update BEFORE UPDATE ON review_packet_history BEGIN SELECT RAISE(ABORT,'Review history is immutable'); END;
CREATE TRIGGER review_history_no_delete BEFORE DELETE ON review_packet_history BEGIN SELECT RAISE(ABORT,'Review history is immutable'); END;
