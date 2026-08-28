/**
 * Result of generating an SF1 (School Register) workbook for one section —
 * the TS mirror of the Rust `formgen::sf1::Sf1GenerationResult`. `null`
 * (not this type) means the section did not resolve within the caller's
 * own school; that case is never surfaced as an error.
 */
export interface Sf1GenerationResult {
  outputPath: string;
  learnerCount: number;
  templateFormType: string;
  templateVersion: string;
}

/**
 * Result of generating an SF9 (Learner's Progress Report Card) workbook
 * for one learner in one section — the TS mirror of the Rust
 * `formgen::sf9::Sf9GenerationResult`. `null` means the section/learner
 * did not resolve within the caller's own school, or the learner is not
 * currently an active member of that section as of the given date.
 */
export interface Sf9GenerationResult {
  outputPath: string;
  subjectCount: number;
  templateFormType: string;
  templateVersion: string;
}
