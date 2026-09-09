/**
 * Anecdotal / Guidance Records -- domain types and validation (Batch 12,
 * ADR-0083).
 *
 * Structurally and sensitivity-wise this mirrors DO 006 Child
 * Protection's behavioral-incident shape (`src-tauri/src/repository/
 * child_protection.rs`, ADR-0072): one narrative row per learner,
 * section-scoped, plus an append-only follow-up log. `category` is
 * deliberately a generic `"positive" | "negative" | "neutral"`
 * classification -- NOT overfit to `award-eligibility.ts`'s narrow
 * "disciplinary" framing. Guidance records serve broader purposes than
 * honors eligibility (counseling notes, commendations, routine
 * observations); a disciplinary-only vocabulary would misrepresent most
 * of what an adviser actually records here.
 *
 * Batch 13 wires this entity into `award-eligibility.ts`'s previously
 * hardcoded-false anecdotes check. `DISQUALIFYING_ANECDOTAL_CATEGORIES`
 * below is the disqualification rule that wiring uses -- see its own
 * doc comment for exactly what it means and what it does NOT claim.
 */

export type AnecdotalCategory = "positive" | "negative" | "neutral";

export const ANECDOTAL_CATEGORIES: readonly AnecdotalCategory[] = [
  "positive",
  "negative",
  "neutral",
];

/**
 * IMPORTANT -- unverified rule, not DepEd law (see
 * `docs/adr/0084-award-eligibility-anecdotal-record-check.md` and
 * `docs/product/OWNER-DECISIONS-NEEDED.md` item 4): this project's own
 * conservative default is that any anecdotal/guidance record in the
 * `negative` category -- of any severity, since this generic category
 * model has no severity field to distinguish "minor" from "serious" --
 * disqualifies a learner from the Academic Excellence Award. `positive`
 * and `neutral` records never disqualify. This is a placeholder chosen
 * because no primary DepEd source for the actual honors-eligibility
 * anecdotes rule was found; it is NOT invented severity modeling beyond
 * what `AnecdotalCategory` already has -- it is the narrowest rule this
 * schema can express. Never present this as verified DepEd policy in UI
 * copy, reports, or a printed certificate.
 */
export const DISQUALIFYING_ANECDOTAL_CATEGORIES: readonly AnecdotalCategory[] = ["negative"];

/** True when `category` is one of `DISQUALIFYING_ANECDOTAL_CATEGORIES`.
 * Pure -- no I/O, no fetch. A caller (application service or UI) supplies
 * the record(s) it already fetched. */
export function isDisqualifyingAnecdotalCategory(category: AnecdotalCategory): boolean {
  return DISQUALIFYING_ANECDOTAL_CATEGORIES.includes(category);
}

export interface AnecdotalRecordInput {
  learnerId: string;
  sectionId: string;
  category: AnecdotalCategory;
  entryDate: string;
  narrative: string;
}

export interface AnecdotalRecordFollowupInput {
  anecdotalRecordId: string;
  sectionId: string;
  asOfDate: string;
  note: string;
}

export class AnecdotalRecordValidationError extends Error {}

/** Throws `AnecdotalRecordValidationError` on the first violation found;
 * returns the trimmed, normalized input on success. Mirrors
 * `repository::anecdotal_record::create_record`'s own validation
 * exactly, so a request that bypasses this service (a forged/raw IPC
 * call) is still rejected server-side, never merely relying on this
 * check. */
export function validateAnecdotalRecordInput(input: AnecdotalRecordInput): AnecdotalRecordInput {
  const learnerId = input.learnerId.trim();
  if (learnerId.length === 0) {
    throw new AnecdotalRecordValidationError("A learner is required.");
  }

  const sectionId = input.sectionId.trim();
  if (sectionId.length === 0) {
    throw new AnecdotalRecordValidationError("A section is required.");
  }

  if (!ANECDOTAL_CATEGORIES.includes(input.category)) {
    throw new AnecdotalRecordValidationError(
      "The category must be exactly one of 'positive', 'negative', or 'neutral'.",
    );
  }

  const entryDate = input.entryDate.trim();
  if (entryDate.length === 0) {
    throw new AnecdotalRecordValidationError("An entry date is required.");
  }

  const narrative = input.narrative.trim();
  if (narrative.length === 0) {
    throw new AnecdotalRecordValidationError("A narrative is required.");
  }

  return {
    learnerId,
    sectionId,
    category: input.category,
    entryDate,
    narrative,
  };
}

/** Mirrors `validateAnecdotalRecordInput`'s discipline for the
 * append-only follow-up log. */
export function validateAnecdotalRecordFollowupInput(
  input: AnecdotalRecordFollowupInput,
): AnecdotalRecordFollowupInput {
  const anecdotalRecordId = input.anecdotalRecordId.trim();
  if (anecdotalRecordId.length === 0) {
    throw new AnecdotalRecordValidationError("An anecdotal record is required.");
  }

  const sectionId = input.sectionId.trim();
  if (sectionId.length === 0) {
    throw new AnecdotalRecordValidationError("A section is required.");
  }

  const asOfDate = input.asOfDate.trim();
  if (asOfDate.length === 0) {
    throw new AnecdotalRecordValidationError("A date is required.");
  }

  const note = input.note.trim();
  if (note.length === 0) {
    throw new AnecdotalRecordValidationError("A follow-up note is required.");
  }

  return { anecdotalRecordId, sectionId, asOfDate, note };
}

/**
 * A persisted anecdotal/guidance record. Mirrors Rust's
 * `repository::anecdotal_record::AnecdotalRecord` exactly.
 */
export interface AnecdotalRecord {
  id: string;
  schoolId: string;
  learnerId: string;
  sectionId: string;
  authoredByUserId: string | null;
  category: AnecdotalCategory;
  entryDate: string;
  narrative: string;
  createdAt: string;
}

/**
 * One append-only follow-up entry. Mirrors Rust's
 * `repository::anecdotal_record::AnecdotalRecordFollowup` exactly.
 */
export interface AnecdotalRecordFollowup {
  id: string;
  anecdotalRecordId: string;
  authorUserId: string | null;
  note: string;
  createdAt: string;
}
