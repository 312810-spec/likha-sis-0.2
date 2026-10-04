-- Sample exchange only. This creates no district submission or TANAW Lock.
CREATE TABLE tanaw_import_receipts (
 school_id TEXT NOT NULL REFERENCES schools(id),
 sample_hash TEXT NOT NULL,
 packet_id TEXT NOT NULL REFERENCES review_packets(id),
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 schema_version INTEGER NOT NULL CHECK(schema_version = 1),
 imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(school_id,sample_hash)
);
CREATE TRIGGER tanaw_receipt_no_update BEFORE UPDATE ON tanaw_import_receipts BEGIN SELECT RAISE(ABORT,'Import receipts are immutable'); END;
CREATE TRIGGER tanaw_receipt_no_delete BEFORE DELETE ON tanaw_import_receipts BEGIN SELECT RAISE(ABORT,'Import receipts are retained'); END;
