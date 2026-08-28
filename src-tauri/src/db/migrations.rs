use rusqlite_migration::{Migrations, M};

/// Deterministic, ordered schema migrations. Append new `M::up(..)` entries
/// for future changes; never edit or reorder an already-released migration.
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            r#"
        CREATE TABLE schools (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE learners (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            given_name TEXT NOT NULL,
            family_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX idx_learners_school_id ON learners(school_id);
        "#,
        ),
        M::up(
            r#"
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE user_school_memberships (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            PRIMARY KEY (user_id, school_id)
        );

        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            expires_at TEXT NOT NULL,
            revoked_at TEXT
        );

        CREATE INDEX idx_sessions_user_id ON sessions(user_id);
        "#,
        ),
        M::up(
            r#"
        CREATE TABLE installation_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            bootstrapped_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        "#,
        ),
        M::up(
            r#"
        CREATE TABLE attendance_records (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
            attendance_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
            recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (learner_id, attendance_date)
        );

        CREATE INDEX idx_attendance_school_date ON attendance_records(school_id, attendance_date);
        "#,
        ),
        M::up(
            r#"
        CREATE TABLE sections (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            school_year TEXT NOT NULL,
            grade_level TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (school_id, school_year, grade_level, name)
        );

        CREATE INDEX idx_sections_school_id ON sections(school_id);

        CREATE TABLE section_memberships (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
            learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
            starts_on TEXT NOT NULL,
            ends_on TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX idx_section_memberships_section_id ON section_memberships(section_id);
        CREATE INDEX idx_section_memberships_learner_id ON section_memberships(learner_id);

        -- Enforce "at most one open (current) membership per learner" as a
        -- structural invariant rather than relying on check-then-act code in
        -- the repository layer (this project has twice shipped a race in
        -- that shape before: the M4 self-grant bug and the M6 bootstrap
        -- race, both closed only after independent review).
        CREATE UNIQUE INDEX idx_one_active_membership_per_learner
            ON section_memberships(learner_id) WHERE ends_on IS NULL;

        -- Recreate attendance_records to (a) correct the status domain to
        -- DepEd's real three categories (Present/Absent/Tardy — there is no
        -- official "Excused" code) and (b) add section_id so attendance is
        -- scoped to a section roster rather than the whole school. SQLite
        -- cannot ALTER a CHECK constraint in place, so this uses the
        -- standard 12-step "create new table, copy data, drop old, rename"
        -- pattern. attendance_records has no incoming foreign keys from any
        -- other table, so this is safe to do with foreign_keys enforcement
        -- on. Legacy rows predate sections and are intentionally left with
        -- section_id = NULL (an honest "recorded before section-scoping
        -- existed" marker) rather than backfilled into a fabricated
        -- placeholder section.
        CREATE TABLE attendance_records_new (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            section_id TEXT REFERENCES sections(id),
            learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
            attendance_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'tardy')),
            recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (learner_id, attendance_date)
        );

        INSERT INTO attendance_records_new
            (id, school_id, section_id, learner_id, attendance_date, status, recorded_at)
        SELECT
            id, school_id, NULL, learner_id, attendance_date,
            CASE status
                WHEN 'late' THEN 'tardy'
                WHEN 'excused' THEN 'absent'
                ELSE status
            END,
            recorded_at
        FROM attendance_records;

        DROP TABLE attendance_records;
        ALTER TABLE attendance_records_new RENAME TO attendance_records;

        CREATE INDEX idx_attendance_school_date ON attendance_records(school_id, attendance_date);
        CREATE INDEX idx_attendance_section_date ON attendance_records(section_id, attendance_date);
        "#,
        ),
        M::up(
            r#"
        -- Grading-period foundation (M11). DepEd's grading-period
        -- terminology is policy-driven and has genuinely changed within
        -- this project's own lifetime (DepEd Order No. 9, s. 2026,
        -- "Guidelines on the Implementation of the Three-Term School
        -- Calendar in Basic Education," shifted Basic Education from a
        -- 4-quarter to a 3-term structure for SY 2026-2027 onward,
        -- superseding the older quarter-based K to 12 curriculum this
        -- app's earlier design would otherwise have hardcoded). Rather
        -- than bake in one assumed structure, `grading_policies` holds a
        -- small, versioned set of named period structures (each with its
        -- own source citation), and `grading_periods` is what a school
        -- actually fills in — a policy's period *labels* are fixed
        -- reference data, but the *dates* are always school-entered,
        -- since this app has no source for any school's actual calendar.
        -- See docs/adr/0010-grading-period-foundation.md.
        CREATE TABLE grading_policies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            source_citation TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        -- At most one default policy — enforced structurally, the same
        -- reasoning as migration 5's one-active-membership index: a
        -- SELECT-then-act check has already caused two real races in
        -- this project's history (M4, M6).
        CREATE UNIQUE INDEX idx_one_default_grading_policy
            ON grading_policies(is_default) WHERE is_default = 1;

        CREATE TABLE grading_policy_periods (
            id TEXT PRIMARY KEY,
            policy_id TEXT NOT NULL REFERENCES grading_policies(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,
            label TEXT NOT NULL,
            UNIQUE (policy_id, sequence)
        );

        CREATE TABLE grading_periods (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            school_year TEXT NOT NULL,
            policy_period_id TEXT NOT NULL REFERENCES grading_policy_periods(id),
            starts_on TEXT NOT NULL,
            ends_on TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (starts_on <= ends_on),
            UNIQUE (school_id, school_year, policy_period_id)
        );

        CREATE INDEX idx_grading_periods_school_year ON grading_periods(school_id, school_year);

        -- Seed reference data: two policies, three-term marked default
        -- per DepEd Order No. 9, s. 2026. Exact term/quarter start-end
        -- dates and whether Senior High School (Grades 11-12) follows
        -- this structure or its own semester system were NOT confirmed
        -- during this milestone's research — disclosed in each policy's
        -- own `source_citation`, not silently assumed.
        INSERT INTO grading_policies (id, name, source_citation, is_default) VALUES
            ('00000000-0000-7000-8000-000000000001',
             'DepEd Three-Term School Calendar',
             'DepEd Order No. 9, s. 2026, "Guidelines on the Implementation of the Three-Term School Calendar in Basic Education" (in effect SY 2026-2027 onward, applies to Basic Education broadly). Exact term start/end dates and whether Senior High School (Grades 11-12) follows this structure or its own semester system were not directly confirmed against the primary DepEd Order text during this milestone''s research (triangulated instead from multiple independent secondary sources reporting the same order number, title, and SY 2026-2027 date range) -- schools must enter their own actual term dates; none are assumed here.',
             1),
            ('00000000-0000-7000-8000-000000000002',
             'DepEd Four-Quarter (legacy K to 12)',
             'The quarter-based grading structure used under the original K to 12 Basic Education Curriculum prior to the three-term transition introduced by DepEd Order No. 9, s. 2026. Retained for schools or grade levels still transitioning, or for historical records -- not the current default.',
             0);

        INSERT INTO grading_policy_periods (id, policy_id, sequence, label) VALUES
            ('00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000001', 1, '1st Term'),
            ('00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000001', 2, '2nd Term'),
            ('00000000-0000-7000-8000-000000000013', '00000000-0000-7000-8000-000000000001', 3, '3rd Term'),
            ('00000000-0000-7000-8000-000000000021', '00000000-0000-7000-8000-000000000002', 1, '1st Quarter'),
            ('00000000-0000-7000-8000-000000000022', '00000000-0000-7000-8000-000000000002', 2, '2nd Quarter'),
            ('00000000-0000-7000-8000-000000000023', '00000000-0000-7000-8000-000000000002', 3, '3rd Quarter'),
            ('00000000-0000-7000-8000-000000000024', '00000000-0000-7000-8000-000000000002', 4, '4th Quarter');
        "#,
        ),
        M::up(
            r#"
        -- Gradebook / Class Record foundation, phase 1 (M12a). A
        -- `ClassRecord` is the workspace a teacher opens to record scores:
        -- one section, one subject, one grading period. It intentionally
        -- stores no school_year of its own -- a section's school_year and
        -- its grading period's school_year must already agree (checked in
        -- the repository layer before insert, not re-derived or trusted
        -- from either side alone), so there is exactly one source of
        -- truth instead of two that could silently drift apart.
        CREATE TABLE subjects (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (school_id, name)
        );

        CREATE INDEX idx_subjects_school_id ON subjects(school_id);

        CREATE TABLE class_records (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            grading_period_id TEXT NOT NULL REFERENCES grading_periods(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (section_id, subject_id, grading_period_id)
        );

        CREATE INDEX idx_class_records_school_id ON class_records(school_id);
        CREATE INDEX idx_class_records_section_id ON class_records(section_id);
        "#,
        ),
        M::up(
            r#"
        -- Gradebook / Class Record foundation, phase 2 (M12b): assessment
        -- items and learner scores. Per `.claude/rules/testing.md`/the
        -- `deped-compliance` skill, this milestone's inline research
        -- (WebSearch/WebFetch, same method as ADR-0009/0010) found that
        -- **DepEd Order No. 8, s. 2015** (Written Work / Performance Task /
        -- Quarterly Assessment) has been repealed by **DepEd Order No. 015,
        -- s. 2026** ("Revised Guidelines on Classroom Assessment, Grading
        -- System, and Awards and Recognition for the K to 12 Basic
        -- Education Program"), which renames the third category to
        -- "Examinations" and takes effect alongside the three-term
        -- calendar M11 already modeled. Following M11's exact precedent:
        -- category *names* are seeded, versioned reference data with a
        -- source citation (never hardcoded into an enum), category *usage*
        -- (which items exist, their max score) is always school-entered.
        -- Two sets are seeded: the current default (DO 015, s. 2026) and
        -- the legacy, explicitly-repealed set (DO 8, s. 2015), retained for
        -- schools/records still transitioning. There is deliberately no FK
        -- tying an `assessment_category_sets` row to a `grading_policies`
        -- row (M11) — a school could reasonably record scores under either
        -- category naming regardless of which calendar policy it's on
        -- during the transition; this pairing is unconstrained, not
        -- verified, and is disclosed as such in
        -- docs/adr/0012-assessment-items-and-scores.md rather than left
        -- implicit.
        CREATE TABLE assessment_category_sets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            source_citation TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        -- At most one default set — the same structural pattern as
        -- migration 6's idx_one_default_grading_policy (its fourth
        -- application in this codebase: migrations 5, 6, and this one).
        CREATE UNIQUE INDEX idx_one_default_assessment_category_set
            ON assessment_category_sets(is_default) WHERE is_default = 1;

        CREATE TABLE assessment_categories (
            id TEXT PRIMARY KEY,
            set_id TEXT NOT NULL REFERENCES assessment_category_sets(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,
            name TEXT NOT NULL,
            UNIQUE (set_id, sequence)
        );

        -- An assessment item belongs to one class record and one category
        -- (e.g. "Quiz 1" under Written Works). `max_score` is school-entered
        -- per item, never assumed — DepEd's exact per-category weighting
        -- percentages were not confirmed by this milestone's research
        -- (out of scope; explicitly deferred to M13's own research pass).
        CREATE TABLE assessment_items (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            class_record_id TEXT NOT NULL REFERENCES class_records(id) ON DELETE CASCADE,
            category_id TEXT NOT NULL REFERENCES assessment_categories(id),
            name TEXT NOT NULL,
            max_score REAL NOT NULL CHECK (max_score > 0),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX idx_assessment_items_class_record_id ON assessment_items(class_record_id);

        -- A learner's score for one assessment item. Follows
        -- `attendance_records`' own idiom exactly: **absence of a row means
        -- "not yet recorded,"** not a fourth `status` value — a teacher's
        -- roster view is built with a LEFT JOIN, the same as
        -- `attendance::roster_for_section_date`, so an unscored learner is
        -- never a materialized placeholder row. `status = 'scored'`
        -- requires a non-null `score`; `excused`/`not_applicable` require a
        -- null one — enforced structurally, not by convention alone.
        -- `score <= <the item's max_score>` cannot be a SQL CHECK (SQLite
        -- CHECK constraints cannot reference another table), so that
        -- validation lives in `repository::learner_score::record`, tested
        -- directly against a real max_score there. `recorded_by_user_id`/
        -- `recorded_at`/`updated_at` exist because this is the first
        -- mutable, teacher-authored data in this project's schema, not as
        -- a separate "audit feature" (that remains M12c's scope).
        CREATE TABLE learner_scores (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            assessment_item_id TEXT NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
            learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status IN ('scored', 'excused', 'not_applicable')),
            score REAL,
            recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
            recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (
                (status = 'scored' AND score IS NOT NULL) OR
                (status <> 'scored' AND score IS NULL)
            ),
            UNIQUE (assessment_item_id, learner_id)
        );

        CREATE INDEX idx_learner_scores_item_id ON learner_scores(assessment_item_id);

        -- Seed reference data: two category sets, DO 015 s. 2026 marked
        -- default per current DepEd public-school use (matching M11's own
        -- "default to current official structure" precedent).
        INSERT INTO assessment_category_sets (id, name, source_citation, is_default) VALUES
            ('00000000-0000-7000-8000-000000000031',
             'DepEd Classroom Assessment (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, "Revised Guidelines on Classroom Assessment, Grading System, and Awards and Recognition for the K to 12 Basic Education Program" (implementation begins SY 2026-2027, alongside the three-term calendar from DepEd Order No. 9, s. 2026 -- see docs/adr/0010-grading-period-foundation.md). Renames the third summative-assessment category from "Quarterly Assessment" to "Examinations" (comprising Summative Tests and a Term Examination) and repeals DepEd Order No. 8, s. 2015. Triangulated across two independent secondary sources reporting the same order number, title, and category names; the primary DepEd Order text was not directly fetched. Per-category weighting percentages were not confirmed by either source and are NOT modeled here -- that is explicitly DepEd Grade Computation''s (M13) own research scope, not this milestone''s.',
             1),
            ('00000000-0000-7000-8000-000000000032',
             'DepEd Classroom Assessment (legacy, DO 8, s. 2015 -- repealed)',
             'The Written Work / Performance Task / Quarterly Assessment classroom-assessment structure under DepEd Order No. 8, s. 2015, "Policy Guidelines on Classroom Assessment for the K to 12 Basic Education Program." Confirmed REPEALED by DepEd Order No. 015, s. 2026 -- retained here only for schools/records still transitioning or for historical continuity, not as a currently valid alternative for new SY 2026-2027 records.',
             0);

        INSERT INTO assessment_categories (id, set_id, sequence, name) VALUES
            ('00000000-0000-7000-8000-000000000311', '00000000-0000-7000-8000-000000000031', 1, 'Written Works'),
            ('00000000-0000-7000-8000-000000000312', '00000000-0000-7000-8000-000000000031', 2, 'Performance Tasks'),
            ('00000000-0000-7000-8000-000000000313', '00000000-0000-7000-8000-000000000031', 3, 'Examinations'),
            ('00000000-0000-7000-8000-000000000321', '00000000-0000-7000-8000-000000000032', 1, 'Written Work'),
            ('00000000-0000-7000-8000-000000000322', '00000000-0000-7000-8000-000000000032', 2, 'Performance Task'),
            ('00000000-0000-7000-8000-000000000323', '00000000-0000-7000-8000-000000000032', 3, 'Quarterly Assessment');
        "#,
        ),
        M::up(
            r#"
        -- DepEd Grade Computation (M13). Primary-source-verified against the
        -- actual DepEd Order No. 015, s. 2026 PDF text (deped.gov.ph/wp-content/
        -- uploads/DO_s2026_015r.pdf, "Revised Guidelines on Classroom
        -- Assessment, Grading System, and Awards and Recognition for the K to
        -- 12 Basic Education Program"), not a secondary summary -- superseding
        -- migration 9's comment that per-category weighting "were not
        -- confirmed by either source." See
        -- docs/adr/0013-deped-grade-computation.md for the full research
        -- record, scope boundary, and 10-scenario architecture decision.
        --
        -- Two independent, separately-versioned concerns, deliberately not
        -- merged into one table:
        --   1. STRUCTURE -- which components exist and how they nest. The
        --      Order's Annex D shows "Examinations" is not a single pooled
        --      bucket like Written Works/Performance Tasks: it is itself
        --      composed of three named sub-assessments (Summative Test 1,
        --      Summative Test 2, Term Examination), each independently
        --      scored, then combined 30/30/40 before the Examinations
        --      category's own overall weight is applied. Modeled by adding
        --      a nullable self-reference to the *existing* assessment_categories
        --      table (reusing 100% of M12b's assessment_item/category
        --      machinery unchanged -- an ST1 item is created exactly like any
        --      other item, just under a child category) rather than a new
        --      parallel table or a hardcoded item-name convention.
        --   2. WEIGHTS -- how much each structural component counts, which
        --      DepEd has already changed once within this project's lifetime
        --      (DO 8 s.2015 -> DO 015 s.2026) and states explicitly varies by
        --      Key Stage and by subject-group even within the same Order.
        --      Versioned reference data, matching the grading_policies
        --      (migration 6) / assessment_category_sets (migration 9)
        --      precedent exactly, including the same
        --      "at most one default" unique-partial-index guard.
        ALTER TABLE assessment_categories ADD COLUMN parent_category_id TEXT REFERENCES assessment_categories(id);

        INSERT INTO assessment_categories (id, set_id, sequence, name, parent_category_id) VALUES
            ('00000000-0000-7000-8000-000000003131', '00000000-0000-7000-8000-000000000031', 4, 'Summative Test 1', '00000000-0000-7000-8000-000000000313'),
            ('00000000-0000-7000-8000-000000003132', '00000000-0000-7000-8000-000000000031', 5, 'Summative Test 2', '00000000-0000-7000-8000-000000000313'),
            ('00000000-0000-7000-8000-000000003133', '00000000-0000-7000-8000-000000000031', 6, 'Term Examination', '00000000-0000-7000-8000-000000000313');

        CREATE TABLE grading_weight_policies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source_citation TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE UNIQUE INDEX idx_one_default_grading_weight_policy
            ON grading_weight_policies(is_default) WHERE is_default = 1;

        -- One row per weighted component. For a top-level component
        -- (Written Works, Performance Tasks, Examinations -- i.e. its
        -- assessment_categories row has no parent_category_id), weight_percent
        -- is that component's share of the subject's overall grade. For a
        -- child component (Summative Test 1/2, Term Examination), it is that
        -- component's share *within its parent* (e.g. Examinations' own
        -- 30/30/40 split), not a further fraction of the subject total --
        -- read from the category's own parent_category_id at computation
        -- time, not duplicated as a flag here.
        CREATE TABLE grading_weight_components (
            id TEXT PRIMARY KEY,
            policy_id TEXT NOT NULL REFERENCES grading_weight_policies(id) ON DELETE CASCADE,
            category_id TEXT NOT NULL REFERENCES assessment_categories(id),
            weight_percent REAL NOT NULL CHECK (weight_percent > 0 AND weight_percent <= 100),
            UNIQUE (policy_id, category_id)
        );

        -- Seed: the single subject-group this milestone implements --
        -- English, Filipino, Mathematics, Science, Araling Panlipunan (AP),
        -- and GMRC/Values Education under DO 015 s.2026's Table 9 (KS2-KS3,
        -- Grades 4-10) / Annex D Table 1. NOT modeled yet (see ADR-0013):
        -- the EPP/TLE & MAPEH group (20/60/20), any SHS/KS4 group, GMRC/VE's
        -- internal Cognitive/Affective/Behavioral domain split, and Grade 12's
        -- DO 8 s.2015 carryover weights (the exact DO 8 percentages could not
        -- be confirmed from a primary source this session -- explicitly not
        -- guessed at, per this project's deped-compliance rule).
        INSERT INTO grading_weight_policies (id, name, source_citation, is_default) VALUES
            ('00000000-0000-7000-8000-000000000041',
             'DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 9 (main body) / Annex D Table 1: English, Filipino, Mathematics, Science, Araling Panlipunan (AP), GMRC/Values Education -- Written/Oral Works 20%, Performance/Product Tasks 50%, Examinations 30%. Examinations'' internal Summative Test 1/Summative Test 2/Term Examination split (30%/30%/40%) is Annex D paragraph 6, applied uniformly across all weighting groups in the Order. Verified directly against the Order''s own PDF text, cross-checked against two independently-computed worked examples in the same Annex (Table 5: Science KS2, IG 85.8 -> TG 88; Table 6: Mathematics KS3 zero-based, IG 83.6 -> TG 84) -- both reproduced exactly by this policy''s weights before this migration was written.',
             1);

        INSERT INTO grading_weight_components (id, policy_id, category_id, weight_percent) VALUES
            ('00000000-0000-7000-8000-000000000411', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000311', 20.0),
            ('00000000-0000-7000-8000-000000000412', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000312', 50.0),
            ('00000000-0000-7000-8000-000000000413', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000313', 30.0),
            ('00000000-0000-7000-8000-000000004131', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000003131', 30.0),
            ('00000000-0000-7000-8000-000000004132', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000003132', 30.0),
            ('00000000-0000-7000-8000-000000004133', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000003133', 40.0);
        "#,
        ),
        M::up(
            r#"
        -- M15: Expand DepEd Grading Policy Coverage. See
        -- docs/adr/0015-expand-grading-policy-coverage.md for the full
        -- research/decision record.
        --
        -- (1) A class record must now explicitly say which weight policy
        -- applies to it, rather than every class record silently sharing
        -- whichever policy happens to be the default. This is the gap
        -- ADR-0014 identified: Subject carries no DepEd weight-group
        -- classification, so a teacher must pick explicitly (matching how
        -- grading_period_id/category_set are already explicit picks, not
        -- inferred). Nullable for migration safety -- an existing class
        -- record predates this column and is left NULL, meaning "use
        -- whichever policy is currently the default," the exact behavior
        -- it already had before this migration (see
        -- grading_computation::compute_term_grade's resolution logic).
        ALTER TABLE class_records ADD COLUMN weight_policy_id TEXT REFERENCES grading_weight_policies(id);

        -- (2) The second DepEd weight group this app implements: EPP/TLE
        -- and MAPEH (DO 015, s. 2026, Table 9's second row). Verified
        -- against this session's own prior primary-source reading of the
        -- Order's PDF (recorded in the same conversation as this
        -- migration, not re-fetched) -- Written/Oral Works 20%,
        -- Performance/Product Tasks 60%, Examinations 20%, with the same
        -- Annex D paragraph 6 Summative Test 1/2 + Term Examination
        -- 30/30/40 internal split every weighting group in the Order uses.
        INSERT INTO grading_weight_policies (id, name, source_citation, is_default) VALUES
            ('00000000-0000-7000-8000-000000000043',
             'DepEd EPP/TLE & MAPEH Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 9 (main body) / Annex D Table 1, second row: Edukasyong Pantahanan at Pangkabuhayan (EPP) / Technology and Livelihood Education (TLE), and Music, Arts, Physical Education, and Health (MAPEH) -- Written/Oral Works 20%, Performance/Product Tasks 60%, Examinations 20%. Examinations'' internal Summative Test 1/Summative Test 2/Term Examination split (30%/30%/40%) is Annex D paragraph 6, applied uniformly across all weighting groups in the Order -- the same split already seeded for the K-10 core policy (migration 10).',
             0);

        INSERT INTO grading_weight_components (id, policy_id, category_id, weight_percent) VALUES
            ('00000000-0000-7000-8000-000000000431', '00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000000311', 20.0),
            ('00000000-0000-7000-8000-000000000432', '00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000000312', 60.0),
            ('00000000-0000-7000-8000-000000000433', '00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000000313', 20.0),
            ('00000000-0000-7000-8000-000000004331', '00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000003131', 30.0),
            ('00000000-0000-7000-8000-000000004332', '00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000003132', 30.0),
            ('00000000-0000-7000-8000-000000004333', '00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000003133', 40.0);
        "#,
        ),
        M::up(
            r#"
        -- M16: SHS (Key Stage 4) weighting groups. DepEd Order No. 015,
        -- s. 2026, Table 10 (main body) / Annex D Table 2 -- transcribed
        -- from the same primary-source PDF reading M13/ADR-0013 already
        -- performed and fully verified at full resolution in that
        -- session (not re-fetched). See
        -- docs/adr/0016-shs-and-exceptional-grading-policies.md.
        --
        -- Reuses the *existing* WWs/PTs/Examinations/ST1/ST2/TE category
        -- structure from migration 10 unchanged -- no new categories.
        -- Only new weight rows, confirming ADR-0015's prediction that
        -- every further DepEd weight group is now a purely additive
        -- change. Three structurally distinct shapes exist among the six
        -- SHS groups, each expressible as data alone (no new algorithm
        -- code): (a) full three-part Examinations (ST1/ST2/TE 30/30/40),
        -- same as the two K-10 policies already seeded -- Core Subjects,
        -- Arts/Sports/Health Electives, TechPro Electives; (b) Examinations
        -- present but composed of a Term Examination only, no Summative
        -- Tests, at its full weight (Annex D paragraph 46a) -- Field
        -- Exposure/Arts Apprenticeship/Creative Production and
        -- Innovation; (c) no Examinations component at all (Annex D
        -- paragraph 46b/46c) -- Research Electives & Design and
        -- Innovation, and Work Immersion (whose WWs/PTs are explicitly
        -- "portfolio" and "industry-based evaluation from the workplace
        -- supervisor," not ordinary classwork).
        --
        -- Caveat carried into every policy's own citation text, not just
        -- this comment: Annex D paragraph 47 states detailed
        -- specifications are deferred to a separate "implementation
        -- guidelines of the Strengthened SHS Curriculum" issuance this
        -- app has not obtained -- these weights are DepEd's own stated
        -- percentages, not a guess, but the item-level guidance behind
        -- them is incomplete. Also: Grade 12, which per paragraph 49 has
        -- not yet implemented the Strengthened SHS Curriculum for SY
        -- 2026-2027, uses DO 8, s. 2015 weights instead (still
        -- unimplemented -- no primary source located for DO 8's exact
        -- percentages) -- these six policies apply to Grade 11 and to
        -- Grade 12 only once it transitions.
        INSERT INTO grading_weight_policies (id, name, source_citation, is_default) VALUES
            ('00000000-0000-7000-8000-000000000044',
             'DepEd SHS Core Subjects & Other Academic Electives Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 10 (main body) / Annex D Table 2, row 1: SHS Core Subjects, Other SHS Academic Electives -- Written/Oral Works 20%, Performance/Product Tasks 50%, Examinations 30% (internal ST1/ST2/TE split 30%/30%/40%, Annex D paragraph 6). Applies to Grade 11 and to Grade 12 once it adopts the Strengthened SHS Curriculum (Annex D paragraph 49) -- Grade 12 under the prior curriculum uses DO 8, s. 2015 weights, not this policy. Detailed item-level specifications are deferred by the Order itself to a separate Strengthened SHS Curriculum implementation-guidelines issuance not yet obtained (Annex D paragraph 47).',
             0),
            ('00000000-0000-7000-8000-000000000045',
             'DepEd SHS Field Exposure/Arts Apprenticeship/Creative Production Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 10 / Annex D Table 2, row 2 + Annex D paragraph 46a: SHS Field Exposure, Arts Apprenticeship, Creative Production and Innovation -- Written/Oral Works 15%, Performance/Product Tasks 70%, Examinations 15%. The Examinations component consists solely of a Term Examination at its full weight -- no Summative Tests -- unlike every other weighting group in this Order. Same Grade 11/12-transition and incomplete-item-specification caveats as the Core Subjects policy.',
             0),
            ('00000000-0000-7000-8000-000000000046',
             'DepEd SHS Arts/Sports/Health and Wellness Electives Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 10 / Annex D Table 2, row 3: SHS Arts, Sports, and Health and Wellness Electives -- Written/Oral Works 20%, Performance/Product Tasks 60%, Examinations 20% (internal ST1/ST2/TE split 30%/30%/40%). Same Grade 11/12-transition and incomplete-item-specification caveats as the Core Subjects policy.',
             0),
            ('00000000-0000-7000-8000-000000000047',
             'DepEd SHS Research Electives & Design and Innovation Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 10 / Annex D Table 2, row 4 + Annex D paragraph 46b: SHS Research Electives and Design and Innovation -- Written/Oral Works 40% (progressive summative evidence: quizzes, documentation, matrices, tool adaptation, portfolios), Performance/Product Tasks 60% (major outputs: research proposal, final manuscript, oral presentation). No Examinations component at all -- not a 0% weight, an absent one; this app expresses that by seeding no weight row for the Examinations category in this policy. Same Grade 11/12-transition and incomplete-item-specification caveats as the Core Subjects policy.',
             0),
            ('00000000-0000-7000-8000-000000000048',
             'DepEd SHS TechPro Electives Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 10 / Annex D Table 2, row 5: SHS TechPro Electives -- Written/Oral Works 15%, Performance/Product Tasks 65%, Examinations 20% (internal ST1/ST2/TE split 30%/30%/40%). Same Grade 11/12-transition and incomplete-item-specification caveats as the Core Subjects policy.',
             0),
            ('00000000-0000-7000-8000-000000000049',
             'DepEd SHS Work Immersion Weighting (DO 015, s. 2026)',
             'DepEd Order No. 015, s. 2026, Table 10 / Annex D Table 2, row 6 + Annex D paragraph 46c: SHS Work Immersion -- Written/Oral Works 20% (the learner''s portfolio, including documentation and consolidated outputs from workplace tasks), Performance/Product Tasks 80% (the industry-based evaluation or grade provided by the workplace supervisor). No Examinations component at all -- no weight row seeded for it in this policy. Same Grade 11/12-transition and incomplete-item-specification caveats as the Core Subjects policy.',
             0);

        INSERT INTO grading_weight_components (id, policy_id, category_id, weight_percent) VALUES
            -- Core Subjects & Other Academic Electives: full 3-part EXs.
            ('00000000-0000-7000-8000-000000000441', '00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000000311', 20.0),
            ('00000000-0000-7000-8000-000000000442', '00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000000312', 50.0),
            ('00000000-0000-7000-8000-000000000443', '00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000000313', 30.0),
            ('00000000-0000-7000-8000-000000004431', '00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000003131', 30.0),
            ('00000000-0000-7000-8000-000000004432', '00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000003132', 30.0),
            ('00000000-0000-7000-8000-000000004433', '00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000003133', 40.0),
            -- Field Exposure/Arts Apprenticeship/Creative Production: EXs = TE only.
            ('00000000-0000-7000-8000-000000000451', '00000000-0000-7000-8000-000000000045', '00000000-0000-7000-8000-000000000311', 15.0),
            ('00000000-0000-7000-8000-000000000452', '00000000-0000-7000-8000-000000000045', '00000000-0000-7000-8000-000000000312', 70.0),
            ('00000000-0000-7000-8000-000000000453', '00000000-0000-7000-8000-000000000045', '00000000-0000-7000-8000-000000000313', 15.0),
            ('00000000-0000-7000-8000-000000004533', '00000000-0000-7000-8000-000000000045', '00000000-0000-7000-8000-000000003133', 100.0),
            -- Arts/Sports/Health and Wellness Electives: full 3-part EXs.
            ('00000000-0000-7000-8000-000000000461', '00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000000311', 20.0),
            ('00000000-0000-7000-8000-000000000462', '00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000000312', 60.0),
            ('00000000-0000-7000-8000-000000000463', '00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000000313', 20.0),
            ('00000000-0000-7000-8000-000000004631', '00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000003131', 30.0),
            ('00000000-0000-7000-8000-000000004632', '00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000003132', 30.0),
            ('00000000-0000-7000-8000-000000004633', '00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000003133', 40.0),
            -- Research Electives & Design and Innovation: no EXs at all.
            ('00000000-0000-7000-8000-000000000471', '00000000-0000-7000-8000-000000000047', '00000000-0000-7000-8000-000000000311', 40.0),
            ('00000000-0000-7000-8000-000000000472', '00000000-0000-7000-8000-000000000047', '00000000-0000-7000-8000-000000000312', 60.0),
            -- TechPro Electives: full 3-part EXs.
            ('00000000-0000-7000-8000-000000000481', '00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000000311', 15.0),
            ('00000000-0000-7000-8000-000000000482', '00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000000312', 65.0),
            ('00000000-0000-7000-8000-000000000483', '00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000000313', 20.0),
            ('00000000-0000-7000-8000-000000004831', '00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000003131', 30.0),
            ('00000000-0000-7000-8000-000000004832', '00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000003132', 30.0),
            ('00000000-0000-7000-8000-000000004833', '00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000003133', 40.0),
            -- Work Immersion: no EXs at all.
            ('00000000-0000-7000-8000-000000000491', '00000000-0000-7000-8000-000000000049', '00000000-0000-7000-8000-000000000311', 20.0),
            ('00000000-0000-7000-8000-000000000492', '00000000-0000-7000-8000-000000000049', '00000000-0000-7000-8000-000000000312', 80.0);
        "#,
        ),
        M::up(
            r#"
        -- M17: Learner Reference Number (LRN) and Sex, scoped to what the
        -- app's own shipped exports actually require -- not a general
        -- "Learner Profile Enrichment" build-out. Verified against two
        -- independent secondary sources describing DepEd's actual official
        -- templates (the primary Order PDFs for SF2/SF9 were not
        -- available as machine-readable text this session; per this
        -- project's own established bar -- M10's SF2 field layout was
        -- accepted on DO 4 s.2014 plus two independent web sources plus a
        -- real DepEd workbook -- two independently corroborating sources
        -- is the bar already in use here, not a new lower one):
        --   - SF2 (Daily Attendance Report of Learners), already exported
        --     by this app (export::sf2): the per-learner roster lists
        --     "Name of Learners... with their learner reference number
        --     (LRN)" and "Sex... Male (M) or Female (F)" -- confirmed by
        --     both teacherph.com's SF2 template description and
        --     ilovedeped.net's independent walkthrough of the same form.
        --   - SF9-style report card (export::report_card, this app's own
        --     DepEd-grade-computation-inspired export): openeducat.org's
        --     SF9 field inventory names "Name, LRN, grade level, section,
        --     school, school year" as the Learner Information header.
        -- Birthdate and guardian contact were also considered (the
        -- original M9-DECISION scoping) but no shipped export currently
        -- discloses either as missing, so neither is added here --
        -- "explicit, not inferred": don't collect a PII field a form
        -- doesn't yet demonstrably need. See
        -- docs/adr/0017-learner-reference-number-and-sex.md.
        --
        -- Nullable: every learner enrolled before this migration has
        -- neither value, and there is no honest default to backfill
        -- (unlike M15's weight-policy COALESCE-to-default, there is no
        -- "default LRN"). Exports disclose a missing value per learner
        -- row rather than blocking or fabricating one.
        ALTER TABLE learners ADD COLUMN lrn TEXT
            CHECK (lrn IS NULL OR (length(lrn) = 12 AND lrn GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'));
        ALTER TABLE learners ADD COLUMN sex TEXT CHECK (sex IS NULL OR sex IN ('M', 'F'));

        -- LRN is DepEd's national unique learner identifier -- enforcing
        -- uniqueness within this school's own data (the only scope this
        -- app can see) catches an obvious data-entry mistake (the same
        -- LRN typed for two different learners) without claiming this
        -- app can verify true national uniqueness, which it cannot.
        CREATE UNIQUE INDEX idx_learners_school_lrn ON learners(school_id, lrn) WHERE lrn IS NOT NULL;
        "#,
        ),
        M::up(
            r#"
        -- Account lockout after repeated failed logins. Autonomously
        -- selected (not user-directed) once the M15-M18 roadmap's final
        -- step, Roles & Permissions, was resolved as "deferred, not
        -- built" (see docs/product/M8-DECISION.md's follow-up section).
        -- This app's deployment model is shared school computers with
        -- multiple teacher accounts (docs/adr/0004-authentication-and-local-session.md)
        -- -- a real local brute-force surface existed with no mitigation
        -- beyond Argon2id's own hashing cost. Thresholds (5 attempts, a
        -- 15-minute lock) are standard engineering defaults (OWASP
        -- Authentication Cheat Sheet's general guidance), not a DepEd or
        -- school-specific policy choice -- unlike Roles & Permissions,
        -- this does not need the user's product input to implement
        -- safely. See docs/adr/0019-account-lockout.md.
        ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN locked_until TEXT;
        "#,
        ),
        M::up(
            r#"
        -- Authentication audit log. Autonomously selected (user-directed
        -- sequence: Audit Log -> Global Session Expiry -> Learner Search
        -- -> Teacher Workspace, 2026-08-25), scoped tightly to
        -- authentication events only -- login success/failure, account
        -- lockout, logout -- not a general data-mutation audit trail
        -- (a much larger, separate future milestone; see ADR-0021).
        -- `user_id` is nullable: a failed login against an unknown
        -- username has no real user to reference, but the attempted
        -- `username` text is still recorded for security review (e.g.
        -- repeated attempts against a nonexistent or mistyped account).
        -- `school_id` is NOT NULL: the login screen always requires a
        -- school to be selected before attempting, even for a doomed
        -- attempt, so every event has a real tenant scope to be listed
        -- under -- there is no "global" audit view, matching every other
        -- screen's school-scoped-only convention.
        CREATE TABLE audit_log (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            username TEXT NOT NULL,
            event_type TEXT NOT NULL CHECK (event_type IN ('login_success', 'login_failed', 'account_locked', 'logout')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX idx_audit_log_school_created ON audit_log(school_id, created_at DESC);
        "#,
        ),
        M::up(
            r#"
        -- Functional role assignments -- WAVE 1A RBAC Foundation.
        -- Deliberately a separate table from `user_school_memberships`
        -- (not a `role` column on it) so a user can hold MORE THAN ONE
        -- role in the same school at once (e.g. Teacher + Adviser later)
        -- without a schema change: a new role is a new possible CHECK
        -- value and a new row, never a new column. `teacher`/`registrar`/
        -- `school_head` are this milestone's confirmed starting set (see
        -- docs/product/PRODUCT-CONTRACT.md's RBAC section and
        -- docs/product/M8-DECISION.md's follow-up, where this exact
        -- three-role model was already asked and answered with the
        -- user) -- explicitly NOT the final LIKHA role universe. A
        -- future role (Adviser, LIS Coordinator, ICT Coordinator, Master
        -- Teacher/Department Head) is added by widening this CHECK
        -- constraint in a new migration -- the same recreate-table
        -- pattern this schema already used once for
        -- `attendance_records`'s status enum -- never a redesign of this
        -- table's shape or of any authorization code that reads it.
        CREATE TABLE user_school_roles (
            user_id TEXT NOT NULL,
            school_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('teacher', 'registrar', 'school_head')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            PRIMARY KEY (user_id, school_id, role),
            FOREIGN KEY (user_id, school_id) REFERENCES user_school_memberships(user_id, school_id) ON DELETE CASCADE
        );
        "#,
        ),
        M::up(
            r#"
        -- Curriculum / Key-Stage Versioning Foundation. See
        -- docs/adr/0037-curriculum-key-stage-versioning.md for the full
        -- research record and architecture decision.
        --
        -- Two independent, deliberately un-joined reference axes, per this
        -- milestone's own explicit rule that school_year/grade is not the
        -- curriculum itself:
        --   1. `key_stages` -- DepEd's Key Stage grade-banding (KS1-KS4).
        --      Already primary-source-verified in this codebase without
        --      being modeled as data: docs/adr/0013-deped-grade-computation.md
        --      read DepEd Order No. 015, s. 2026's own PDF text directly
        --      (Annex D "Guidelines on Numeric Grading System for Key Stage
        --      2 to 4"; Table 9 "KS2-KS3/Grades 4-10"; "Key Stage 4 (SHS)";
        --      "Key Stage 1's descriptive-grading conversion"). This
        --      banding is part of the K to 12 system's own grading
        --      structure, not something that changes between curriculum
        --      *content* revisions -- it does not vary by curriculum
        --      version, so it is NOT foreign-keyed to curriculum_versions.
        --      Kindergarten's placement relative to Key Stage numbering was
        --      not confirmed by this milestone's research and is
        --      deliberately left unmapped rather than guessed.
        --   2. `curriculum_versions` -- which named curriculum's content/
        --      competencies apply. Two real, named versions are seeded:
        --      "K to 12 Basic Education Curriculum" (the baseline
        --      curriculum; still in effect for Senior High School, Grades
        --      11-12, whose own MATATAG transition schedule DepEd has not
        --      yet released) and "MATATAG Curriculum" (the revised K-10
        --      curriculum, phased in by grade level SY 2024-2025 through
        --      SY 2026-2027 -- triangulated across multiple independent
        --      secondary sources reporting the same phase schedule, plus
        --      DepEd's own deped.gov.ph/matatagcurriculumk147/ phase-1
        --      page). The K to 12 curriculum is seeded as the sole
        --      default: with no grade-level normalization yet (`sections.
        --      grade_level` remains free text -- see below) there is no
        --      safe way to auto-resolve "MATATAG for K-10, K-12 for SHS"
        --      per record, and Senior High School unambiguously still
        --      needs the older curriculum, so the version that already
        --      covers the whole school without guessing is the safer
        --      system-wide default. Mirrors the `grading_policies` (M11)/
        --      `grading_weight_policies` (M13) versioned-reference-data
        --      shape exactly, including the same "at most one default"
        --      structural guard.
        --
        -- `curriculum_learning_areas` records which named learning areas a
        -- curriculum version defines -- reference data a future milestone
        -- can read, not yet joined to `subjects` (a school's own freeform
        -- subject list already has no DepEd classification, the same
        -- deliberate gap ADR-0015 disclosed for weight groups; forcing a
        -- new required relationship onto `subjects` now would be exactly
        -- the "full curriculum administration product" this milestone is
        -- not building). This session's research did not confirm any
        -- specific learning-area *name* difference between the two
        -- versions (MATATAG subject-structure specifics were not
        -- verifiable against a primary source this session), so both
        -- versions are seeded with the same already-verified DepEd
        -- learning-area names this codebase already cites elsewhere
        -- (grading_weight_policies' own source citations) -- the
        -- structure supports two versions diverging later; today's
        -- content does not yet encode a known difference, and none is
        -- invented.
        CREATE TABLE key_stages (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            min_grade_level INTEGER NOT NULL,
            max_grade_level INTEGER NOT NULL,
            source_citation TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (min_grade_level <= max_grade_level)
        );

        CREATE TABLE curriculum_versions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            source_citation TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        -- At most one default curriculum version -- the same structural
        -- guard as migrations 6/9/13's own default-reference-data indexes
        -- (a SELECT-then-act check has already caused two real races in
        -- this project's history, M4 and M6).
        CREATE UNIQUE INDEX idx_one_default_curriculum_version
            ON curriculum_versions(is_default) WHERE is_default = 1;

        CREATE TABLE curriculum_learning_areas (
            id TEXT PRIMARY KEY,
            curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            UNIQUE (curriculum_version_id, name)
        );

        -- A class record now pins which curriculum version applied when it
        -- was created -- mirroring `class_records.weight_policy_id`'s exact
        -- shape (M15): nullable only for migration safety (an existing
        -- row predates this column and is left NULL, resolved to the
        -- current default by `resolved_curriculum_version_id_in_school`,
        -- never rewritten in place). Unlike `weight_policy_id`, this is
        -- deliberately auto-resolved to the default rather than requiring
        -- an always-visible picker: today exactly one curriculum version
        -- is meaningfully in effect for any given class record (this
        -- milestone does not yet drive any different behavior --
        -- learning-area validation, grade computation -- off which
        -- version is pinned), so forcing a teacher to choose between two
        -- internal curriculum identifiers would be exactly the
        -- unnecessary configuration this milestone's own design principle
        -- warns against. See docs/adr/0037-curriculum-key-stage-versioning.md.
        ALTER TABLE class_records ADD COLUMN curriculum_version_id TEXT REFERENCES curriculum_versions(id);

        INSERT INTO key_stages (id, code, label, min_grade_level, max_grade_level, source_citation) VALUES
            ('00000000-0000-7000-8000-000000005011', 'KS1', 'Key Stage 1', 1, 3,
             'DepEd Order No. 015, s. 2026, Annex D: Key Stage 1 uses a separate descriptive-grading conversion, not the numeric system this Order defines for Key Stages 2-4. Kindergarten''s placement relative to this numbering was not confirmed and is deliberately left unmapped.'),
            ('00000000-0000-7000-8000-000000005012', 'KS2', 'Key Stage 2', 4, 6,
             'DepEd Order No. 015, s. 2026, Annex D "Guidelines on Numeric Grading System for Key Stage 2 to 4"; Table 9 covers "KS2-KS3/Grades 4-10" for the core subject-weighting group.'),
            ('00000000-0000-7000-8000-000000005013', 'KS3', 'Key Stage 3', 7, 10,
             'DepEd Order No. 015, s. 2026, Annex D "Guidelines on Numeric Grading System for Key Stage 2 to 4"; Table 9 covers "KS2-KS3/Grades 4-10" for the core subject-weighting group.'),
            ('00000000-0000-7000-8000-000000005014', 'KS4', 'Key Stage 4', 11, 12,
             'DepEd Order No. 015, s. 2026, Annex D: "Key Stage 4 (SHS)" -- Table 10''s six Senior High School subject-group weighting variants, not yet implemented by this application (see docs/adr/0016-shs-and-exceptional-grading-policies.md).');

        INSERT INTO curriculum_versions (id, name, source_citation, is_default) VALUES
            ('00000000-0000-7000-8000-000000005001',
             'K to 12 Basic Education Curriculum',
             'The baseline curriculum this application''s existing grading-policy research already cites (DepEd Order No. 015, s. 2026 and predecessors). Remains in effect for Senior High School (Grades 11-12), whose own MATATAG transition schedule DepEd has not yet released as of this milestone''s research. Seeded as the sole default: this application has no grade-level normalization yet (sections.grade_level remains free text), so there is no safe way to auto-resolve which curriculum applies per record, and this is the curriculum that unambiguously still covers the whole school without guessing.',
             1),
            ('00000000-0000-7000-8000-000000005002',
             'MATATAG Curriculum',
             'DepEd''s revised K to 10 curriculum ("MATATAG" -- Makabansa, Matatag na Pagkatao, Aktibong Pag-aaral, Tapat na Pagkamamamayan, Angkop na Kurikulum, Guro at Paaralan; see deped.gov.ph/revised-k-to-10-curriculum/). Phased implementation confirmed by school year across multiple independent secondary sources (matatagcurriculum.ph, teachpinas.com, depedlibre.com) plus DepEd''s own deped.gov.ph/matatagcurriculumk147/ phase-1 page: SY 2024-2025 (Kindergarten, Grades 1, 4, 7); SY 2025-2026 (Grades 2, 3, 5, 8); SY 2026-2027 (Grades 6, 9, 10), completing K-10. Senior High School (Grades 11-12) has a separate implementation schedule DepEd has not yet released -- not modeled as transitioning under this version. Specific learning-area/subject-name differences from the prior K to 12 curriculum were not confirmed against a primary source this session and are not encoded as a difference in curriculum_learning_areas.',
             0);

        INSERT INTO curriculum_learning_areas (id, curriculum_version_id, name) VALUES
            ('00000000-0000-7000-8000-000000005101', '00000000-0000-7000-8000-000000005001', 'English'),
            ('00000000-0000-7000-8000-000000005102', '00000000-0000-7000-8000-000000005001', 'Filipino'),
            ('00000000-0000-7000-8000-000000005103', '00000000-0000-7000-8000-000000005001', 'Mathematics'),
            ('00000000-0000-7000-8000-000000005104', '00000000-0000-7000-8000-000000005001', 'Science'),
            ('00000000-0000-7000-8000-000000005105', '00000000-0000-7000-8000-000000005001', 'Araling Panlipunan'),
            ('00000000-0000-7000-8000-000000005106', '00000000-0000-7000-8000-000000005001', 'GMRC/Values Education'),
            ('00000000-0000-7000-8000-000000005107', '00000000-0000-7000-8000-000000005001', 'EPP/TLE'),
            ('00000000-0000-7000-8000-000000005108', '00000000-0000-7000-8000-000000005001', 'MAPEH'),
            ('00000000-0000-7000-8000-000000005201', '00000000-0000-7000-8000-000000005002', 'English'),
            ('00000000-0000-7000-8000-000000005202', '00000000-0000-7000-8000-000000005002', 'Filipino'),
            ('00000000-0000-7000-8000-000000005203', '00000000-0000-7000-8000-000000005002', 'Mathematics'),
            ('00000000-0000-7000-8000-000000005204', '00000000-0000-7000-8000-000000005002', 'Science'),
            ('00000000-0000-7000-8000-000000005205', '00000000-0000-7000-8000-000000005002', 'Araling Panlipunan'),
            ('00000000-0000-7000-8000-000000005206', '00000000-0000-7000-8000-000000005002', 'GMRC/Values Education'),
            ('00000000-0000-7000-8000-000000005207', '00000000-0000-7000-8000-000000005002', 'EPP/TLE'),
            ('00000000-0000-7000-8000-000000005208', '00000000-0000-7000-8000-000000005002', 'MAPEH');
        "#,
        ),
        M::up(
            r#"
        -- Teacher Load / Class Schedule Foundation. See
        -- docs/adr/0039-teacher-load-class-schedule-foundation.md.
        --
        -- Two separate concepts, deliberately not merged and deliberately
        -- not linked to `class_records`:
        --   1. `teaching_assignments` -- WHO teaches WHAT, for a whole
        --      school year. Stores no `school_year` of its own -- derived
        --      from `sections.school_year` via `section_id`, the same
        --      single-source-of-truth reasoning migration 7 already
        --      established for `class_records`. UNIQUE (section_id,
        --      subject_id): at most one teacher per section+subject at a
        --      time -- a reassignment is an explicit remove-then-create,
        --      never a silent overwrite.
        --   2. `schedule_meetings` -- WHEN/WHERE an assignment occurs, one
        --      row per recurring weekly slot. `starts_at`/`ends_at` are
        --      local wall-clock "HH:MM" text, not UTC timestamps -- the
        --      Philippines is a single timezone and a recurring Monday
        --      8am class is a standing local-clock rule, not a moment in
        --      time. The GLOB checks are shape-only defense in depth;
        --      full semantic validation (real hour/minute ranges, start
        --      before end as parsed minutes) happens in
        --      `repository::schedule_meeting`, not relied on here alone.
        -- Advisory/ancillary duties are deliberately not modeled --
        -- DepEd Order No. 005, s. 2024 itself classifies class-advising as
        -- an ancillary task, separate from the 6-hour classroom-teaching
        -- load this foundation measures.
        CREATE TABLE teaching_assignments (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            teacher_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (section_id, subject_id)
        );

        CREATE INDEX idx_teaching_assignments_school_id ON teaching_assignments(school_id);
        CREATE INDEX idx_teaching_assignments_teacher_id ON teaching_assignments(teacher_user_id);

        CREATE TABLE schedule_meetings (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            teaching_assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id) ON DELETE CASCADE,
            weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
            starts_at TEXT NOT NULL CHECK (starts_at GLOB '[0-2][0-9]:[0-5][0-9]'),
            ends_at TEXT NOT NULL CHECK (ends_at GLOB '[0-2][0-9]:[0-5][0-9]'),
            room TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (starts_at < ends_at),
            UNIQUE (teaching_assignment_id, weekday, starts_at, ends_at)
        );

        CREATE INDEX idx_schedule_meetings_school_id ON schedule_meetings(school_id);
        CREATE INDEX idx_schedule_meetings_assignment_id ON schedule_meetings(teaching_assignment_id);
        "#,
        ),
        M::up(
            r#"
        -- SF1 import history (Wave 2E: SF1 Import Operational Hardening &
        -- Auditability). See docs/adr/0043-sf1-bulk-import-engine.md's
        -- Wave 2E addendum.
        --
        -- One row per SUCCESSFUL `commit_sf1_import` call, written inside
        -- the very same `rusqlite::Transaction` that writes the learner/
        -- enrollment rows it describes (see `import::commit`). That is a
        -- deliberate design choice, not an incidental detail: it makes a
        -- history row exist if and only if that batch actually committed.
        -- There is therefore no `status` column here -- a row that exists
        -- at all is, by construction, always "committed"; a failed or
        -- interrupted commit rolls its own history insert back along with
        -- everything else, leaving no partial/ambiguous row to represent.
        --
        -- Deliberately does NOT store any parsed SF1 row content or
        -- structured learner PII (no names/LRN columns) -- only the
        -- counts `import::commit` itself already computes
        -- (`Sf1ImportSummary`), plus enough identity to answer "what was
        -- imported, by whom, when, from which file" without re-reading
        -- the source workbook. `source_filename` is the file's bare name
        -- only, never a full path (a shared-computer deployment can embed
        -- a Windows profile username in a full path) -- but it is still
        -- teacher-supplied free text from their own filesystem, so it
        -- could incidentally contain a learner's name if a teacher names
        -- the file that way (e.g. "juan-delacruz-lrn-....xlsx"); this is
        -- the same trust boundary as every other value in this
        -- SQLCipher-encrypted, school-scoped table, not a new exposure,
        -- but it is not a hard PII-free guarantee either (found by
        -- independent security review). `source_fingerprint`
        -- is a non-cryptographic-purpose SHA-256 content digest
        -- (`import::fingerprint`) used only for an advisory "you may have
        -- imported this before" signal -- never used to block a commit.
        --
        -- `user_id` is nullable and ON DELETE SET NULL, matching
        -- `audit_log`'s existing precedent (migration 15): a deleted
        -- account should not cascade-delete this school's import history,
        -- and `username` is stored alongside as a stable display value
        -- independent of the account's later fate.
        CREATE TABLE sf1_import_history (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            username TEXT NOT NULL,
            source_filename TEXT NOT NULL,
            source_fingerprint TEXT NOT NULL,
            rows_committed INTEGER NOT NULL,
            new_learners_created INTEGER NOT NULL,
            existing_learners_enrolled INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX idx_sf1_import_history_school_created ON sf1_import_history(school_id, created_at DESC);
        CREATE INDEX idx_sf1_import_history_fingerprint ON sf1_import_history(school_id, source_fingerprint);
        "#,
        ),
        M::up(
            r#"
        -- PSGC (PSA Philippine Standard Geographic Code) reference data
        -- (Wave 2G: External API & Government Reference-Data Foundation).
        -- See docs/adr/0047-psgc-reference-data-foundation.md.
        --
        -- Deliberately GLOBAL, not school-scoped: PSGC is public national
        -- reference data, not school-owned data, so unlike every other
        -- table in this schema it carries no `school_id`.
        --
        -- Deliberately append-only/versioned rather than update-in-place:
        -- each import creates a new `reference_geo_snapshots` row (an
        -- immutable generation of data) and its own full set of
        -- `reference_geo_units` rows, rather than overwriting the previous
        -- generation. Nothing is ever deleted or renamed in place. This is
        -- what lets a historical geographic reference stay valid forever
        -- even after PSA renames or restructures a unit in a later
        -- release, without this project inventing a rename/supersession
        -- mapping PSA's own public data does not clearly expose to us.
        -- Only one snapshot is ever `is_current = 1` at a time; that flag
        -- flips atomically in the same transaction that inserts the new
        -- snapshot's units, so a failed/partial import leaves the
        -- previous snapshot fully intact and still current.
        -- `imported_by_user_id`/`imported_by_username`: same provenance
        -- pattern as `sf1_import_history` (migration 19) — who actually
        -- triggered this import, for auditability, since this table has no
        -- `school_id` to otherwise attribute it to.
        CREATE TABLE reference_geo_snapshots (
            id TEXT PRIMARY KEY,
            source_name TEXT NOT NULL,
            authoritative_version TEXT NOT NULL,
            authoritative_published_at TEXT,
            imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
            unit_count INTEGER NOT NULL,
            imported_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            imported_by_username TEXT NOT NULL,
            UNIQUE (source_name, authoritative_version)
        );

        CREATE INDEX idx_reference_geo_snapshots_current ON reference_geo_snapshots(source_name, is_current);

        -- Schema-level backstop for "only one current snapshot per
        -- source" — independent review (Wave 2G) found the invariant
        -- previously lived ONLY in `repository::reference_geo::record_snapshot`'s
        -- application-level UPDATE statements, with nothing preventing two
        -- differently-named sources (e.g. a `source_name` typo on import)
        -- from each silently holding their own orphaned `is_current = 1`
        -- row. A partial unique index makes that state impossible to
        -- reach even by a future bug, not just avoided by today's code.
        CREATE UNIQUE INDEX idx_reference_geo_snapshots_one_current_per_source
            ON reference_geo_snapshots(source_name) WHERE is_current = 1;

        -- `code` is stored and compared as an OPAQUE authoritative string —
        -- never parsed/sliced to derive hierarchy. PSA's own published
        -- code-length convention could not be independently confirmed from
        -- this environment (see the ADR's disclosed limitation), so
        -- `level`/`parent_code` are stored as their own explicit columns
        -- from the source data rather than derived from code structure.
        CREATE TABLE reference_geo_units (
            id TEXT PRIMARY KEY,
            snapshot_id TEXT NOT NULL REFERENCES reference_geo_snapshots(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            level TEXT NOT NULL CHECK (level IN ('region', 'province', 'city_municipality', 'barangay')),
            parent_code TEXT,
            UNIQUE (snapshot_id, code),
            FOREIGN KEY (snapshot_id, parent_code) REFERENCES reference_geo_units(snapshot_id, code)
        );

        CREATE INDEX idx_reference_geo_units_snapshot ON reference_geo_units(snapshot_id);
        CREATE INDEX idx_reference_geo_units_parent ON reference_geo_units(snapshot_id, parent_code);
        -- Covers the `level`-filtered branch of `list_units` (the
        -- highest-volume future query path once a real address-entry UI
        -- exists — barangay is PSGC's largest tier by row count) so it
        -- doesn't fall back to a full snapshot scan plus a temporary sort.
        CREATE INDEX idx_reference_geo_units_snapshot_level ON reference_geo_units(snapshot_id, level, name);
        "#,
        ),
        M::up(
            r#"
        -- Wave 2S: same-day placement correction. The strict half-open
        -- membership policy (Wave 2Q) correctly refuses a same-day
        -- transfer or end -- either would create a zero-length interval --
        -- which left a placement entered in error today with no safe
        -- correction path (docs/adr/0042-*, Wave 2Q/2R addenda). Rather
        -- than a new state machine (a void/re-open pair, which would need
        -- `idx_one_active_membership_per_learner` widened to admit a
        -- second `ends_on IS NULL` row per learner -- a much larger,
        -- higher-risk change touching every "is this membership open"
        -- query in this schema), the chosen representation is a narrow,
        -- provenance-preserving in-place correction: the existing open row
        -- is updated, once, in place. It stays the same row, with the
        -- same `id`/`created_at`/`starts_on`/`ends_on IS NULL` -- every
        -- existing query (`current_roster`, `roster_for_section`,
        -- `is_active_member`, `enrollable_learners`, the one-open-per-
        -- learner unique index, and Wave 2R's read-only history) needs no
        -- change and stays truthful automatically.
        --
        -- `original_section_id` retains the section the row was first
        -- created with -- set once, on the first correction only ("this
        -- is where it started"), never overwritten by a second correction
        -- attempt (there is no second attempt: `corrected_at IS NOT NULL`
        -- refuses one). `corrected_at` is both the correction timestamp
        -- and the single-correction guard. Nothing is deleted and no
        -- second row is created, so this cannot produce an overlapping,
        -- multiple-open, or zero-length membership -- see
        -- `repository::section_membership::correct_same_day_placement`
        -- and the ADR-0042 Wave 2S addendum for the full decision record
        -- and the option set it was chosen from.
        ALTER TABLE section_memberships ADD COLUMN original_section_id TEXT REFERENCES sections(id);
        ALTER TABLE section_memberships ADD COLUMN corrected_at TEXT;
        "#,
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Proves the migration-5 attendance_records rebuild is a safe, lossless
    /// conversion of pre-section legacy data: row count is preserved, the
    /// obsolete 'late'/'excused' statuses map to 'tardy'/'absent', legacy
    /// rows are left unsectioned (section_id NULL) rather than backfilled
    /// into a fabricated section, and the new CHECK constraint actually
    /// rejects the retired 'excused' value going forward.
    #[test]
    fn migration_5_converts_legacy_attendance_data_without_loss() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        // Apply only migrations 1-4 (pre-section schema) to reproduce the
        // exact state this migration must convert.
        migrations().to_version(&mut conn, 4).unwrap();

        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 's1', 'Ana', 'Cruz'), ('l2', 's1', 'Bo', 'Reyes'), ('l3', 's1', 'Cy', 'Santos')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attendance_records (id, school_id, learner_id, attendance_date, status) \
             VALUES ('a1', 's1', 'l1', '2026-01-05', 'present'), \
                    ('a2', 's1', 'l2', '2026-01-05', 'late'), \
                    ('a3', 's1', 'l3', '2026-01-05', 'excused')",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT count(*) FROM attendance_records", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 3, "no rows should be lost during conversion");

        let status_of = |id: &str| -> String {
            conn.query_row(
                "SELECT status FROM attendance_records WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(status_of("a1"), "present");
        assert_eq!(status_of("a2"), "tardy", "'late' must map to 'tardy'");
        assert_eq!(
            status_of("a3"),
            "absent",
            "'excused' has no DepEd equivalent and must map to 'absent'"
        );

        let section_ids: i64 = conn
            .query_row(
                "SELECT count(*) FROM attendance_records WHERE section_id IS NOT NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            section_ids, 0,
            "legacy rows must stay unsectioned, not backfilled into a fabricated section"
        );

        let rejected = conn.execute(
            "INSERT INTO attendance_records (id, school_id, learner_id, attendance_date, status) \
             VALUES ('a4', 's1', 'l1', '2026-01-06', 'excused')",
            [],
        );
        assert!(
            rejected.is_err(),
            "the retired 'excused' status must be rejected by the new CHECK constraint"
        );
    }

    #[test]
    fn migration_5_enforces_one_active_membership_per_learner() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) VALUES ('l1', 's1', 'Ana', 'Cruz')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2025-2026', '7', 'Mabini'), \
                    ('sec2', 's1', '2025-2026', '7', 'Rizal')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m1', 's1', 'sec1', 'l1', '2025-08-01')",
            [],
        )
        .unwrap();

        let second_open_membership = conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m2', 's1', 'sec2', 'l1', '2025-09-01')",
            [],
        );
        assert!(
            second_open_membership.is_err(),
            "a learner must not be able to hold two open (unterminated) memberships at once"
        );
    }

    #[test]
    fn migration_6_seeds_exactly_two_policies_with_the_three_term_policy_as_default() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let default_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM grading_policies WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            default_count, 1,
            "exactly one policy must be seeded as default"
        );

        let default_name: String = conn
            .query_row(
                "SELECT name FROM grading_policies WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(default_name, "DepEd Three-Term School Calendar");

        let total_policies: i64 = conn
            .query_row("SELECT count(*) FROM grading_policies", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total_policies, 2);
    }

    #[test]
    fn migration_6_seeds_the_correct_period_labels_in_sequence_order() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT p.label FROM grading_policy_periods p \
                 JOIN grading_policies gp ON gp.id = p.policy_id \
                 WHERE gp.is_default = 1 ORDER BY p.sequence",
            )
            .unwrap();
        let labels: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(labels, vec!["1st Term", "2nd Term", "3rd Term"]);

        let mut stmt = conn
            .prepare(
                "SELECT p.label FROM grading_policy_periods p \
                 JOIN grading_policies gp ON gp.id = p.policy_id \
                 WHERE gp.is_default = 0 ORDER BY p.sequence",
            )
            .unwrap();
        let legacy_labels: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            legacy_labels,
            vec!["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"]
        );
    }

    #[test]
    fn migration_6_rejects_a_second_default_policy() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO grading_policies (id, name, source_citation, is_default) \
             VALUES ('p3', 'Another Policy', 'test', 1)",
            [],
        );

        assert!(
            result.is_err(),
            "a second default policy must be rejected by the structural constraint"
        );
    }

    #[test]
    fn migration_6_rejects_a_grading_period_where_ends_on_precedes_starts_on() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO grading_periods \
                 (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES ('gp1', 's1', '2026-2027', '00000000-0000-7000-8000-000000000011', \
                     '2026-10-01', '2026-06-15')",
            [],
        );

        assert!(result.is_err(), "ends_on before starts_on must be rejected");
    }

    #[test]
    fn migration_7_rejects_a_duplicate_class_record_for_the_same_section_subject_and_period() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2026-2027', '7', 'Mabini')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subjects (id, school_id, name) VALUES ('sub1', 's1', 'Mathematics')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO grading_periods \
                 (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES ('gp1', 's1', '2026-2027', '00000000-0000-7000-8000-000000000011', \
                     '2026-06-08', '2026-09-15')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id) \
             VALUES ('cr1', 's1', 'sec1', 'sub1', 'gp1')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id) \
             VALUES ('cr2', 's1', 'sec1', 'sub1', 'gp1')",
            [],
        );

        assert!(
            result.is_err(),
            "the same section/subject/grading-period combination must not be recorded twice"
        );
    }

    #[test]
    fn migration_8_seeds_exactly_two_category_sets_with_do_015_as_default() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let default_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM assessment_category_sets WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(default_count, 1);

        let default_name: String = conn
            .query_row(
                "SELECT name FROM assessment_category_sets WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(default_name, "DepEd Classroom Assessment (DO 015, s. 2026)");

        // Migration 10 (M13) added Examinations' three named sub-assessments
        // as child categories under the same default set — see
        // db::migrations::tests::migration_10_* for that structure's own
        // dedicated tests. This assertion covers the top-level three
        // categories a class-record item can be created under directly.
        let mut stmt = conn
            .prepare(
                "SELECT c.name FROM assessment_categories c \
                 JOIN assessment_category_sets s ON s.id = c.set_id \
                 WHERE s.is_default = 1 AND c.parent_category_id IS NULL ORDER BY c.sequence",
            )
            .unwrap();
        let names: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            names,
            vec!["Written Works", "Performance Tasks", "Examinations"]
        );
    }

    #[test]
    fn migration_8_rejects_a_second_default_category_set() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO assessment_category_sets (id, name, source_citation, is_default) \
             VALUES ('cs3', 'Another Set', 'test', 1)",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_8_rejects_a_scored_row_with_no_score_value() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'teacher', 'hash', 'A Teacher')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2026-2027', '7', 'Mabini')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subjects (id, school_id, name) VALUES ('sub1', 's1', 'Mathematics')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO grading_periods \
                 (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES ('gp1', 's1', '2026-2027', '00000000-0000-7000-8000-000000000011', \
                     '2026-06-08', '2026-09-15')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id) \
             VALUES ('cr1', 's1', 'sec1', 'sub1', 'gp1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO assessment_items (id, school_id, class_record_id, category_id, name, max_score) \
             VALUES ('ai1', 's1', 'cr1', '00000000-0000-7000-8000-000000000311', 'Quiz 1', 20)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) VALUES ('l1', 's1', 'Ana', 'Cruz')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO learner_scores \
                 (id, school_id, assessment_item_id, learner_id, status, score, recorded_by_user_id) \
             VALUES ('ls1', 's1', 'ai1', 'l1', 'scored', NULL, 'u1')",
            [],
        );

        assert!(
            result.is_err(),
            "status 'scored' must require a non-null score"
        );
    }

    #[test]
    fn migration_10_seeds_examinations_children_under_the_default_set() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT name FROM assessment_categories \
                 WHERE parent_category_id = '00000000-0000-7000-8000-000000000313' \
                 ORDER BY sequence",
            )
            .unwrap();
        let children: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            children,
            vec!["Summative Test 1", "Summative Test 2", "Term Examination"]
        );
    }

    #[test]
    fn migration_10_seeds_exactly_one_default_weight_policy_matching_the_verified_worked_examples()
    {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let default_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM grading_weight_policies WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(default_count, 1);

        let mut stmt = conn
            .prepare(
                "SELECT ac.name, wc.weight_percent \
                 FROM grading_weight_components wc \
                 JOIN assessment_categories ac ON ac.id = wc.category_id \
                 JOIN grading_weight_policies p ON p.id = wc.policy_id \
                 WHERE p.is_default = 1 ORDER BY ac.sequence",
            )
            .unwrap();
        let weights: Vec<(String, f64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            weights,
            vec![
                ("Written Works".to_string(), 20.0),
                ("Performance Tasks".to_string(), 50.0),
                ("Examinations".to_string(), 30.0),
                ("Summative Test 1".to_string(), 30.0),
                ("Summative Test 2".to_string(), 30.0),
                ("Term Examination".to_string(), 40.0),
            ]
        );
    }

    #[test]
    fn migration_10_rejects_a_second_default_weight_policy() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO grading_weight_policies (id, name, source_citation, is_default) \
             VALUES ('p2', 'Second Policy', 'test', 1)",
            [],
        );

        assert!(
            result.is_err(),
            "at most one default weight policy must be allowed"
        );
    }

    #[test]
    fn migration_10_rejects_a_duplicate_weight_component_for_the_same_policy_and_category() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO grading_weight_components (id, policy_id, category_id, weight_percent) \
             VALUES ('wc-dup', '00000000-0000-7000-8000-000000000041', \
                      '00000000-0000-7000-8000-000000000311', 99.0)",
            [],
        );

        assert!(
            result.is_err(),
            "a category must not have two weight rows in the same policy"
        );
    }

    #[test]
    fn migration_11_seeds_the_epp_tle_mapeh_policy_as_non_default() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let default_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM grading_weight_policies WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            default_count, 1,
            "the K-10 core policy must remain the sole default"
        );

        let mut stmt = conn
            .prepare(
                "SELECT ac.name, wc.weight_percent \
                 FROM grading_weight_components wc \
                 JOIN assessment_categories ac ON ac.id = wc.category_id \
                 WHERE wc.policy_id = '00000000-0000-7000-8000-000000000043' \
                 ORDER BY ac.sequence",
            )
            .unwrap();
        let weights: Vec<(String, f64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            weights,
            vec![
                ("Written Works".to_string(), 20.0),
                ("Performance Tasks".to_string(), 60.0),
                ("Examinations".to_string(), 20.0),
                ("Summative Test 1".to_string(), 30.0),
                ("Summative Test 2".to_string(), 30.0),
                ("Term Examination".to_string(), 40.0),
            ]
        );
    }

    #[test]
    fn migration_11_class_records_weight_policy_id_is_nullable_for_existing_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        // Apply only migrations 1-10 to create a class record the way a
        // pre-M15 database would have -- with no weight_policy_id column
        // at all yet.
        migrations().to_version(&mut conn, 10).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2026-2027', '7', 'Mabini')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subjects (id, school_id, name) VALUES ('sub1', 's1', 'Mathematics')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO grading_periods (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES ('gp1', 's1', '2026-2027', '00000000-0000-7000-8000-000000000011', '2026-06-08', '2026-09-15')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id) \
             VALUES ('cr1', 's1', 'sec1', 'sub1', 'gp1')",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let weight_policy_id: Option<String> = conn
            .query_row(
                "SELECT weight_policy_id FROM class_records WHERE id = 'cr1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            weight_policy_id, None,
            "a pre-M15 class record must survive the migration with no policy pinned, \
             not a fabricated guess at which one it should have used"
        );
    }

    #[test]
    fn migration_12_seeds_all_six_shs_policies_as_non_default() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let default_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM grading_weight_policies WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            default_count, 1,
            "the K-10 core policy must remain the sole default"
        );

        let shs_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM grading_weight_policies WHERE name LIKE 'DepEd SHS%'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(shs_count, 6);
    }

    /// Core Subjects, Arts/Sports/Health Electives, and TechPro Electives
    /// all use the full three-part Examinations split -- spot-checks one
    /// of them (Core Subjects) plus the two structurally distinct cases:
    /// TE-only (Field Exposure) and no-Examinations-at-all (Work
    /// Immersion / Research Electives).
    #[test]
    fn migration_12_shs_core_subjects_has_the_full_three_part_examinations_split() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT ac.name, wc.weight_percent \
                 FROM grading_weight_components wc \
                 JOIN assessment_categories ac ON ac.id = wc.category_id \
                 WHERE wc.policy_id = '00000000-0000-7000-8000-000000000044' \
                 ORDER BY ac.sequence",
            )
            .unwrap();
        let weights: Vec<(String, f64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            weights,
            vec![
                ("Written Works".to_string(), 20.0),
                ("Performance Tasks".to_string(), 50.0),
                ("Examinations".to_string(), 30.0),
                ("Summative Test 1".to_string(), 30.0),
                ("Summative Test 2".to_string(), 30.0),
                ("Term Examination".to_string(), 40.0),
            ]
        );
    }

    #[test]
    fn migration_12_shs_field_exposure_weights_examinations_as_term_examination_only() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT ac.name, wc.weight_percent \
                 FROM grading_weight_components wc \
                 JOIN assessment_categories ac ON ac.id = wc.category_id \
                 WHERE wc.policy_id = '00000000-0000-7000-8000-000000000045' \
                 ORDER BY ac.sequence",
            )
            .unwrap();
        let weights: Vec<(String, f64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            weights,
            vec![
                ("Written Works".to_string(), 15.0),
                ("Performance Tasks".to_string(), 70.0),
                ("Examinations".to_string(), 15.0),
                ("Term Examination".to_string(), 100.0),
            ],
            "no Summative Test 1/2 rows should exist for this policy"
        );
    }

    #[test]
    fn migration_12_shs_work_immersion_and_research_electives_have_no_examinations_component() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        for (policy_id, expected) in [
            (
                "00000000-0000-7000-8000-000000000047",
                vec![
                    ("Written Works".to_string(), 40.0),
                    ("Performance Tasks".to_string(), 60.0),
                ],
            ),
            (
                "00000000-0000-7000-8000-000000000049",
                vec![
                    ("Written Works".to_string(), 20.0),
                    ("Performance Tasks".to_string(), 80.0),
                ],
            ),
        ] {
            let mut stmt = conn
                .prepare(
                    "SELECT ac.name, wc.weight_percent \
                     FROM grading_weight_components wc \
                     JOIN assessment_categories ac ON ac.id = wc.category_id \
                     WHERE wc.policy_id = ?1 \
                     ORDER BY ac.sequence",
                )
                .unwrap();
            let weights: Vec<(String, f64)> = stmt
                .query_map([policy_id], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap();
            assert_eq!(
                weights, expected,
                "policy {policy_id} must have no Examinations row at all"
            );
        }
    }

    #[test]
    fn migration_13_lrn_and_sex_are_nullable_for_existing_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Rizal Elementary')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) VALUES ('l1', 's1', 'Juan', 'Dela Cruz')",
            [],
        )
        .unwrap();

        let (lrn, sex): (Option<String>, Option<String>) = conn
            .query_row("SELECT lrn, sex FROM learners WHERE id = 'l1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(lrn, None);
        assert_eq!(sex, None);
    }

    #[test]
    fn migration_13_accepts_a_valid_twelve_digit_lrn_and_a_valid_sex_code() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Rizal Elementary')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn, sex) \
             VALUES ('l1', 's1', 'Juan', 'Dela Cruz', '123456789012', 'M')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn migration_13_rejects_an_lrn_that_is_not_exactly_twelve_digits() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Rizal Elementary')",
            [],
        )
        .unwrap();

        for bad_lrn in ["12345", "12345678901X", "1234567890123"] {
            let result = conn.execute(
                "INSERT INTO learners (id, school_id, given_name, family_name, lrn) \
                 VALUES ('l' || ?1, 's1', 'Juan', 'Dela Cruz', ?1)",
                [bad_lrn],
            );
            assert!(result.is_err(), "'{bad_lrn}' should be rejected as an LRN");
        }
    }

    #[test]
    fn migration_13_rejects_a_sex_value_outside_m_or_f() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Rizal Elementary')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, sex) \
             VALUES ('l1', 's1', 'Juan', 'Dela Cruz', 'X')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_13_rejects_a_duplicate_lrn_within_the_same_school() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Rizal Elementary')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn) \
             VALUES ('l1', 's1', 'Juan', 'Dela Cruz', '123456789012')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn) \
             VALUES ('l2', 's1', 'Maria', 'Santos', '123456789012')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_13_allows_the_same_lrn_pattern_reused_across_different_schools() {
        // A duplicate LRN across two different schools' own isolated data
        // is not this app's business to reject -- it can only ever see one
        // school's data, so this is a schema sanity check, not a claim
        // that the app can verify true national LRN uniqueness.
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'School A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s2', 'School B')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn) \
             VALUES ('l1', 's1', 'Juan', 'Dela Cruz', '123456789012')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn) \
             VALUES ('l2', 's2', 'Maria', 'Santos', '123456789012')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn migration_14_defaults_failed_login_attempts_to_zero_and_locked_until_to_null() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'teacher.a', 'hash', 'Teacher A')",
            [],
        )
        .unwrap();

        let (attempts, locked_until): (i64, Option<String>) = conn
            .query_row(
                "SELECT failed_login_attempts, locked_until FROM users WHERE id = 'u1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(attempts, 0);
        assert_eq!(locked_until, None);
    }

    #[test]
    fn migration_15_accepts_a_valid_audit_log_row_with_a_known_user() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'School A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'teacher.a', 'hash', 'Teacher A')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO audit_log (id, school_id, user_id, username, event_type) \
             VALUES ('a1', 's1', 'u1', 'teacher.a', 'login_success')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn migration_15_accepts_a_failed_login_with_no_known_user() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'School A')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO audit_log (id, school_id, user_id, username, event_type) \
             VALUES ('a1', 's1', NULL, 'does.not.exist', 'login_failed')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn migration_15_rejects_an_unrecognized_event_type() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'School A')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO audit_log (id, school_id, user_id, username, event_type) \
             VALUES ('a1', 's1', NULL, 'teacher.a', 'deleted_the_database')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_15_rejects_an_audit_log_row_for_an_unknown_school() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO audit_log (id, school_id, user_id, username, event_type) \
             VALUES ('a1', 'does-not-exist', NULL, 'teacher.a', 'login_failed')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_15_deleting_a_user_keeps_the_audit_row_with_user_id_cleared() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'School A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'teacher.a', 'hash', 'Teacher A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO audit_log (id, school_id, user_id, username, event_type) \
             VALUES ('a1', 's1', 'u1', 'teacher.a', 'login_success')",
            [],
        )
        .unwrap();

        conn.execute("DELETE FROM users WHERE id = 'u1'", [])
            .unwrap();

        let user_id: Option<String> = conn
            .query_row("SELECT user_id FROM audit_log WHERE id = 'a1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            user_id, None,
            "the audit row itself must survive the user's deletion"
        );
    }

    fn seed_school_user_and_membership(conn: &Connection) {
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'teacher.a', 'hash', 'Teacher A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_school_memberships (user_id, school_id) VALUES ('u1', 's1')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn migration_16_allows_a_user_to_hold_more_than_one_role_in_the_same_school() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_user_and_membership(&conn);

        conn.execute(
            "INSERT INTO user_school_roles (user_id, school_id, role) VALUES ('u1', 's1', 'teacher')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_school_roles (user_id, school_id, role) VALUES ('u1', 's1', 'registrar')",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_school_roles WHERE user_id = 'u1' AND school_id = 's1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 2,
            "one user must be able to hold two roles in the same school at once"
        );
    }

    #[test]
    fn migration_16_rejects_an_unrecognized_role() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_user_and_membership(&conn);

        let result = conn.execute(
            "INSERT INTO user_school_roles (user_id, school_id, role) VALUES ('u1', 's1', 'principal')",
            [],
        );

        assert!(
            result.is_err(),
            "an unrecognized role string must be rejected by the CHECK constraint"
        );
    }

    #[test]
    fn migration_16_rejects_a_role_for_a_membership_that_does_not_exist() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'teacher.a', 'hash', 'Teacher A')",
            [],
        )
        .unwrap();
        // Deliberately no user_school_memberships row for (u1, s1).

        let result = conn.execute(
            "INSERT INTO user_school_roles (user_id, school_id, role) VALUES ('u1', 's1', 'teacher')",
            [],
        );

        assert!(
            result.is_err(),
            "a role cannot be granted for a school membership that doesn't exist"
        );
    }

    #[test]
    fn migration_16_cascades_when_the_underlying_membership_is_deleted() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_user_and_membership(&conn);
        conn.execute(
            "INSERT INTO user_school_roles (user_id, school_id, role) VALUES ('u1', 's1', 'registrar')",
            [],
        )
        .unwrap();

        conn.execute(
            "DELETE FROM user_school_memberships WHERE user_id = 'u1' AND school_id = 's1'",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_school_roles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            count, 0,
            "a role row must not outlive the membership it depends on"
        );
    }

    #[test]
    fn migration_17_seeds_exactly_two_curriculum_versions_with_k_to_12_as_sole_default() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM curriculum_versions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 2);

        let default_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM curriculum_versions WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            default_count, 1,
            "exactly one curriculum version must be the default"
        );

        let default_name: String = conn
            .query_row(
                "SELECT name FROM curriculum_versions WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(default_name, "K to 12 Basic Education Curriculum");
    }

    #[test]
    fn migration_17_rejects_a_second_default_curriculum_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "UPDATE curriculum_versions SET is_default = 1 \
             WHERE name = 'MATATAG Curriculum'",
            [],
        );

        assert!(
            result.is_err(),
            "a second default curriculum version must be rejected"
        );
    }

    #[test]
    fn migration_17_seeds_four_key_stages_with_non_overlapping_grade_bands() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT code, min_grade_level, max_grade_level FROM key_stages ORDER BY min_grade_level",
            )
            .unwrap();
        let bands: Vec<(String, i64, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            bands,
            vec![
                ("KS1".to_string(), 1, 3),
                ("KS2".to_string(), 4, 6),
                ("KS3".to_string(), 7, 10),
                ("KS4".to_string(), 11, 12),
            ]
        );
    }

    #[test]
    fn migration_17_rejects_a_key_stage_with_min_grade_level_above_max() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO key_stages (id, code, label, min_grade_level, max_grade_level, source_citation) \
             VALUES ('bad', 'KSX', 'Bad Stage', 5, 4, 'test')",
            [],
        );

        assert!(
            result.is_err(),
            "min_grade_level must never exceed max_grade_level"
        );
    }

    #[test]
    fn migration_17_seeds_the_same_eight_learning_areas_for_each_curriculum_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT cv.name, COUNT(*) FROM curriculum_learning_areas cla \
                 JOIN curriculum_versions cv ON cv.id = cla.curriculum_version_id \
                 GROUP BY cv.name ORDER BY cv.name",
            )
            .unwrap();
        let counts: Vec<(String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            counts,
            vec![
                ("K to 12 Basic Education Curriculum".to_string(), 8),
                ("MATATAG Curriculum".to_string(), 8),
            ]
        );
    }

    #[test]
    fn migration_17_rejects_a_learning_area_for_an_unknown_curriculum_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO curriculum_learning_areas (id, curriculum_version_id, name) \
             VALUES ('bad', 'does-not-exist', 'Made Up Subject')",
            [],
        );

        assert!(
            result.is_err(),
            "a learning area must reference a real curriculum version"
        );
    }

    #[test]
    fn migration_17_rejects_a_duplicate_learning_area_name_within_the_same_curriculum_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO curriculum_learning_areas (id, curriculum_version_id, name) \
             VALUES ('dup', '00000000-0000-7000-8000-000000005001', 'English')",
            [],
        );

        assert!(
            result.is_err(),
            "the same learning area name must not be duplicated within one curriculum version"
        );
    }

    #[test]
    fn migration_17_class_records_curriculum_version_id_is_nullable_for_existing_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        // Apply only migrations 1-16 to create a class record the way a
        // pre-M17 database would have -- with no curriculum_version_id
        // column at all yet.
        migrations().to_version(&mut conn, 16).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2025-2026', 'Grade 7', 'Rizal')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subjects (id, school_id, name) VALUES ('sub1', 's1', 'Mathematics')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO grading_periods (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES ('gp1', 's1', '2025-2026', '00000000-0000-7000-8000-000000000011', '2025-06-01', '2025-10-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id) \
             VALUES ('cr1', 's1', 'sec1', 'sub1', 'gp1')",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let curriculum_version_id: Option<String> = conn
            .query_row(
                "SELECT curriculum_version_id FROM class_records WHERE id = 'cr1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            curriculum_version_id, None,
            "a class record predating this migration must be left NULL, never backfilled with a guess"
        );
    }

    #[test]
    fn migration_17_rejects_a_class_record_pinning_an_unknown_curriculum_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2025-2026', 'Grade 7', 'Rizal')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subjects (id, school_id, name) VALUES ('sub1', 's1', 'Mathematics')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO grading_periods (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES ('gp1', 's1', '2025-2026', '00000000-0000-7000-8000-000000000011', '2025-06-01', '2025-10-01')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id, curriculum_version_id) \
             VALUES ('cr1', 's1', 'sec1', 'sub1', 'gp1', 'does-not-exist')",
            [],
        );

        assert!(
            result.is_err(),
            "a class record must not pin a curriculum version that doesn't exist"
        );
    }

    // ---- Teacher Load / Class Schedule Foundation ----

    fn seed_school_teacher_section_subject(conn: &Connection) {
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('t1', 'teacher.a', 'hash', 'Teacher A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_school_memberships (user_id, school_id) VALUES ('t1', 's1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2026-2027', '7', 'Mabini')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subjects (id, school_id, name) VALUES ('sub1', 's1', 'Mathematics')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn migration_18_creates_a_teaching_assignment() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);

        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM teaching_assignments", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migration_18_rejects_an_assignment_for_an_unknown_teacher() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);

        let result = conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 'does-not-exist', 'sec1', 'sub1')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_18_rejects_a_second_teacher_for_the_same_section_and_subject() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);
        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('t2', 'teacher.b', 'hash', 'Teacher B')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_school_memberships (user_id, school_id) VALUES ('t2', 's1')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta2', 's1', 't2', 'sec1', 'sub1')",
            [],
        );

        assert!(
            result.is_err(),
            "at most one teacher may be assigned to a given section+subject at a time"
        );
    }

    #[test]
    fn migration_18_creates_a_schedule_meeting_and_cascades_when_the_assignment_is_deleted() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);
        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO schedule_meetings (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at) \
             VALUES ('sm1', 's1', 'ta1', 0, '08:00', '08:50')",
            [],
        )
        .unwrap();

        conn.execute("DELETE FROM teaching_assignments WHERE id = 'ta1'", [])
            .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM schedule_meetings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            count, 0,
            "a meeting must not outlive the assignment it depends on"
        );
    }

    #[test]
    fn migration_18_rejects_a_weekday_outside_0_to_6() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);
        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO schedule_meetings (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at) \
             VALUES ('sm1', 's1', 'ta1', 7, '08:00', '08:50')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_18_rejects_an_end_time_that_does_not_come_after_the_start_time() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);
        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO schedule_meetings (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at) \
             VALUES ('sm1', 's1', 'ta1', 0, '09:00', '08:50')",
            [],
        );

        assert!(result.is_err(), "end time must come after start time");
    }

    #[test]
    fn migration_18_rejects_a_malformed_time_string() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);
        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO schedule_meetings (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at) \
             VALUES ('sm1', 's1', 'ta1', 0, '8am', '9am')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn migration_18_rejects_a_duplicate_meeting() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed_school_teacher_section_subject(&conn);
        conn.execute(
            "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
             VALUES ('ta1', 's1', 't1', 'sec1', 'sub1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO schedule_meetings (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at) \
             VALUES ('sm1', 's1', 'ta1', 0, '08:00', '08:50')",
            [],
        )
        .unwrap();

        let result = conn.execute(
            "INSERT INTO schedule_meetings (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at) \
             VALUES ('sm2', 's1', 'ta1', 0, '08:00', '08:50')",
            [],
        );

        assert!(
            result.is_err(),
            "the exact same meeting must not be insertable twice"
        );
    }
}
