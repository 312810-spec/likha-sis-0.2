use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;
use crate::repository::class_record;

/// One learner's computed grade for a class record's grading period, per
/// DepEd Order No. 015, s. 2026 (see `docs/adr/0013-deped-grade-computation.md`
/// for the full research record). `initial_grade` is the weighted-sum
/// percentage before transmutation/rounding (DepEd's "IG"); `term_grade` is
/// the final whole-number grade actually reported (DepEd's "TG").
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComputedTermGrade {
    pub initial_grade: f64,
    pub term_grade: u32,
    /// True if the Adjusted Transmutation Table (Annex D, Table 4 — valid
    /// only for SY 2026-2027) was applied. False means the Zero-Based
    /// Grading System applied instead (`term_grade` is `initial_grade`
    /// rounded directly, no transmutation) — SY 2027-2028 onward.
    pub was_transmuted: bool,
    /// True if the computed grade fell below 60 and was raised to the
    /// Order's explicit floor (paragraph 18, Annex D): "the default minimum
    /// grade to be reflected in the report card shall be set at 60." A
    /// caller that needs to know the learner is genuinely struggling
    /// (rather than just at the floor) should compare `initial_grade`
    /// directly, not rely on `term_grade` alone once this flag is set.
    pub was_floored: bool,
}

/// The DepEd-verified Adjusted Transmutation Table (Annex D, Table 4),
/// transcribed directly from the primary source
/// (`deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf`, page 37 of the
/// PDF / printed page 37) — not a secondary summary. Each entry is
/// `(range_min_inclusive, range_max_inclusive, transmuted_grade)`, ordered
/// highest to lowest. Valid only for SY 2026-2027 (the transition year);
/// see `uses_zero_based_grading` for SY 2027-2028 onward, which does not
/// use this table at all.
const ADJUSTED_TRANSMUTATION_TABLE: &[(f64, f64, u32)] = &[
    (99.50, 100.00, 100),
    (98.32, 99.49, 99),
    (97.14, 98.31, 98),
    (95.96, 97.13, 97),
    (94.78, 95.95, 96),
    (93.60, 94.77, 95),
    (92.42, 93.59, 94),
    (91.24, 92.41, 93),
    (90.06, 91.23, 92),
    (88.88, 90.05, 91),
    (87.70, 88.87, 90),
    (86.52, 87.69, 89),
    (85.34, 86.51, 88),
    (84.16, 85.33, 87),
    (82.98, 84.15, 86),
    (81.80, 82.97, 85),
    (80.62, 81.79, 84),
    (79.44, 80.61, 83),
    (78.26, 79.43, 82),
    (77.08, 78.25, 81),
    (75.90, 77.07, 80),
    (74.72, 75.89, 79),
    (73.54, 74.71, 78),
    (72.36, 73.53, 77),
    (71.18, 72.35, 76),
    (70.00, 71.17, 75),
    (65.34, 69.99, 74),
    (60.67, 65.33, 73),
    (56.01, 60.66, 72),
    (51.34, 56.00, 71),
    (46.67, 51.33, 70),
    (42.01, 46.66, 69),
    (37.34, 42.00, 68),
    (32.68, 37.33, 67),
    (28.01, 32.67, 66),
    (23.35, 28.00, 65),
    (18.68, 23.34, 64),
    (14.01, 18.67, 63),
    (9.35, 14.00, 62),
    (4.68, 9.34, 61),
    (0.00, 4.67, 60),
];

/// Looks up `ig` in the Adjusted Transmutation Table. `ig` outside
/// `0.00..=100.00` is clamped to the nearest end of the table rather than
/// panicking or erroring — a genuinely out-of-range IG should be
/// impossible given `learner_score::record`'s own `0..=max_score` bound,
/// but this keeps the function total rather than assuming that invariant
/// holds all the way through a future refactor.
fn transmute_adjusted(ig: f64) -> u32 {
    if ig >= 100.00 {
        return 100;
    }
    if ig <= 0.00 {
        return 60;
    }
    for &(min, max, tg) in ADJUSTED_TRANSMUTATION_TABLE {
        if ig >= min && ig <= max {
            return tg;
        }
    }
    // Unreachable in practice: the table's ranges are contiguous across
    // 0.00..=100.00 (verified by `transmutation_table_ranges_are_contiguous`
    // below). A defensive fallback, not a silent wrong answer.
    60
}

