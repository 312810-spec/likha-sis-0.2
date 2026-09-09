//! BOSY (Beginning of School Year) vs. EOSY (End of School Year)
//! nutrition consolidation: school-wide baseline-vs-endline aggregation
//! into DepEd's Nutritional Status Report grid (Enrolment / Pupils
//! Weighed / BMI-for-Age / Height-for-Age category counts, per grade
//! level, split Male/Female/Total).
//!
//! Ported in spirit from `likha-sis-master`'s `nutritionConsolidation.js`
//! (`312810-spec/likha-sis`, retrieved 2026-09-08). Pure aggregation over
//! already-fetched rows -- no SQL here (`repository::nutrition` builds
//! the `EnrollmentRow`/`NutritionRecordSummary` inputs). Independent of
//! whether `nutrition::lookup_bmi_cutoffs`/`lookup_hfa_cutoffs` are
//! populated: a record with `nutritional_status: None` (a real
//! measurement captured, WHO classification not yet computable -- see
//! `nutrition`'s module doc comment) is simply not counted into any BMI
//! category bucket, mirroring the legacy `if (bmiKey) increment(...)`
//! tolerance -- this report is fully correct and testable today
//! regardless of that separate, disclosed gap.

use serde::Serialize;

use super::nutrition::{HeightForAgeStatus, NutritionalStatus, Sex};

/// One enrolled learner, for the "Enrolment" columns -- independent of
/// whether that learner has a nutrition record for this period.
#[derive(Debug, Clone)]
pub struct EnrollmentRow {
    pub grade_level: String,
    pub sex: Sex,
}

