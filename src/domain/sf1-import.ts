import type { Learner } from "./learner";

/**
 * Mirrors `src-tauri/src/import/sf1.rs`'s contract types exactly — field
 * names, enum tag shapes, and severity/kind values all match what
 * `preview_sf1_import`/`commit_sf1_import` actually send and expect (see
 * ADR-0043). This module does not re-implement any of Wave 2B's
 * normalization, validation, or matching rules — it only describes their
 * already-computed results.
 */
export interface Sf1ImportRow {
  rowNumber: number;
  givenName: string | null;
  familyName: string | null;
  lrn: string | null;
  lrnWasPresentButInvalid: boolean;
  sex: "M" | "F" | null;
  sexWasPresentButUnrecognized: boolean;
  /** Informational only — SF1 birthdates are never persisted as a
   * learner field (see ADR-0017/ADR-0043), so there is nothing to
   * compare it against on the "already in LIKHA" side of a duplicate
   * review. */
  birthdate: string | null;
  remarks: string | null;
}

export type IssueSeverity = "error" | "warning";

export interface Sf1ValidationIssue {
  rowNumber: number;
  field: string;
  severity: IssueSeverity;
  message: string;
}

export type MatchKind = "exact_lrn" | "suspected_duplicate" | "new";

export interface LearnerMatchResult {
  rowNumber: number;
  kind: MatchKind;
  candidates: Learner[];
  reason: string | null;
}

export interface Sf1ImportPreview {
  rows: Sf1ImportRow[];
  newRows: number[];
  exactMatches: LearnerMatchResult[];
  needsReview: LearnerMatchResult[];
  errors: Sf1ValidationIssue[];
  warnings: Sf1ValidationIssue[];
}

/**
 * Wire-format for `Sf1RowCommitPlan.action` — matches Rust's default
 * serde externally-tagged enum representation exactly: a unit variant
 * serializes as a bare string, a variant with fields as
 * `{ tagName: { ...fields } }`. Do not "clean this up" without checking
 * `src-tauri/src/import/sf1.rs`'s `Sf1RowAction` first.
 */
export type Sf1RowAction = "createNewLearner" | { enrollExistingLearner: { learnerId: string } };

export interface Sf1RowCommitPlan {
  rowNumber: number;
  givenName: string;
  familyName: string;
  lrn: string | null;
  sex: "M" | "F" | null;
  action: Sf1RowAction;
}

export interface Sf1ImportSummary {
  rowsCommitted: number;
  newLearnersCreated: number;
  existingLearnersEnrolled: number;
}

/**
 * A reviewer's decision for one `needsReview` row, keyed by
 * `rowNumber`. Mirrors the backend's `DuplicateResolution` (`UseExisting`
 * / `CreateSeparate`) — there is deliberately no third "merge" option;
 * see ADR-0043's "Decision 4."
 */
export type DuplicateDecision =
  { type: "useExisting"; learnerId: string } | { type: "createSeparate" };
