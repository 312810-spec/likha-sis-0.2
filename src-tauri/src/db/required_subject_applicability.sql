-- Section cohorts and concrete grading periods only. No wildcard rules or seeds.
CREATE TABLE required_subject_versions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id),
    section_id TEXT NOT NULL REFERENCES sections(id),
    grading_period_id TEXT NOT NULL REFERENCES grading_periods(id),
    school_year TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
    revision INTEGER NOT NULL CHECK (revision >= 1),
    predecessor_id TEXT UNIQUE REFERENCES required_subject_versions(id),
    state TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'withdrawn')),
    subject_ids_json TEXT NOT NULL CHECK (
        json_valid(subject_ids_json) AND json_type(subject_ids_json) = 'array'
        AND json_array_length(subject_ids_json) <= 256
        AND (state = 'withdrawn' OR json_array_length(subject_ids_json) > 0)
        AND (state <> 'withdrawn' OR json_array_length(subject_ids_json) = 0)
    ),
    source_citation TEXT NOT NULL CHECK (length(trim(source_citation)) BETWEEN 1 AND 2000),
    source_locator TEXT NOT NULL CHECK (length(trim(source_locator)) BETWEEN 1 AND 2000),
    source_revision TEXT NOT NULL CHECK (length(trim(source_revision)) BETWEEN 1 AND 255),
    source_sha256 TEXT CHECK (source_sha256 IS NULL OR (
        length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'
    )),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
    actor_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (school_id, section_id, grading_period_id, revision)
);
CREATE UNIQUE INDEX required_subject_one_root
    ON required_subject_versions(school_id, section_id, grading_period_id)
    WHERE predecessor_id IS NULL;

CREATE TRIGGER required_subject_version_scope BEFORE INSERT ON required_subject_versions
WHEN NOT EXISTS (
    SELECT 1 FROM sections s JOIN grading_periods p ON p.school_id = s.school_id
    WHERE s.id = NEW.section_id AND p.id = NEW.grading_period_id
      AND s.school_id = NEW.school_id AND s.school_year = NEW.school_year
      AND s.grade_level = NEW.grade_level AND p.school_year = NEW.school_year
) OR NOT EXISTS (
    SELECT 1 FROM user_school_memberships m JOIN user_school_roles r
      ON r.user_id = m.user_id AND r.school_id = m.school_id
    WHERE m.school_id = NEW.school_id AND m.user_id = NEW.actor_user_id
      AND r.role IN ('registrar', 'school_head')
) OR EXISTS (
    SELECT 1 FROM json_each(NEW.subject_ids_json) j
    WHERE j.type <> 'text' OR NOT EXISTS (
        SELECT 1 FROM subjects s WHERE s.id = j.value AND s.school_id = NEW.school_id
    )
) OR (
    SELECT count(*) FROM json_each(NEW.subject_ids_json)
) <> (
    SELECT count(DISTINCT value) FROM json_each(NEW.subject_ids_json)
)
BEGIN
    SELECT RAISE(ABORT, 'Required-subject context, actor or subject scope is invalid');
END;

CREATE TRIGGER required_subject_version_lineage BEFORE INSERT ON required_subject_versions
WHEN (NEW.predecessor_id IS NULL AND NEW.revision <> 1)
  OR (NEW.predecessor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM required_subject_versions p WHERE p.id = NEW.predecessor_id
      AND p.school_id = NEW.school_id AND p.section_id = NEW.section_id
      AND p.grading_period_id = NEW.grading_period_id
      AND p.school_year = NEW.school_year AND p.grade_level = NEW.grade_level
      AND p.revision + 1 = NEW.revision
  ))
BEGIN
    SELECT RAISE(ABORT, 'Required-subject predecessor must extend the exact context');
END;
CREATE TRIGGER required_subject_version_no_update BEFORE UPDATE ON required_subject_versions
BEGIN
    SELECT RAISE(ABORT, 'Required-subject versions are immutable');
END;
CREATE TRIGGER required_subject_version_no_delete BEFORE DELETE ON required_subject_versions
BEGIN
    SELECT RAISE(ABORT, 'Required-subject versions are retained evidence');
END;

-- JSON preserves the full immutable set; retain the canonical referenced IDs.
CREATE TRIGGER required_subject_identity_no_delete BEFORE DELETE ON subjects
WHEN EXISTS (
    SELECT 1 FROM required_subject_versions v, json_each(v.subject_ids_json) j
    WHERE j.value = OLD.id
)
BEGIN
    SELECT RAISE(ABORT, 'Required-subject history retains this subject identity');
END;
CREATE TRIGGER required_subject_identity_scope BEFORE UPDATE OF id, school_id ON subjects
WHEN (NEW.id IS NOT OLD.id OR NEW.school_id IS NOT OLD.school_id) AND EXISTS (
    SELECT 1 FROM required_subject_versions v, json_each(v.subject_ids_json) j
    WHERE j.value = OLD.id
)
BEGIN
    SELECT RAISE(ABORT, 'Required-subject history retains this subject scope');
END;

-- Optional binding for a retained reporting draft. No legacy backfill.
CREATE TABLE report_required_subject_pins (
    draft_id TEXT PRIMARY KEY REFERENCES report_card_drafts(id),
    version_id TEXT NOT NULL REFERENCES required_subject_versions(id),
    pinned_by_user_id TEXT NOT NULL REFERENCES users(id),
    pinned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER report_required_subject_pin_scope BEFORE INSERT ON report_required_subject_pins
WHEN NOT EXISTS (
    SELECT 1 FROM report_card_drafts d
    JOIN class_records c ON c.id = d.class_record_id AND c.school_id = d.school_id
    JOIN required_subject_versions v ON v.id = NEW.version_id
    JOIN user_school_memberships m ON m.school_id = d.school_id AND m.user_id = NEW.pinned_by_user_id
    WHERE d.id = NEW.draft_id AND v.school_id = d.school_id
      AND v.section_id = c.section_id AND v.grading_period_id = c.grading_period_id
      AND v.curriculum_version_id = c.curriculum_version_id AND v.state = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 FROM required_subject_versions newer
        WHERE newer.school_id = v.school_id AND newer.section_id = v.section_id
          AND newer.grading_period_id = v.grading_period_id
          AND newer.revision > v.revision AND newer.state <> 'draft'
      )
      AND (EXISTS (
        SELECT 1 FROM user_school_roles r WHERE r.school_id = d.school_id
          AND r.user_id = NEW.pinned_by_user_id AND r.role = 'school_head'
      ) OR EXISTS (
        SELECT 1 FROM teaching_assignments a WHERE a.school_id = d.school_id
          AND a.teacher_user_id = NEW.pinned_by_user_id
          AND a.section_id = c.section_id AND a.subject_id = c.subject_id
      ))
)
BEGIN
    SELECT RAISE(ABORT, 'Reporting pin requires current confirmed applicability and exact report context');
END;
CREATE TRIGGER report_required_subject_pin_no_update BEFORE UPDATE ON report_required_subject_pins
BEGIN
    SELECT RAISE(ABORT, 'Reporting applicability pins are immutable');
END;
CREATE TRIGGER report_required_subject_pin_no_delete BEFORE DELETE ON report_required_subject_pins
BEGIN
    SELECT RAISE(ABORT, 'Reporting applicability pins are retained evidence');
END;
