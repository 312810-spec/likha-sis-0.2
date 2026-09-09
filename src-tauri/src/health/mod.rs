//! SF8 Health & Nutrition Engine (ADR-0071): decimal-age-in-months, BMI,
//! WHO/DepEd BMI-for-Age and Height-for-Age classification, and the
//! BOSY-vs-EOSY school-wide consolidation report. See `nutrition` for the
//! per-learner computations and `consolidation` for the school-wide
//! rollup. Pure domain logic only -- no SQL here, see
//! `repository::nutrition` for persistence and `commands::nutrition` for
//! the Tauri command boundary, per this project's architecture rules.

pub mod consolidation;
pub mod nutrition;
