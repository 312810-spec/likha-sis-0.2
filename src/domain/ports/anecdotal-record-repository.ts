import type {
  AnecdotalCategory,
  AnecdotalRecord,
  AnecdotalRecordFollowup,
  AnecdotalRecordFollowupInput,
  AnecdotalRecordInput,
} from "../anecdotal-record";

/**
 * Port for Anecdotal / Guidance Records (Batch 12, ADR-0083). `schoolId`/
 * the acting user are never client-trusted for authorization -- the Rust
 * command layer derives the session and checks
 * `auth::authorize_child_protection_access_for_section` server-side
 * (reused directly from DO 006 Child Protection, ADR-0072); this port
 * only carries the ids/fields needed to route the call. `asOfDate` on
 * the follow-up operations is the same "as of which date is the caller
 * the section's adviser" parameter
 * `authorize_child_protection_access_for_section` requires everywhere
 * else in this codebase.
 */
export interface AnecdotalRecordRepository {
  record(input: AnecdotalRecordInput): Promise<AnecdotalRecord>;
  listForSection(sectionId: string, asOfDate: string): Promise<AnecdotalRecord[]>;
  addFollowup(input: AnecdotalRecordFollowupInput): Promise<AnecdotalRecordFollowup>;
  listFollowups(
    anecdotalRecordId: string,
    sectionId: string,
    asOfDate: string,
  ): Promise<AnecdotalRecordFollowup[]>;
  /** Narrow, read-only existence check (Batch 13, ADR-0084): does
   * `learnerId` have any anecdotal record in one of `categories`, in
   * `sectionId`? Gated by the exact same authorization as every other
   * operation on this port -- there is no weaker "view-only" gate for
   * this sensitive data. Returns a bare boolean, never the matching
   * records' narrative content, so a caller that only needs a
   * disqualification signal (e.g. the award-eligibility screen) never
   * pulls full guidance narratives into memory just to check it. */
  hasCategoryForLearner(
    sectionId: string,
    learnerId: string,
    categories: readonly AnecdotalCategory[],
    asOfDate: string,
  ): Promise<boolean>;
}
