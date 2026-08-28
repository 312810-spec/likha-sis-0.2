import type { Sf1GenerationResult, Sf9GenerationResult } from "../form-generation";

/**
 * Repository port for the official-form (SF1/SF9) generation engine —
 * a purpose-specific port, not folded into {@link SectionRepository} or
 * `ExportRepository`, matching this codebase's established convention of
 * one repository per concern (see `EnrollmentHistoryRepository` for the
 * same reasoning). `schoolId` is never a parameter anywhere here — it is
 * always derived from the current session on the Rust side.
 */
export interface FormGenerationRepository {
  /**
   * Generate an SF1 (School Register) workbook for `sectionId`'s current
   * roster as of `asOfDate` (`YYYY-MM-DD`), saved to
   * `Documents\LIKHA-SIS\`. Resolves `null` when `sectionId` does not
   * belong to the caller's own school — never throws for that case.
   */
  generateSf1(sectionId: string, asOfDate: string): Promise<Sf1GenerationResult | null>;
  /**
   * Generate an SF9 (Learner's Progress Report Card) workbook for
   * `learnerId` in `sectionId`, as of `asOfDate` (`YYYY-MM-DD`). Resolves
   * `null` when the section/learner do not belong to the caller's own
   * school, or the learner is not an active member of that section as of
   * `asOfDate` — never throws for those cases.
   */
  generateSf9(
    sectionId: string,
    learnerId: string,
    asOfDate: string,
  ): Promise<Sf9GenerationResult | null>;
}