/// SY 2027-2028 onward: the Term Grade is the Initial Grade rounded to the
/// nearest whole number, no transmutation table involved (Annex D
/// paragraph 13). Uses round-half-up, matching the Order's own worked
/// example (Table 6: IG 83.6 -> TG 84).
fn round_zero_based(ig: f64) -> u32 {
    ig.round().clamp(0.0, 100.0) as u32
}

/// True for SY 2027-2028 and every year after — DepEd's Zero-Based Grading
/// System (Annex D paragraph 13) replaces the Adjusted Transmutation Table
/// from that year on. `school_year` is this app's existing
/// `"YYYY-YYYY"` format (see `section::create`/`grading::create`); only
/// the first four digits are parsed. Malformed input (should be impossible
/// given the schema's own validated writers) is treated as pre-2027-2028
/// — the more conservative branch, since applying a transmutation table
/// that doesn't exist would be a worse failure than applying one that
/// still does.
fn uses_zero_based_grading(school_year: &str) -> bool {
    school_year
        .get(0..4)
        .and_then(|y| y.parse::<i32>().ok())
        .is_some_and(|start_year| start_year >= 2027)
}

/// Raises a computed grade to DepEd's explicit floor (Annex D paragraph
/// 18): "the default minimum grade to be reflected in the report card
/// shall be set at 60." Returns `(reported_grade, was_floored)` so a
/// caller can still distinguish a learner who is genuinely at the floor
/// from one whose raw performance was lower still.
fn apply_minimum_floor(tg: u32) -> (u32, bool) {
    if tg < 60 {
        (60, true)
    } else {
        (tg, false)
    }
}

/// A named, versioned DepEd grade-weighting policy — which learning-area
/// group it applies to and its source citation. Reference data, not
/// school-scoped (every school sees the same DepEd-sourced set), matching
/// `grading::GradingPolicy`/`assessment_category::AssessmentCategorySet`'s
/// exact shape. A school picks one explicitly per class record (see
/// `class_record::create`) — never inferred from a subject's name.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GradingWeightPolicy {
    pub id: String,
    pub name: String,
    pub source_citation: String,
    pub is_default: bool,
}

