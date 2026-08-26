//! SF1 (School Register) generation domain contract — Wave 3. See
//! `docs/adr/0048-official-form-engine-sf1.md`.
//!
//! Deliberately holds only normalized, already-authorized data — never a
//! `Connection` or a school/section id. The application layer
//! (`commands::formgen`) is the only place permitted to query the
//! database; everything below this point works from a plain in-memory
//! value, exactly like `import::sf1`'s contract types on the read side.

use serde::{Deserialize, Serialize};

/// One learner row as it will appear on the generated form. Deliberately
/// narrower than `repository::section_membership::SectionRosterMember` —
/// this struct only ever carries what SF1 generation actually writes,
/// so a future field added to the roster type doesn't silently become
/// "available to put on an official form" without a conscious decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1LearnerRow {
    pub lrn: Option<String>,
    pub family_name: String,
    pub given_name: String,
    pub sex: Option<String>,
}

/// Everything one SF1 generation run needs, already resolved and
/// authorized by the caller. `learners` is expected in the display
/// order the form should show them in (the application service is
/// responsible for sorting — this struct does not re-sort).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1GenerationRequest {
    pub school_name: String,
    pub school_year: String,
    pub grade_level: String,
    pub section_name: String,
    pub learners: Vec<Sf1LearnerRow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1GenerationResult {
    pub output_path: String,
    pub learner_count: usize,
    pub template_form_type: String,
    pub template_version: String,
}