/// One captured nutrition measurement, already reduced to just what the
/// consolidation report needs -- `repository::nutrition` maps DB rows
/// into this shape.
#[derive(Debug, Clone)]
pub struct NutritionRecordSummary {
    pub grade_level: String,
    pub sex: Sex,
    pub nutritional_status: Option<NutritionalStatus>,
    pub height_for_age_status: Option<HeightForAgeStatus>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct SexCount {
    pub m: u32,
    pub f: u32,
    pub t: u32,
}

impl SexCount {
    fn increment(&mut self, sex: Sex) {
        match sex {
            Sex::Male => self.m += 1,
            Sex::Female => self.f += 1,
        }
        self.t += 1;
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct BmiCategoryBlock {
    pub severely_wasted: SexCount,
    pub wasted: SexCount,
    pub normal: SexCount,
    pub overweight: SexCount,
    pub obese: SexCount,
}

impl BmiCategoryBlock {
    fn increment(&mut self, status: NutritionalStatus, sex: Sex) {
        let bucket = match status {
            NutritionalStatus::SeverelyWasted => &mut self.severely_wasted,
            NutritionalStatus::Wasted => &mut self.wasted,
            NutritionalStatus::Normal => &mut self.normal,
            NutritionalStatus::Overweight => &mut self.overweight,
            NutritionalStatus::Obese => &mut self.obese,
        };
        bucket.increment(sex);
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct HfaCategoryBlock {
    pub severely_stunted: SexCount,
    pub stunted: SexCount,
    pub normal: SexCount,
    pub tall: SexCount,
}

impl HfaCategoryBlock {
    fn increment(&mut self, status: HeightForAgeStatus, sex: Sex) {
        let bucket = match status {
            HeightForAgeStatus::SeverelyStunted => &mut self.severely_stunted,
            HeightForAgeStatus::Stunted => &mut self.stunted,
            HeightForAgeStatus::Normal => &mut self.normal,
            HeightForAgeStatus::Tall => &mut self.tall,
        };
        bucket.increment(sex);
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct GradeLevelRow {
    pub grade_level: String,
    pub enrollment: SexCount,
    pub weighed: SexCount,
    pub bmi: BmiCategoryBlock,
    pub hfa: HfaCategoryBlock,
}

impl GradeLevelRow {
    fn empty(grade_level: &str) -> Self {
        GradeLevelRow {
            grade_level: grade_level.to_string(),
            ..Default::default()
        }
    }

    fn accumulate(&mut self, other: &GradeLevelRow) {
        for (a, b) in [
            (&mut self.enrollment, &other.enrollment),
            (&mut self.weighed, &other.weighed),
        ] {
            a.m += b.m;
            a.f += b.f;
            a.t += b.t;
        }
        for (a, b) in [
            (&mut self.bmi.severely_wasted, &other.bmi.severely_wasted),
            (&mut self.bmi.wasted, &other.bmi.wasted),
            (&mut self.bmi.normal, &other.bmi.normal),
            (&mut self.bmi.overweight, &other.bmi.overweight),
            (&mut self.bmi.obese, &other.bmi.obese),
            (&mut self.hfa.severely_stunted, &other.hfa.severely_stunted),
            (&mut self.hfa.stunted, &other.hfa.stunted),
            (&mut self.hfa.normal, &other.hfa.normal),
            (&mut self.hfa.tall, &other.hfa.tall),
        ] {
            a.m += b.m;
            a.f += b.f;
            a.t += b.t;
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ConsolidationResult {
    pub grade_levels: Vec<GradeLevelRow>,
    pub grand_total: GradeLevelRow,
}

/// Aggregates `enrollment` + `records` into per-grade-level rows for one
/// school year + period (`BOSY`/`EOSY`) -- school-wide by grade, not
/// broken out per section, matching the real workbook's own rollup
/// granularity (the legacy source verified this against a real DepEd
/// consolidation workbook; unchanged here). `grade_levels_offered`
/// controls display order; a grade level present in the data but absent
/// from that list sorts last rather than being dropped.
pub fn consolidate_by_grade_level(
    enrollment: &[EnrollmentRow],
    records: &[NutritionRecordSummary],
    grade_levels_offered: &[String],
) -> ConsolidationResult {
    let mut rows: Vec<GradeLevelRow> = Vec::new();

    fn row_index(rows: &mut Vec<GradeLevelRow>, grade_level: &str) -> usize {
        if let Some(pos) = rows.iter().position(|r| r.grade_level == grade_level) {
            return pos;
        }
        rows.push(GradeLevelRow::empty(grade_level));
        rows.len() - 1
    }

    for e in enrollment {
        let grade_level = e.grade_level.trim();
        if grade_level.is_empty() {
            continue;
        }
        let idx = row_index(&mut rows, grade_level);
        rows[idx].enrollment.increment(e.sex);
    }

    for r in records {
        let grade_level = r.grade_level.trim();
        if grade_level.is_empty() {
            continue;
        }
        let idx = row_index(&mut rows, grade_level);
        let row = &mut rows[idx];
        row.weighed.increment(r.sex);
        if let Some(status) = r.nutritional_status {
            row.bmi.increment(status, r.sex);
        }
        if let Some(status) = r.height_for_age_status {
            row.hfa.increment(status, r.sex);
        }
    }

    rows.sort_by_key(|row| {
        grade_levels_offered
            .iter()
            .position(|g| g == &row.grade_level)
            .unwrap_or(usize::MAX)
    });

    let mut grand_total = GradeLevelRow::empty("GRAND TOTAL");
    for row in &rows {
        grand_total.accumulate(row);
    }

    ConsolidationResult {
        grade_levels: rows,
        grand_total,
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct SexPercentage {
    pub m: Option<f64>,
    pub f: Option<f64>,
    pub t: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct GradeLevelPercentages {
    pub weighed: SexPercentage,
    pub bmi: BmiCategoryPercentages,
    pub hfa: HfaCategoryPercentages,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct BmiCategoryPercentages {
    pub severely_wasted: SexPercentage,
    pub wasted: SexPercentage,
    pub normal: SexPercentage,
    pub overweight: SexPercentage,
    pub obese: SexPercentage,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct HfaCategoryPercentages {
    pub severely_stunted: SexPercentage,
    pub stunted: SexPercentage,
    pub normal: SexPercentage,
    pub tall: SexPercentage,
}

fn pct(count: u32, denom: u32) -> Option<f64> {
    if denom > 0 {
        Some((count as f64 / denom as f64) * 100.0)
    } else {
        None
    }
}

fn pct3(counts: &SexCount, denom: &SexCount) -> SexPercentage {
    SexPercentage {
        m: pct(counts.m, denom.m),
        f: pct(counts.f, denom.f),
        t: pct(counts.t, denom.t),
    }
}

/// Derives the official form's percentage columns from an already-correct
/// row's counts -- pure math, no new counting logic. Per the ported
/// legacy workbook verification: Pupils Weighed % = weighed / enrolment
/// (coverage), and every BMI/HFA category % = category count / weighed
/// (not enrolment). Returns `None` for a percentage whose denominator is
/// 0 -- never `NaN`, never a fabricated 0%.
pub fn with_percentages(row: &GradeLevelRow) -> GradeLevelPercentages {
    GradeLevelPercentages {
        weighed: pct3(&row.weighed, &row.enrollment),
        bmi: BmiCategoryPercentages {
            severely_wasted: pct3(&row.bmi.severely_wasted, &row.weighed),
            wasted: pct3(&row.bmi.wasted, &row.weighed),
            normal: pct3(&row.bmi.normal, &row.weighed),
            overweight: pct3(&row.bmi.overweight, &row.weighed),
            obese: pct3(&row.bmi.obese, &row.weighed),
        },
        hfa: HfaCategoryPercentages {
            severely_stunted: pct3(&row.hfa.severely_stunted, &row.weighed),
            stunted: pct3(&row.hfa.stunted, &row.weighed),
            normal: pct3(&row.hfa.normal, &row.weighed),
            tall: pct3(&row.hfa.tall, &row.weighed),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enrollment_fixture() -> Vec<EnrollmentRow> {
        vec![
            EnrollmentRow {
                grade_level: "5".into(),
                sex: Sex::Male,
            },
            EnrollmentRow {
                grade_level: "5".into(),
                sex: Sex::Female,
            },
            EnrollmentRow {
                grade_level: "5".into(),
                sex: Sex::Male,
            },
            EnrollmentRow {
                grade_level: "6".into(),
                sex: Sex::Female,
            },
        ]
    }

    fn records_fixture() -> Vec<NutritionRecordSummary> {
        vec![
            NutritionRecordSummary {
                grade_level: "5".into(),
                sex: Sex::Male,
                nutritional_status: Some(NutritionalStatus::Normal),
                height_for_age_status: Some(HeightForAgeStatus::Normal),
            },
            NutritionRecordSummary {
                grade_level: "5".into(),
                sex: Sex::Female,
                nutritional_status: Some(NutritionalStatus::Wasted),
                height_for_age_status: Some(HeightForAgeStatus::Stunted),
            },
            // A learner weighed but not yet classifiable (WHO table gap) --
            // must still count as "weighed," must NOT land in any bucket.
            NutritionRecordSummary {
                grade_level: "5".into(),
                sex: Sex::Male,
                nutritional_status: None,
                height_for_age_status: None,
            },
        ]
    }

    #[test]
    fn consolidate_by_grade_level_counts_enrolment_by_sex_and_total() {
        let result = consolidate_by_grade_level(
            &enrollment_fixture(),
            &[],
            &["5".to_string(), "6".to_string()],
        );
        let grade5 = &result.grade_levels[0];
        assert_eq!(grade5.grade_level, "5");
        assert_eq!(grade5.enrollment, SexCount { m: 2, f: 1, t: 3 });
        let grade6 = &result.grade_levels[1];
        assert_eq!(grade6.enrollment, SexCount { m: 0, f: 1, t: 1 });
    }

    #[test]
    fn consolidate_by_grade_level_counts_weighed_and_bmi_hfa_buckets() {
        let result = consolidate_by_grade_level(
            &enrollment_fixture(),
            &records_fixture(),
            &["5".to_string(), "6".to_string()],
        );
        let grade5 = &result.grade_levels[0];
        assert_eq!(grade5.weighed, SexCount { m: 2, f: 1, t: 3 });
        assert_eq!(grade5.bmi.normal, SexCount { m: 1, f: 0, t: 1 });
        assert_eq!(grade5.bmi.wasted, SexCount { m: 0, f: 1, t: 1 });
        // The unclassified record was weighed but landed in no bucket.
        assert_eq!(
            grade5.bmi.severely_wasted.t
                + grade5.bmi.wasted.t
                + grade5.bmi.normal.t
                + grade5.bmi.overweight.t
                + grade5.bmi.obese.t,
            2
        );
        assert_eq!(grade5.hfa.normal, SexCount { m: 1, f: 0, t: 1 });
        assert_eq!(grade5.hfa.stunted, SexCount { m: 0, f: 1, t: 1 });
    }

    #[test]
    fn consolidate_by_grade_level_computes_a_grand_total_across_all_grades() {
        let result = consolidate_by_grade_level(
            &enrollment_fixture(),
            &records_fixture(),
            &["5".to_string(), "6".to_string()],
        );
        assert_eq!(result.grand_total.grade_level, "GRAND TOTAL");
        assert_eq!(result.grand_total.enrollment, SexCount { m: 2, f: 2, t: 4 });
        assert_eq!(result.grand_total.weighed, SexCount { m: 2, f: 1, t: 3 });
    }

    #[test]
    fn consolidate_by_grade_level_sorts_by_grade_levels_offered_order() {
        let result = consolidate_by_grade_level(
            &enrollment_fixture(),
            &[],
            &["6".to_string(), "5".to_string()],
        );
        assert_eq!(result.grade_levels[0].grade_level, "6");
        assert_eq!(result.grade_levels[1].grade_level, "5");
    }

    #[test]
    fn consolidate_by_grade_level_sorts_a_grade_not_in_the_offered_list_last() {
        let mut enrollment = enrollment_fixture();
        enrollment.push(EnrollmentRow {
            grade_level: "7".into(),
            sex: Sex::Male,
        });
        let result =
            consolidate_by_grade_level(&enrollment, &[], &["5".to_string(), "6".to_string()]);
        assert_eq!(result.grade_levels.last().unwrap().grade_level, "7");
    }

    #[test]
    fn consolidate_by_grade_level_skips_blank_grade_levels() {
        let enrollment = vec![EnrollmentRow {
            grade_level: "   ".into(),
            sex: Sex::Male,
        }];
        let result = consolidate_by_grade_level(&enrollment, &[], &[]);
        assert!(result.grade_levels.is_empty());
    }

    #[test]
    fn with_percentages_computes_weighed_and_category_rates() {
        let row = GradeLevelRow {
            grade_level: "5".into(),
            enrollment: SexCount { m: 4, f: 4, t: 8 },
            weighed: SexCount { m: 2, f: 4, t: 6 },
            bmi: BmiCategoryBlock {
                normal: SexCount { m: 2, f: 2, t: 4 },
                ..Default::default()
            },
            hfa: HfaCategoryBlock::default(),
        };
        let pct = with_percentages(&row);
        assert_eq!(pct.weighed.m, Some(50.0));
        assert_eq!(pct.weighed.f, Some(100.0));
        assert_eq!(pct.weighed.t, Some(75.0));
        // normal % is of WEIGHED, not enrolment: 2/2=100% male, 2/4=50% female.
        assert_eq!(pct.bmi.normal.m, Some(100.0));
        assert_eq!(pct.bmi.normal.f, Some(50.0));
    }

    #[test]
    fn with_percentages_returns_none_rather_than_nan_for_zero_denominator() {
        let row = GradeLevelRow::empty("5");
        let pct = with_percentages(&row);
        assert_eq!(pct.weighed, SexPercentage::default());
        assert_eq!(pct.bmi.normal, SexPercentage::default());
    }
}
