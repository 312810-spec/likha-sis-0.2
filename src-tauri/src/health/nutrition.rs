//! Decimal-age-in-months, BMI, and WHO/DepEd BMI-for-Age / Height-for-Age
//! classification for School Form 8 (SF8) Health & Nutrition status.
//!
//! Ported in spirit -- not verbatim -- from `likha-sis-master`'s
//! `nutritionComputations.js` (`312810-spec/likha-sis`,
//! `src/utils/nutritionComputations.js`, retrieved 2026-09-08). Age
//! computation, BMI computation, and the classification *logic* (which
//! band a value falls into, given band boundaries) are pure arithmetic,
//! fully verified by this module's own tests, and used exactly as ported.
//!
//! **The WHO 2007 growth-standard numeric reference tables are
//! deliberately NOT hardcoded here.** The legacy source has its own
//! `bmiForAgeTable.js`/`hfaForAgeTable.js`, self-attributed in a comment
//! to "the DepEd School Form 8 (SF8) workbook's BMI Tables sheet," but:
//!
//! 1. That attribution is itself a comment in a sibling project's source,
//!    not a citation to a primary WHO/DepEd document this session fetched
//!    and read directly.
//! 2. A spot-check of several rows (e.g. boys at exactly 60 months: the
//!    legacy table's `normalMax`/`overweightMax` of 18.3/20.2 do not
//!    reconcile confidently against this session's general knowledge of
//!    the published WHO 2007 5-19y BMI-for-age reference median/SD
//!    values, which would put the +1SD/+2SD cutoffs noticeably lower).
//!    That mismatch could mean the legacy table is wrong, or that this
//!    session's recollection is wrong -- either way, "not sure which"
//!    is exactly the condition under which this project's own rules
//!    (`.claude/rules/autonomous-development.md` gate #6;
//!    `CLAUDE.md`'s "never guess" instruction) require flagging, not
//!    hardcoding.
//!
//! Silently misclassifying a real child's nutrition status is a
//! correctness/safety defect per this project's own priority order, not
//! a cosmetic one. `lookup_bmi_cutoffs`/`lookup_hfa_cutoffs` therefore
//! return `None` unconditionally today; see `docs/VERIFICATION-DEBT.md`
//! for the exact gap and `docs/adr/0071-sf8-health-nutrition-engine.md`
//! for the decision record. Every other function in this module works
//! correctly and safely today regardless of that gap.

use serde::{Deserialize, Serialize};

/// Age range the WHO 2007 growth reference this project targets actually
/// covers: 5 to 19 years, matching DepEd's Kindergarten-exclusive,
/// Grade-1-to-12 school population. Outside this range, classification is
/// not defined -- callers should treat `None` as "not applicable," not
/// as evidence of a computation bug.
pub const BMI_TABLE_MIN_MONTHS: i64 = 60;
pub const BMI_TABLE_MAX_MONTHS: i64 = 228;
pub const HFA_TABLE_MIN_MONTHS: i64 = 60;
pub const HFA_TABLE_MAX_MONTHS: i64 = 228;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Sex {
    #[serde(rename = "M")]
    Male,
    #[serde(rename = "F")]
    Female,
}

impl Sex {
    /// Accepts "M"/"F" (any case) and "Male"/"Female" (any case), mirroring
    /// the legacy `normalizeSex`. Anything else (including "Other" or an
    /// empty string) is `None` -- there is no silent default sex.
    pub fn parse(raw: &str) -> Option<Sex> {
        match raw.trim().to_uppercase().as_str() {
            "M" | "MALE" => Some(Sex::Male),
            "F" | "FEMALE" => Some(Sex::Female),
            _ => None,
        }
    }
}

