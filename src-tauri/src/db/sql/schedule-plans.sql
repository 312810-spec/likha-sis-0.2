CREATE TABLE schedule_plans (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','published')), input_json TEXT NOT NULL,
 result_json TEXT, published_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX schedule_plans_school ON schedule_plans(school_id,status);

-- Widen every durable synchronization allowlist; preserve rows and review metadata.
        CREATE TABLE sync_outbox_new (
            change_id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL,
            entity_kind TEXT NOT NULL CHECK (entity_kind IN (
                'learner', 'section', 'section_membership', 'attendance',
                'subject_attendance', 'subject_attendance_entry',
                'assessment_item', 'learner_score', 'grading_period',
                'subject', 'teaching_assignment', 'schedule_plan', 'assessment_lifecycle'
            )),
            entity_id TEXT NOT NULL,
            base_version INTEGER NOT NULL CHECK (base_version >= 0),
            operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
            encrypted_payload BLOB NOT NULL CHECK (length(encrypted_payload) > 0 AND length(encrypted_payload) <= 262144),
            attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
            last_attempt_at TEXT,
            last_error_code TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        INSERT INTO sync_outbox_new
            (change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
             base_version, operation, encrypted_payload, attempt_count, last_attempt_at,
             last_error_code, created_at)
        SELECT
            change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
            base_version, operation, encrypted_payload, attempt_count, last_attempt_at,
            last_error_code, created_at
        FROM sync_outbox;

        DROP TABLE sync_outbox;
        ALTER TABLE sync_outbox_new RENAME TO sync_outbox;

        CREATE INDEX idx_sync_outbox_school_created
            ON sync_outbox(school_id, created_at, change_id);

        CREATE TABLE sync_hub_log_new (
            cursor INTEGER PRIMARY KEY AUTOINCREMENT,
            change_id TEXT NOT NULL UNIQUE,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL,
            entity_kind TEXT NOT NULL CHECK (entity_kind IN (
                'learner', 'section', 'section_membership', 'attendance',
                'subject_attendance', 'subject_attendance_entry',
                'assessment_item', 'learner_score', 'grading_period',
                'subject', 'teaching_assignment', 'schedule_plan', 'assessment_lifecycle'
            )),
            entity_id TEXT NOT NULL,
            version INTEGER NOT NULL CHECK (version >= 1),
            operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
            encrypted_payload BLOB NOT NULL CHECK (length(encrypted_payload) > 0 AND length(encrypted_payload) <= 262144),
            accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        INSERT INTO sync_hub_log_new
            (cursor, change_id, school_id, device_id, actor_user_id, entity_kind,
             entity_id, version, operation, encrypted_payload, accepted_at)
        SELECT
            cursor, change_id, school_id, device_id, actor_user_id, entity_kind,
            entity_id, version, operation, encrypted_payload, accepted_at
        FROM sync_hub_log;

        DROP TABLE sync_hub_log;
        ALTER TABLE sync_hub_log_new RENAME TO sync_hub_log;

        CREATE INDEX idx_sync_hub_log_school_cursor ON sync_hub_log(school_id, cursor);
        CREATE INDEX idx_sync_hub_log_entity_version
            ON sync_hub_log(school_id, entity_kind, entity_id, version DESC);

        CREATE TABLE sync_conflict_review_new (
            id TEXT PRIMARY KEY,
            change_id TEXT NOT NULL UNIQUE,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL,
            entity_kind TEXT NOT NULL CHECK (entity_kind IN (
                'learner', 'section', 'section_membership', 'attendance',
                'subject_attendance', 'subject_attendance_entry',
                'assessment_item', 'learner_score', 'grading_period',
                'subject', 'teaching_assignment', 'schedule_plan', 'assessment_lifecycle'
            )),
            entity_id TEXT NOT NULL,
            submitted_base_version INTEGER NOT NULL CHECK (submitted_base_version >= 0),
            current_hub_version INTEGER NOT NULL CHECK (current_hub_version >= 0),
            operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
            encrypted_payload BLOB NOT NULL CHECK (length(encrypted_payload) > 0 AND length(encrypted_payload) <= 262144),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            resolved_at TEXT,
            resolution TEXT CHECK (resolution IN ('kept_local', 'used_incoming')),
            review_reason TEXT NOT NULL DEFAULT 'concurrent_edit' CHECK (review_reason IN ('concurrent_edit','apply_rejected'))
        );

        INSERT INTO sync_conflict_review_new
            (id, change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
             submitted_base_version, current_hub_version, operation, encrypted_payload,
             created_at, resolved_at, resolution, review_reason)
        SELECT
            id, change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
            submitted_base_version, current_hub_version, operation, encrypted_payload,
            created_at, resolved_at, resolution, review_reason
        FROM sync_conflict_review;

        DROP TABLE sync_conflict_review;
        ALTER TABLE sync_conflict_review_new RENAME TO sync_conflict_review;

        CREATE INDEX idx_sync_conflict_review_school_open
            ON sync_conflict_review(school_id, resolved_at);

        CREATE TABLE sync_version_cache_new (
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            entity_kind TEXT NOT NULL CHECK (entity_kind IN (
                'learner', 'section', 'section_membership', 'attendance',
                'subject_attendance', 'subject_attendance_entry',
                'assessment_item', 'learner_score', 'grading_period',
                'subject', 'teaching_assignment', 'schedule_plan', 'assessment_lifecycle'
            )),
            entity_id TEXT NOT NULL,
            known_version INTEGER NOT NULL CHECK (known_version >= 0),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            PRIMARY KEY (school_id, entity_kind, entity_id)
        );

        INSERT INTO sync_version_cache_new
            (school_id, entity_kind, entity_id, known_version, updated_at)
        SELECT
            school_id, entity_kind, entity_id, known_version, updated_at
        FROM sync_version_cache;

        DROP TABLE sync_version_cache;
        ALTER TABLE sync_version_cache_new RENAME TO sync_version_cache;

CREATE INDEX idx_sync_outbox_school_entity ON sync_outbox(school_id, entity_kind, entity_id);
