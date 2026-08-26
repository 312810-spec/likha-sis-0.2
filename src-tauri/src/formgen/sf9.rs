//! SF9 (Learner's Progress Report Card) generation domain contract —
//! Wave 2I. See `docs/adr/0049-multi-form-official-form-contract.md`.
//!
//! **No authoritative DepEd SF9 template exists in this repository or
//! was obtainable from `deped.gov.ph` during this wave's evidence gate
//! — `OFFICIAL_SF9_FIDELITY = NOT_VERIFIED`.** This contract exists to
//! prove the generalized `formgen` architecture accepts a second,
//! differently-shaped form; it must never be presented to a user as an
//! official DepEd SF9. See ADR-0049's "SF9 evidence gate" section.
//!
//! Deliberately a SEPARATE, differently-shaped type from
//! `sf1::Sf1GenerationRequest` — not a shared/generic form-request type
//! — per this wave's own architecture requirement that a form-specific
//! mapping bug cannot accidentally compile as a different form's data.

use serde::{Deserialize, Serialize};

/// One subject's grade across the school's grading periods, already
/// resolved via the EXISTING `repository::grading_computation::
/// compute_term_grade` (never reimplemented here — see
/// `formgen::sf9_projection`). `term_grade` is `None` when no computed
/// grade exists yet for that subject/period (e.g. an ungraded subject),
/// which this contract represents explicitly rather than as a
/// placeholder number.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf9SubjectTermGrade {
    pub subject_name: String,
    pub grading_period_label: String,
    pub term_grade: Option<u32>,
}

/// Everything one SF9 generation run needs for exactly one learner,
/// already resolved and authorized by the caller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf9GenerationRequest {
    pub school_name: String,
    pub school_year: String,
    pub grade_level: String,
    pub section_name: String,
    pub learner_name: String,
    pub lrn: Option<String>,
    pub sex: Option<String>,
    pub subject_grades: Vec<Sf9SubjectTermGrade>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf9GenerationResult {
    pub output_path: String,
    pub subject_count: usize,
    pub template_form_type: String,
    pub template_version: String,
}
