import type {
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
}
