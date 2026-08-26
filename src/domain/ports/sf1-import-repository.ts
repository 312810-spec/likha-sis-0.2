import type {
  Sf1ImportHistoryEntry,
  Sf1ImportPreview,
  Sf1ImportSummary,
  Sf1RowCommitPlan,
} from "../sf1-import";

/**
 * Repository port for the SF1 bulk import engine (Wave 2B/ADR-0043,
 * extended Wave 2E). `preview` never writes anything; `commit` is the
 * one-transaction write path. None of these methods take a `schoolId` —
 * scope is always derived from the active session on the Rust side,
 * exactly like every other repository port in this app (see ADR-0004).
 * `commit` takes the same `filePath` `preview` was called with —
 * Wave 2E's `commit_sf1_import` command re-reads it to compute the
 * filename/fingerprint recorded on the resulting history row itself,
 * rather than trusting a client-supplied value for that record.
 */
export interface Sf1ImportRepository {
  preview(filePath: string): Promise<Sf1ImportPreview>;
  commit(
    sectionId: string,
    startsOn: string,
    plans: Sf1RowCommitPlan[],
    filePath: string,
  ): Promise<Sf1ImportSummary>;
  listImportHistory(limit: number): Promise<Sf1ImportHistoryEntry[]>;
}