/// Parses a strict `YYYY-MM-DD` calendar date into `(year, month, day)`,
/// validating month/day range and leap years -- this project has no date
/// library dependency (see `repository::attendance`'s own
/// `days_in_month`/`is_leap_year`, the established precedent this
/// mirrors), so this is a small local implementation rather than a new
/// crate.
fn parse_iso_date(raw: &str) -> Option<(i64, u32, u32)> {
    let bytes = raw.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let year: i64 = raw.get(0..4)?.parse().ok()?;
    let month: u32 = raw.get(5..7)?.parse().ok()?;
    let day: u32 = raw.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }
    Some((year, month, day))
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

/// Whole number of months between `birth_date` and `measurement_date`
/// (both strict ISO `YYYY-MM-DD`), floored -- exactly mirroring the
/// legacy `getAgeInMonths`. Returns `None` for an invalid/malformed date
/// string, or when `measurement_date` is before `birth_date`.
pub fn age_in_months(birth_date: &str, measurement_date: &str) -> Option<i64> {
    let (by, bm, bd) = parse_iso_date(birth_date)?;
    let (my, mm, md) = parse_iso_date(measurement_date)?;

    let mut months = (my - by) * 12 + (mm as i64 - bm as i64);
    if md < bd {
        months -= 1;
    }
    if months < 0 {
        return None;
    }
    Some(months)
}

