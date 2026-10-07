CREATE TABLE attachment_versions (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
 reviewer_user_id TEXT REFERENCES users(id), previous_id TEXT REFERENCES attachment_versions(id),
 link_kind TEXT NOT NULL CHECK(link_kind IN ('standalone','learner','class_record','form_draft')), link_id TEXT,
 filename TEXT NOT NULL, mime_type TEXT NOT NULL, sha256 TEXT NOT NULL, content BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_attachment_school ON attachment_versions(school_id);
CREATE TRIGGER attachment_no_update BEFORE UPDATE ON attachment_versions BEGIN SELECT RAISE(ABORT,'Attachment versions are immutable'); END;
CREATE TRIGGER attachment_no_delete BEFORE DELETE ON attachment_versions BEGIN SELECT RAISE(ABORT,'Attachment versions are retained'); END;
