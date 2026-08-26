//! The shared contract types for the SF1 bulk import engine — deliberately
//! not persistence entities (`repository::learner::Learner`) and not the
//! raw workbook model (`import::workbook::RawSf1Row`). See
//! `docs/adr/0043-sf1-bulk-import-engine.md`.

use serde::{Deserialize, Serialize};

use crate::repository::learner::Learner;

/// One SF1 row after normalization (see `import::normalize`) but before
/// validation has decided whether it's usable. Holds both the raw,
/// as-read value and the normalized one for fields where that
/// distinction matters for validation messaging (e.g. "an LRN was
/// present but not in the expected format" vs. "no LRN was given").
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1ImportRow {
    pub row_number: usize,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
    /// `Some` only once the raw text has been trimmed and confirmed to
    /// match the 12-digit LRN format (the same format the `learners`
    /// table itself enforces — see migration comment near
    /// `idx_learners_school_lrn`). A present-but-malformed LRN is a hard
    /// validation error, not silently dropped to `None` here.
    pub lrn: Option<String>,
    pub lrn_was_present_but_invalid: bool,
    /// `Some("M")`/`Some("F")` only when the raw text unambiguously
    /// canonicalizes to one of DepEd's two recorded values (see
    /// `import::normalize::canonicalize_sex`). An unrecognized non-blank
    /// value is never guessed at — it surfaces as a warning instead and
    /// this stays `None`.
    pub sex: Option<String>,
    pub sex_was_present_but_unrecognized: bool,
    /// Informational only — not a persisted `Learner` field (see
    /// ADR-0017's original scope decision, left standing by this
    /// milestone). Used solely as an extra signal for duplicate
    /// matching and for surfacing an unparseable-date warning.
    pub birthdate: Option<String>,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    /// Blocks the row from being committed at all.
    Error,
    /// Does not block commit; surfaced for human review.
    Warning,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1ValidationIssue {
    pub row_number: usize,
    pub field: String,
    pub severity: IssueSeverity,
    /// A fixed, descriptive-but-generic message — deliberately never
    /// includes the offending cell's actual text or the learner's name,
    /// per this milestone's no-PII-in-diagnostics rule (see
    /// `docs/adr/0043-sf1-bulk-import-engine.md`'s Security section).
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchKind {
    /// The row's LRN exactly matches an existing learner in this school.
    /// Automated — LRN equality is DepEd's own stable identifier, not a
    /// judgment call.
    ExactLrn,
    /// The row's name matches an existing learner but the LRN doesn't
    /// (or one side is missing an LRN) — never auto-resolved; a human
    /// must choose `UseExisting` or `CreateSeparate`.
    SuspectedDuplicate,
    /// No existing learner in this school matches by LRN or name.
    New,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnerMatchResult {
    pub row_number: usize,
    pub kind: MatchKind,
    pub candidates: Vec<Learner>,
    /// Human-readable reason a `SuspectedDuplicate` was flagged (e.g.
    /// "name matches an existing learner in this school; LRN differs or
    /// is missing on one side"). `None` for `ExactLrn`/`New`, where the
    /// classification speaks for itself.
    pub reason: Option<String>,
}

/// A reviewer's decision for one `SuspectedDuplicate` row. There is no
/// merge option — this codebase has no learner merge/delete capability
/// (confirmed during Wave 2A.1's authorization audit), and this
/// milestone does not invent one. A row with no resolution is simply
/// excluded from commit.
#[derive(Debug, Clone, PartialEq)]
pub enum DuplicateResolution {
    UseExisting { learner_id: String },
    CreateSeparate,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1ImportPreview {
    /// Every row read from the workbook, normalized — including rows
    /// excluded from commit by a hard error. Kept alongside the
    /// classification lists below so a caller never has to re-parse the
    /// workbook just to look up one row's given/family name.
    pub rows: Vec<Sf1ImportRow>,
    pub new_rows: Vec<usize>,
    pub exact_matches: Vec<LearnerMatchResult>,
    pub needs_review: Vec<LearnerMatchResult>,
    pub errors: Vec<Sf1ValidationIssue>,
    pub warnings: Vec<Sf1ValidationIssue>,
}

/// What to do with one row at commit time — assembled by the caller from
/// a preview plus any `DuplicateResolution`s a reviewer made. A row with
/// unresolved errors, or a `SuspectedDuplicate` with no resolution, must
/// not appear here at all; `import::commit` treats every plan it
/// receives as already cleared for writing.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Sf1RowAction {
    CreateNewLearner,
    EnrollExistingLearner { learner_id: String },
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf1RowCommitPlan {
    pub row_number: usize,
    pub given_name: String,
    pub family_name: String,
    pub lrn: Option<String>,
    pub sex: Option<String>,
    pub action: Sf1RowAction,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Sf1ImportSummary {
    pub rows_committed: usize,
    pub new_learners_created: usize,
    pub existing_learners_enrolled: usize,
}