/// Body Mass Index (`weightKg / heightM^2`), rounded to 2 decimal places.
/// Returns `None` for a non-positive or non-finite weight/height.
pub fn compute_bmi(weight_kg: f64, height_m: f64) -> Option<f64> {
    if !weight_kg.is_finite() || !height_m.is_finite() || weight_kg <= 0.0 || height_m <= 0.0 {
        return None;
    }
    let bmi = weight_kg / (height_m * height_m);
    Some((bmi * 100.0).round() / 100.0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NutritionalStatus {
    SeverelyWasted,
    Wasted,
    Normal,
    Overweight,
    Obese,
}

/// The four upper-bound cutoffs a WHO/DepEd BMI-for-Age reference row
/// resolves to for one age-in-months + sex. `severely_wasted_max <
/// wasted_max < normal_max < overweight_max` is the caller's
/// responsibility to supply correctly (from a verified source) --
/// this struct is a plain data carrier, not itself a source of truth.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BmiForAgeCutoffs {
    pub severely_wasted_max: f64,
    pub wasted_max: f64,
    pub normal_max: f64,
    pub overweight_max: f64,
}

/// Classifies a BMI value against already-resolved cutoffs for the
/// learner's age/sex -- mirrors the legacy `classifyNutritionalStatus`'s
/// inclusive-upper-bound band logic exactly. This function makes no
/// claim about where `cutoffs` came from; see `lookup_bmi_cutoffs`.
pub fn classify_bmi_for_age(bmi: f64, cutoffs: &BmiForAgeCutoffs) -> NutritionalStatus {
    if bmi <= cutoffs.severely_wasted_max {
        NutritionalStatus::SeverelyWasted
    } else if bmi <= cutoffs.wasted_max {
        NutritionalStatus::Wasted
    } else if bmi <= cutoffs.normal_max {
        NutritionalStatus::Normal
    } else if bmi <= cutoffs.overweight_max {
        NutritionalStatus::Overweight
    } else {
        NutritionalStatus::Obese
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HeightForAgeStatus {
    SeverelyStunted,
    Stunted,
    Normal,
    Tall,
}

/// The three upper-bound cutoffs a WHO/DepEd Height-for-Age reference row
/// resolves to for one age-in-months + sex. See `BmiForAgeCutoffs`'s doc
/// comment -- the same "caller supplies verified numbers" contract.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HfaForAgeCutoffs {
    pub severely_stunted_max: f64,
    pub stunted_max: f64,
    pub normal_max: f64,
}

/// Classifies a height value against already-resolved cutoffs -- mirrors
/// the legacy `classifyHeightForAge`'s inclusive-upper-bound band logic.
pub fn classify_height_for_age(height_m: f64, cutoffs: &HfaForAgeCutoffs) -> HeightForAgeStatus {
    if height_m <= cutoffs.severely_stunted_max {
        HeightForAgeStatus::SeverelyStunted
    } else if height_m <= cutoffs.stunted_max {
        HeightForAgeStatus::Stunted
    } else if height_m <= cutoffs.normal_max {
        HeightForAgeStatus::Normal
    } else {
        HeightForAgeStatus::Tall
    }
}

/// WHO 2007 Growth Reference (5-19 years) BMI-for-Age cutoff lookup, by
/// exact age in whole months and sex.
///
/// **STATUS: NOT POPULATED -- this is tracked verification debt, not an
/// oversight to silently "finish" with plausible-looking numbers.** See
/// this module's top-level doc comment and `docs/VERIFICATION-DEBT.md`
/// for why. Returns `None` unconditionally today; a future session that
/// sources and independently verifies the real WHO/DepEd table should
/// replace this implementation and the module doc comment together, and
/// update `docs/VERIFICATION-DEBT.md` to close the gap.
pub fn lookup_bmi_cutoffs(_age_in_months: i64, _sex: Sex) -> Option<BmiForAgeCutoffs> {
    None
}

/// WHO 2007 Growth Reference (5-19 years) Height-for-Age cutoff lookup.
/// See `lookup_bmi_cutoffs`'s doc comment -- same status, same reason.
pub fn lookup_hfa_cutoffs(_age_in_months: i64, _sex: Sex) -> Option<HfaForAgeCutoffs> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Sex::parse ----

    #[test]
    fn sex_parse_accepts_short_and_long_forms_case_insensitively() {
        assert_eq!(Sex::parse("M"), Some(Sex::Male));
        assert_eq!(Sex::parse("m"), Some(Sex::Male));
        assert_eq!(Sex::parse("Male"), Some(Sex::Male));
        assert_eq!(Sex::parse("MALE"), Some(Sex::Male));
        assert_eq!(Sex::parse("F"), Some(Sex::Female));
        assert_eq!(Sex::parse("female"), Some(Sex::Female));
    }

    #[test]
    fn sex_parse_rejects_unrecognized_values() {
        assert_eq!(Sex::parse("Other"), None);
        assert_eq!(Sex::parse(""), None);
        assert_eq!(Sex::parse("X"), None);
    }

    // ---- age_in_months ----

    #[test]
    fn age_in_months_computes_exact_whole_number_for_exact_anniversaries() {
        assert_eq!(age_in_months("2015-06-15", "2020-06-15"), Some(60));
        assert_eq!(age_in_months("2010-01-01", "2020-01-01"), Some(120));
    }

    #[test]
    fn age_in_months_floors_when_measurement_day_is_before_birth_day_of_month() {
        assert_eq!(age_in_months("2015-06-15", "2020-06-14"), Some(59));
        assert_eq!(age_in_months("2015-06-15", "2020-06-16"), Some(60));
    }

    #[test]
    fn age_in_months_returns_none_for_invalid_date_strings() {
        assert_eq!(age_in_months("invalid-date", "2020-06-15"), None);
        assert_eq!(age_in_months("2015-06-15", "invalid"), None);
        assert_eq!(age_in_months("", "2020-06-15"), None);
        assert_eq!(age_in_months("2015-02-30", "2020-06-15"), None); // Feb 30 never exists
        assert_eq!(age_in_months("2015-13-01", "2020-06-15"), None); // month 13
    }

    #[test]
    fn age_in_months_returns_none_when_measurement_precedes_birth() {
        assert_eq!(age_in_months("2020-06-15", "2015-06-15"), None);
    }

    #[test]
    fn age_in_months_handles_leap_year_february() {
        // 2020 is a leap year; Feb 29 is a valid birth date.
        assert_eq!(age_in_months("2020-02-29", "2026-02-28"), Some(71));
        assert_eq!(age_in_months("2020-02-29", "2026-03-01"), Some(72));
    }

    // ---- compute_bmi ----

    #[test]
    fn compute_bmi_rounds_to_two_decimal_places() {
        assert_eq!(compute_bmi(40.0, 1.4), Some(20.41));
        assert_eq!(compute_bmi(50.0, 1.5), Some(22.22));
        assert_eq!(compute_bmi(60.0, 1.6), Some(23.44));
    }

    #[test]
    fn compute_bmi_rejects_nonpositive_or_nonfinite_inputs() {
        assert_eq!(compute_bmi(40.0, 0.0), None);
        assert_eq!(compute_bmi(40.0, -1.4), None);
        assert_eq!(compute_bmi(0.0, 1.4), None);
        assert_eq!(compute_bmi(-40.0, 1.4), None);
        assert_eq!(compute_bmi(f64::NAN, 1.4), None);
        assert_eq!(compute_bmi(40.0, f64::INFINITY), None);
    }

    // ---- classify_bmi_for_age ----

    fn sample_bmi_cutoffs() -> BmiForAgeCutoffs {
        BmiForAgeCutoffs {
            severely_wasted_max: 12.0,
            wasted_max: 12.9,
            normal_max: 18.3,
            overweight_max: 20.2,
        }
    }

    #[test]
    fn classify_bmi_for_age_covers_every_band_inclusive_of_upper_bound() {
        let c = sample_bmi_cutoffs();
        assert_eq!(
            classify_bmi_for_age(12.0, &c),
            NutritionalStatus::SeverelyWasted
        );
        assert_eq!(classify_bmi_for_age(12.9, &c), NutritionalStatus::Wasted);
        assert_eq!(classify_bmi_for_age(18.3, &c), NutritionalStatus::Normal);
        assert_eq!(
            classify_bmi_for_age(20.2, &c),
            NutritionalStatus::Overweight
        );
        assert_eq!(classify_bmi_for_age(20.21, &c), NutritionalStatus::Obese);
        assert_eq!(
            classify_bmi_for_age(11.99, &c),
            NutritionalStatus::SeverelyWasted
        );
    }

    // ---- classify_height_for_age ----

    fn sample_hfa_cutoffs() -> HfaForAgeCutoffs {
        HfaForAgeCutoffs {
            severely_stunted_max: 1.00,
            stunted_max: 1.05,
            normal_max: 1.25,
        }
    }

    #[test]
    fn classify_height_for_age_covers_every_band_inclusive_of_upper_bound() {
        let c = sample_hfa_cutoffs();
        assert_eq!(
            classify_height_for_age(1.00, &c),
            HeightForAgeStatus::SeverelyStunted
        );
        assert_eq!(
            classify_height_for_age(1.05, &c),
            HeightForAgeStatus::Stunted
        );
        assert_eq!(
            classify_height_for_age(1.25, &c),
            HeightForAgeStatus::Normal
        );
        assert_eq!(classify_height_for_age(1.26, &c), HeightForAgeStatus::Tall);
    }

    // ---- lookup tables: deliberately unpopulated ----

    #[test]
    fn lookup_bmi_cutoffs_is_deliberately_unpopulated_pending_a_verified_who_source() {
        // Regression guard: this MUST stay `None` until a future session
        // replaces the implementation alongside a verified citation and a
        // docs/VERIFICATION-DEBT.md update -- never flip silently.
        assert_eq!(lookup_bmi_cutoffs(72, Sex::Male), None);
        assert_eq!(lookup_bmi_cutoffs(120, Sex::Female), None);
    }

    #[test]
    fn lookup_hfa_cutoffs_is_deliberately_unpopulated_pending_a_verified_who_source() {
        assert_eq!(lookup_hfa_cutoffs(72, Sex::Male), None);
        assert_eq!(lookup_hfa_cutoffs(120, Sex::Female), None);
    }
}
