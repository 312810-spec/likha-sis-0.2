import type { Learner } from "./learner";

/** The exact, case-insensitive header this app's bulk-import CSV must
 * have, in this order — mirrors `import::learner::EXPECTED_HEADER` on
 * the Rust side. Exposed here so the UI can show a teacher what a valid
 * file looks like without duplicating the literal elsewhere. */
export const LEARNER_IMPORT_CSV_HEADER = ["given_name", "family_name", "lrn", "sex"] as const;

/** One parsed CSV row, annotated with any potential duplicate already in
 * this school. A row with its own `error` (malformed LRN, missing name,
 * wrong column count, ...) is still returned — never silently dropped —
 * so every row's status can be shown in one pass; see ADR-0046. */
export interface LearnerImportPreviewRow {
  rowNumber: number;
  givenName: string;
  familyName: string;
  lrn: string | null;
  sex: string | null;
  error: string | null;
  potentialDuplicate: Learner | null;
}

export type LearnerImportAction = "create" | "update" | "skip";

/** One authorized user's resolved decision for one previewed row. The
 * `final*` values are always computed here on the frontend (never
 * re-derived from the original row on the Rust side) — this is how a
 * wholesale "use the imported row" and a per-field reconciliation both
 * resolve to the exact same `update` action underneath. */
export interface LearnerImportDecision {
  rowNumber: number;
  action: LearnerImportAction;
  existingLearnerId: string | null;
  importedGivenName: string;
  importedFamilyName: string;
  importedLrn: string | null;
  importedSex: string | null;
  finalGivenName: string;
  finalFamilyName: string;
  finalLrn: string | null;
  finalSex: string | null;
}

export interface LearnerImportBatchResult {
  batchId: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

export interface LearnerImportLogEntry {
  id: string;
  batchId: string;
  rowNumber: number;
  decision: "created" | "updated" | "skipped";
  resultingLearnerId: string | null;
  potentialDuplicateLearnerId: string | null;
  importedGivenName: string;
  importedFamilyName: string;
  importedLrn: string | null;
  importedSex: string | null;
  createdAt: string;
}