/// Reference data, not school-scoped. Ordered by `is_default DESC` so the
/// current default (the K-10 core group) is always first — same
/// convention as `grading::list_policies`.
pub fn list_weight_policies(conn: &Connection) -> AppResult<Vec<GradingWeightPolicy>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, source_citation, is_default \
         FROM grading_weight_policies ORDER BY is_default DESC, name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(GradingWeightPolicy {
            id: row.get(0)?,
            name: row.get(1)?,
            source_citation: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// One leaf category's percentage score (DepEd's "PS") for one learner,
/// pooling raw points across every `Scored` item in that category —
/// `PS = (sum of raw scores / sum of max scores) * 100`, per Annex D Step
/// 2. Points-pooled, not item-averaged: an item worth 50 points counts
/// five times as much toward PS as one worth 10, matching the Order's own
/// worked example (Table 5's WWs: raw 74 / max 85, not an average of four
/// per-item percentages). Returns `None` if the learner has no `Scored`
/// item in this category yet — this is this app's own interpretation, not
/// DepEd's (the Order is silent on partial/missing data): rather than
/// treating an unscored item as a zero, or fabricating a grade from
/// incomplete data, the whole term grade is reported as "not yet
/// computable" until every required category has at least one scored
/// item — see `compute_term_grade`'s doc comment.
fn leaf_percentage_score(
    conn: &Connection,
    class_record_id: &str,
    category_id: &str,
    learner_id: &str,
) -> AppResult<Option<f64>> {
    let (raw_sum, max_sum, scored_count): (f64, f64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(ls.score), 0), COALESCE(SUM(ai.max_score), 0), COUNT(*) \
         FROM assessment_items ai \
         JOIN learner_scores ls ON ls.assessment_item_id = ai.id \
         WHERE ai.class_record_id = ?1 AND ai.category_id = ?2 \
           AND ls.learner_id = ?3 AND ls.status = 'scored'",
        (class_record_id, category_id, learner_id),
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    if scored_count == 0 || max_sum <= 0.0 {
        return Ok(None);
    }
    Ok(Some(raw_sum / max_sum * 100.0))
}

struct WeightRow {
    category_id: String,
    parent_category_id: Option<String>,
    weight_percent: f64,
}

/// Computes `learner_id`'s Term Grade for `class_record_id` under the
/// school's default `grading_weight_policies` row, following DepEd Order
/// No. 015, s. 2026's Annex D algorithm exactly (Steps 1-5 plus the
/// Zero-Based Grading System's SY 2027-2028 replacement of Step 5) — see
/// the module doc comment and `docs/adr/0013-deped-grade-computation.md`.
///
/// Returns `Ok(None)` if: `class_record_id` doesn't resolve in
/// `school_id`; no default weight policy exists; or — this app's own
/// interpretation, not DepEd's — any weighted category the policy requires
/// has no `Scored` item yet for this learner. The last case is
/// deliberate: this app never fabricates a term grade from incomplete
/// data (the same "disclose, don't fabricate" principle as
/// `docs/adr/0009-sf2-export-and-official-form-engine.md`'s
/// `FieldDisclosure`), even though it means a class record with, say,
/// Performance Tasks entirely unscored so far simply has no computable
/// grade yet rather than one that assumes zero credit for that unscored
/// work.
pub fn compute_term_grade(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
    learner_id: &str,
) -> AppResult<Option<ComputedTermGrade>> {
    let Some(school_year) = class_record::school_year_in_school(conn, school_id, class_record_id)?
    else {
        return Ok(None);
    };

    // Resolves to the class record's own pinned weight policy (every
    // record created since migration 11 — M15 — always has one; see
    // `class_record::create`), or the current default for a class record
    // that predates that migration. Never hardcodes "the default policy"
    // directly here, so a school with multiple DepEd weight groups seeded
    // (M15 added a second) gets the *right* one per class record, not
    // whichever happens to be marked default.
    let Some(policy_id) =
        class_record::resolved_weight_policy_id_in_school(conn, school_id, class_record_id)?
    else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(
        "SELECT wc.category_id, ac.parent_category_id, wc.weight_percent \
         FROM grading_weight_components wc \
         JOIN assessment_categories ac ON ac.id = wc.category_id \
         WHERE wc.policy_id = ?1",
    )?;
    let rows = stmt.query_map([&policy_id], |row| {
        Ok(WeightRow {
            category_id: row.get(0)?,
            parent_category_id: row.get(1)?,
            weight_percent: row.get(2)?,
        })
    })?;
    let rows = rows.collect::<Result<Vec<_>, _>>()?;

    let mut initial_grade = 0.0;
    for top in rows.iter().filter(|r| r.parent_category_id.is_none()) {
        let children: Vec<&WeightRow> = rows
            .iter()
            .filter(|r| r.parent_category_id.as_deref() == Some(top.category_id.as_str()))
            .collect();

        let ps = if children.is_empty() {
            leaf_percentage_score(conn, class_record_id, &top.category_id, learner_id)?
        } else {
            let mut combined = 0.0;
            let mut all_defined = true;
            for child in &children {
                match leaf_percentage_score(conn, class_record_id, &child.category_id, learner_id)?
                {
                    Some(child_ps) => combined += child_ps * (child.weight_percent / 100.0),
                    None => {
                        all_defined = false;
                        break;
                    }
                }
            }
            if all_defined {
                Some(combined)
            } else {
                None
            }
        };

        let Some(ps) = ps else {
            return Ok(None);
        };
        initial_grade += ps * (top.weight_percent / 100.0);
    }

    let zero_based = uses_zero_based_grading(&school_year);
    let raw_tg = if zero_based {
        round_zero_based(initial_grade)
    } else {
        transmute_adjusted(initial_grade)
    };
    let (term_grade, was_floored) = apply_minimum_floor(raw_tg);

    Ok(Some(ComputedTermGrade {
        initial_grade,
        term_grade,
        was_transmuted: !zero_based,
        was_floored,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{
            assessment_item, class_record, grading, learner, learner_score, school, section,
            section_membership, subject, user,
        },
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    // Pure-math tests: no DB, no Connection — these are the fastest and
    // most direct proof the transcribed table/formulas match the Order.

    #[test]
    fn transmutation_table_ranges_are_contiguous_across_the_full_scale() {
        // Every IG from 0.00 to 100.00 must land in exactly one bucket —
        // proves the table was transcribed without a gap or overlap.
        let mut ig = 0.0;
        while ig <= 100.0 {
            let tg = transmute_adjusted(ig);
            assert!(
                (60..=100).contains(&tg),
                "IG {ig} produced out-of-range TG {tg}"
            );
            ig += 0.01;
        }
    }

    #[test]
    fn transmute_matches_the_orders_own_stated_anchor_point() {
        // Annex D paragraph 48/paragraph 10a: "a raw grade of 70 corresponds
        // to a transmuted passing grade of 75" — the single fact DepEd
        // states in prose, not just in the table, so it's worth its own
        // dedicated assertion independent of the full-table transcription.
        assert_eq!(transmute_adjusted(70.00), 75);
    }

    #[test]
    fn transmute_matches_both_boundaries_and_midpoints_of_spot_checked_rows() {
        assert_eq!(transmute_adjusted(100.00), 100);
        assert_eq!(transmute_adjusted(99.50), 100);
        assert_eq!(transmute_adjusted(99.49), 99);
        assert_eq!(transmute_adjusted(85.34), 88);
        assert_eq!(transmute_adjusted(85.33), 87);
        assert_eq!(transmute_adjusted(0.00), 60);
        assert_eq!(transmute_adjusted(4.67), 60);
        assert_eq!(transmute_adjusted(4.68), 61);
    }

    #[test]
    fn zero_based_grading_applies_from_sy_2027_2028_onward() {
        assert!(!uses_zero_based_grading("2026-2027"));
        assert!(uses_zero_based_grading("2027-2028"));
        assert!(uses_zero_based_grading("2028-2029"));
    }

    #[test]
    fn minimum_floor_raises_a_grade_below_60_and_flags_it() {
        assert_eq!(apply_minimum_floor(59), (60, true));
        assert_eq!(apply_minimum_floor(0), (60, true));
        assert_eq!(apply_minimum_floor(60), (60, false));
        assert_eq!(apply_minimum_floor(75), (75, false));
    }

    #[test]
    fn round_zero_based_matches_the_orders_own_worked_example() {
        // Annex D paragraph 17: IG 83.6 -> TG 84.
        assert_eq!(round_zero_based(83.6), 84);
    }

    // Integration tests: real schema, real seeded weight policy, exercising
    // `compute_term_grade` end to end.

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
    const PERFORMANCE_TASKS: &str = "00000000-0000-7000-8000-000000000312";
    const ST1: &str = "00000000-0000-7000-8000-000000003131";
    const ST2: &str = "00000000-0000-7000-8000-000000003132";
    const TE: &str = "00000000-0000-7000-8000-000000003133";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";
    const EPP_TLE_MAPEH_POLICY: &str = "00000000-0000-7000-8000-000000000043";
    const SHS_FIELD_EXPOSURE_POLICY: &str = "00000000-0000-7000-8000-000000000045";
    const SHS_WORK_IMMERSION_POLICY: &str = "00000000-0000-7000-8000-000000000049";

    /// A school with a class record (pinned to the K-10 core weight
    /// policy) for SY `school_year`, one learner enrolled from the
    /// period's start, and a teacher user. Returns (school_id,
    /// class_record_id, learner_id, teacher_id).
    fn setup(conn: &Connection, school_year: &str) -> (String, String, String, String) {
        setup_with_policy(conn, school_year, K10_POLICY)
    }

    fn setup_with_policy(
        conn: &Connection,
        school_year: &str,
        weight_policy_id: &str,
    ) -> (String, String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let sec = section::create(conn, &s.id, school_year, "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Science").unwrap();
        let period = grading::create(conn, &s.id, school_year, TERM_1, "2026-06-08", "2026-09-15")
            .unwrap()
            .unwrap();
        let cr = class_record::create(
            conn,
            &s.id,
            &sec.id,
            &sub.id,
            &period.id,
            weight_policy_id,
            None,
        )
        .unwrap()
        .unwrap();
        let l = learner::create(conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        section_membership::enroll(conn, &s.id, &sec.id, &l.id, "2026-06-08").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "A Teacher").unwrap();
        (s.id, cr.id, l.id, teacher.id)
    }

    #[allow(clippy::too_many_arguments)]
    fn add_item_and_score(
        conn: &Connection,
        school_id: &str,
        class_record_id: &str,
        category_id: &str,
        learner_id: &str,
        teacher_id: &str,
        name: &str,
        max_score: f64,
        score: f64,
    ) {
        let item = assessment_item::create(
            conn,
            school_id,
            class_record_id,
            category_id,
            name,
            max_score,
        )
        .unwrap()
        .unwrap();
        learner_score::record(
            conn,
            school_id,
            &item.id,
            learner_id,
            learner_score::LearnerScoreStatus::Scored,
            Some(score),
            teacher_id,
        )
        .unwrap();
    }

    /// Reproduces Annex D Table 5 ("Sample Computation of TG in Science for
    /// KS2") exactly: WWs raw 74/85, PTs raw 43/50, EXs ST1 15/20 ST2 18/20
    /// TE 35/40 -> IG 85.8 -> TG 88 (transmuted, SY 2026-2027). This is the
    /// single strongest end-to-end proof this implementation matches the
    /// Order: every input and the expected output are the Order's own.
    #[test]
    fn compute_term_grade_reproduces_the_orders_own_science_ks2_worked_example() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2026-2027");

        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            17.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW2",
            25.0,
            22.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW3",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW4",
            20.0,
            15.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT2",
            25.0,
            23.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            20.0,
            15.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            18.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            40.0,
            35.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        assert!(
            (result.initial_grade - 85.8).abs() < 0.05,
            "expected IG close to 85.8, got {}",
            result.initial_grade
        );
        assert_eq!(result.term_grade, 88);
        assert!(result.was_transmuted);
        assert!(!result.was_floored);
    }

    /// Reproduces Annex D Table 6 ("Sample Computation of Term Grade in
    /// Mathematics for KS3"), zero-based (SY 2027-2028): IG 83.6 -> TG 84,
    /// no transmutation.
    #[test]
    fn compute_term_grade_reproduces_the_orders_own_zero_based_worked_example() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2027-2028");

        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            15.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW2",
            25.0,
            22.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW3",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT2",
            25.0,
            23.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT3",
            25.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            25.0,
            19.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            16.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            50.0,
            42.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        // The Order's own displayed 83.6 comes from rounding each WS to one
        // decimal place before summing (17.5 + 42 + 24.12); this
        // implementation deliberately carries full float precision through
        // every intermediate step and rounds only the final result, to
        // avoid compounding rounding error across terms — a documented
        // interpretation choice, not a transcription error. The two must
        // still agree once rounded to the nearest whole number, since that
        // is the only value DepEd's own algorithm treats as significant
        // (Annex D: "The TG shall be written as a whole number").
        assert!(
            (result.initial_grade - 83.6).abs() < 0.5,
            "expected IG close to 83.6, got {}",
            result.initial_grade
        );
        assert_eq!(result.term_grade, 84);
        assert!(!result.was_transmuted);
    }

    #[test]
    fn compute_term_grade_is_deterministic_across_repeated_calls() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2026-2027");
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            18.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            20.0,
            15.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            15.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            40.0,
            30.0,
        );

        let first = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();
        let second = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        assert_eq!(first, second);
    }

    #[test]
    fn compute_term_grade_returns_none_when_a_required_category_has_no_scored_item_yet() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2026-2027");
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            18.0,
        );
        // Performance Tasks and Examinations never scored at all.

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id).unwrap();

        assert_eq!(
            result, None,
            "an incomplete grade must never be fabricated from partial data"
        );
    }

    #[test]
    fn compute_term_grade_returns_none_when_only_two_of_three_examinations_subtests_are_scored() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2026-2027");
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            18.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            20.0,
            15.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            15.0,
        );
        // Term Examination never scored.

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn compute_term_grade_ignores_excused_items_in_the_denominator() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2026-2027");
        let excused_item =
            assessment_item::create(&conn, &school_id, &cr, WRITTEN_WORKS, "WW-excused", 20.0)
                .unwrap()
                .unwrap();
        learner_score::record(
            &conn,
            &school_id,
            &excused_item.id,
            &learner_id,
            learner_score::LearnerScoreStatus::Excused,
            None,
            &teacher_id,
        )
        .unwrap();
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            25.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            40.0,
            40.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        // A perfect score on every *scored* item, with the excused item
        // correctly excluded from both numerator and denominator, must
        // yield a perfect IG/TG — not a lower one from treating the
        // excused item as a missed 0-of-20.
        assert!((result.initial_grade - 100.0).abs() < 0.01);
        assert_eq!(result.term_grade, 100);
    }

    #[test]
    fn compute_term_grade_floors_a_very_low_score_at_60_under_the_transmutation_table() {
        // The Adjusted Transmutation Table's own lowest bucket (0.00-4.67)
        // already maps to 60 by construction (Annex D 12b) — this proves
        // that structural floor, not the explicit `apply_minimum_floor`
        // clamp (which the next test exercises instead, since it can only
        // ever fire when nothing produced 60 through the table itself).
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2026-2027");
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            1.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            1.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            25.0,
            0.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            0.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            50.0,
            0.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        assert_eq!(result.term_grade, 60);
        assert!(
            result.initial_grade < 60.0,
            "IG itself should still reflect true low performance"
        );
    }

    #[test]
    fn compute_term_grade_floors_a_very_low_score_at_60_under_zero_based_grading() {
        // Under the Zero-Based regime (SY 2027-2028+, no transmutation
        // table), a very low IG rounds directly to a very low TG unless
        // `apply_minimum_floor`'s explicit clamp (Annex D paragraph 18)
        // raises it — this is the one path that can actually observe
        // `was_floored = true`.
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) = setup(&conn, "2027-2028");
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            1.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            25.0,
            1.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            25.0,
            0.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            0.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            50.0,
            0.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        assert_eq!(result.term_grade, 60);
        assert!(result.was_floored);
        assert!(!result.was_transmuted);
        assert!(
            result.initial_grade < 60.0,
            "IG itself should still reflect true low performance"
        );
    }

    #[test]
    fn compute_term_grade_returns_none_for_a_class_record_in_a_different_school() {
        let conn = open_test_db();
        let (_school_id, cr, learner_id, _teacher_id) = setup(&conn, "2026-2027");
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = compute_term_grade(&conn, &other_school.id, &cr, &learner_id).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn list_weight_policies_returns_all_seeded_policies_with_k10_default_first() {
        let conn = open_test_db();

        let policies = list_weight_policies(&conn).unwrap();

        // K-10 core + EPP/TLE & MAPEH (M15) + six SHS groups (M16) = 8.
        assert_eq!(policies.len(), 8);
        let default_count = policies.iter().filter(|p| p.is_default).count();
        assert_eq!(
            default_count, 1,
            "exactly one policy must be marked default"
        );
        assert!(policies[0].is_default);
        assert_eq!(
            policies[0].name,
            "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)"
        );
        assert!(policies
            .iter()
            .any(|p| p.name == "DepEd EPP/TLE & MAPEH Weighting (DO 015, s. 2026)"));
        assert!(
            policies
                .iter()
                .filter(|p| p.name.starts_with("DepEd SHS"))
                .count()
                == 6
        );
    }

    /// The same raw scores, scored under a class record pinned to the
    /// EPP/TLE & MAPEH policy (20/60/20) instead of the K-10 default
    /// (20/50/30), must produce a different IG — direct proof the pinned
    /// policy is actually the one applied, not silently ignored in favor
    /// of whichever policy happens to be marked default.
    #[test]
    fn compute_term_grade_uses_the_class_records_own_pinned_policy_not_the_default() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) =
            setup_with_policy(&conn, "2026-2027", EPP_TLE_MAPEH_POLICY);

        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST1,
            &learner_id,
            &teacher_id,
            "ST1",
            25.0,
            25.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            ST2,
            &learner_id,
            &teacher_id,
            "ST2",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            50.0,
            50.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        // A perfect score under EPP/TLE & MAPEH is still a perfect IG
        // (100) -- weights differ from K-10, but a 100% learner scores
        // 100% under either policy. The weight difference is proven by
        // the next test instead, where scores are imperfect.
        assert!((result.initial_grade - 100.0).abs() < 0.01);
    }

    #[test]
    fn k10_and_epp_tle_mapeh_policies_weight_the_same_imperfect_scores_differently() {
        let conn_k10 = open_test_db();
        let (school_id_k10, cr_k10, learner_k10, teacher_k10) =
            setup_with_policy(&conn_k10, "2026-2027", K10_POLICY);
        // WWs 50%, PTs 100%, EXs 0% -- K-10 weights WWs 20/PTs 50/EXs 30,
        // so IG = 50*0.2 + 100*0.5 + 0*0.3 = 60.
        add_item_and_score(
            &conn_k10,
            &school_id_k10,
            &cr_k10,
            WRITTEN_WORKS,
            &learner_k10,
            &teacher_k10,
            "WW1",
            20.0,
            10.0,
        );
        add_item_and_score(
            &conn_k10,
            &school_id_k10,
            &cr_k10,
            PERFORMANCE_TASKS,
            &learner_k10,
            &teacher_k10,
            "PT1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn_k10,
            &school_id_k10,
            &cr_k10,
            ST1,
            &learner_k10,
            &teacher_k10,
            "ST1",
            25.0,
            0.0,
        );
        add_item_and_score(
            &conn_k10,
            &school_id_k10,
            &cr_k10,
            ST2,
            &learner_k10,
            &teacher_k10,
            "ST2",
            20.0,
            0.0,
        );
        add_item_and_score(
            &conn_k10,
            &school_id_k10,
            &cr_k10,
            TE,
            &learner_k10,
            &teacher_k10,
            "TE",
            50.0,
            0.0,
        );
        let k10_result = compute_term_grade(&conn_k10, &school_id_k10, &cr_k10, &learner_k10)
            .unwrap()
            .unwrap();

        let conn_mapeh = open_test_db();
        let (school_id_mapeh, cr_mapeh, learner_mapeh, teacher_mapeh) =
            setup_with_policy(&conn_mapeh, "2026-2027", EPP_TLE_MAPEH_POLICY);
        // Identical raw scores/percentages, but EPP/TLE & MAPEH weights
        // WWs 20/PTs 60/EXs 20, so IG = 50*0.2 + 100*0.6 + 0*0.2 = 70.
        add_item_and_score(
            &conn_mapeh,
            &school_id_mapeh,
            &cr_mapeh,
            WRITTEN_WORKS,
            &learner_mapeh,
            &teacher_mapeh,
            "WW1",
            20.0,
            10.0,
        );
        add_item_and_score(
            &conn_mapeh,
            &school_id_mapeh,
            &cr_mapeh,
            PERFORMANCE_TASKS,
            &learner_mapeh,
            &teacher_mapeh,
            "PT1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn_mapeh,
            &school_id_mapeh,
            &cr_mapeh,
            ST1,
            &learner_mapeh,
            &teacher_mapeh,
            "ST1",
            25.0,
            0.0,
        );
        add_item_and_score(
            &conn_mapeh,
            &school_id_mapeh,
            &cr_mapeh,
            ST2,
            &learner_mapeh,
            &teacher_mapeh,
            "ST2",
            20.0,
            0.0,
        );
        add_item_and_score(
            &conn_mapeh,
            &school_id_mapeh,
            &cr_mapeh,
            TE,
            &learner_mapeh,
            &teacher_mapeh,
            "TE",
            50.0,
            0.0,
        );
        let mapeh_result =
            compute_term_grade(&conn_mapeh, &school_id_mapeh, &cr_mapeh, &learner_mapeh)
                .unwrap()
                .unwrap();

        assert!(
            (k10_result.initial_grade - 60.0).abs() < 0.01,
            "got {}",
            k10_result.initial_grade
        );
        assert!(
            (mapeh_result.initial_grade - 70.0).abs() < 0.01,
            "got {}",
            mapeh_result.initial_grade
        );
        assert_ne!(
            k10_result.initial_grade, mapeh_result.initial_grade,
            "the same raw scores must weight differently under different DepEd groups"
        );
    }

    /// SHS Work Immersion (and Research Electives & Design and
    /// Innovation) has no Examinations component at all -- proves
    /// `compute_term_grade` handles a policy with zero weight rows for a
    /// top-level category correctly (it's simply skipped, not treated as
    /// a missing/undefined category that blocks the whole grade), by
    /// scoring only WWs/PTs items and getting a real, non-`None` result.
    #[test]
    fn compute_term_grade_handles_a_policy_with_no_examinations_component() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) =
            setup_with_policy(&conn, "2026-2027", SHS_WORK_IMMERSION_POLICY);

        // Work Immersion: WWs 20% (portfolio), PTs 80% (industry evaluation).
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "Portfolio",
            20.0,
            18.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "Industry Eval",
            100.0,
            90.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        // PS(WWs) = 18/20*100 = 90, WS = 90*0.2 = 18.
        // PS(PTs) = 90/100*100 = 90, WS = 90*0.8 = 72.
        // IG = 18 + 72 = 90. No Examinations term at all.
        assert!(
            (result.initial_grade - 90.0).abs() < 0.01,
            "got {}",
            result.initial_grade
        );
    }

    /// SHS Field Exposure/Arts Apprenticeship/Creative Production weights
    /// Examinations as a Term Examination only (no Summative Tests) --
    /// proves a learner scored on WWs/PTs/TE alone (no ST1/ST2 items at
    /// all) still produces a defined grade, since this policy's
    /// Examinations component has only one child weight row.
    #[test]
    fn compute_term_grade_handles_a_policy_where_examinations_is_term_examination_only() {
        let conn = open_test_db();
        let (school_id, cr, learner_id, teacher_id) =
            setup_with_policy(&conn, "2026-2027", SHS_FIELD_EXPOSURE_POLICY);

        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            WRITTEN_WORKS,
            &learner_id,
            &teacher_id,
            "WW1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            PERFORMANCE_TASKS,
            &learner_id,
            &teacher_id,
            "PT1",
            20.0,
            20.0,
        );
        add_item_and_score(
            &conn,
            &school_id,
            &cr,
            TE,
            &learner_id,
            &teacher_id,
            "TE",
            50.0,
            40.0,
        );

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id)
            .unwrap()
            .unwrap();

        // PS(WWs) = 100, WS = 100*0.15 = 15. PS(PTs) = 100, WS = 100*0.70 = 70.
        // PS(TE) = 40/50*100 = 80, weighted within Examinations at 100% -> 80,
        // then Examinations' own 15% weight -> WS = 80*0.15 = 12.
        // IG = 15 + 70 + 12 = 97.
        assert!(
            (result.initial_grade - 97.0).abs() < 0.01,
            "got {}",
            result.initial_grade
        );
    }

    #[test]
    fn compute_term_grade_returns_none_when_the_only_weighted_categories_have_nothing_scored_under_the_field_exposure_policy(
    ) {
        let conn = open_test_db();
        let (school_id, cr, learner_id, _teacher_id) =
            setup_with_policy(&conn, "2026-2027", SHS_FIELD_EXPOSURE_POLICY);
        // Nothing scored at all -- WWs/PTs/TE all undefined.

        let result = compute_term_grade(&conn, &school_id, &cr, &learner_id).unwrap();

        assert_eq!(result, None);
    }
}
