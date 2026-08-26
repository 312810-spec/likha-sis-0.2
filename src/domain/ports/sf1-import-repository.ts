import type { Sf1ImportPreview, Sf1ImportSummary, Sf1RowCommitPlan } from "../sf1-import";

/**
 * Repository port for the SF1 bulk import engine (Wave 2B/ADR-0043).
 * `preview` never writes anything; `commit` is the one-transaction write
 * path. Neither method takes a `schoolId` — scope is always derived from
 * the active session on the Rust side, exactly like every other
 * repository port in this app (see ADR-0004).
 */
export interface Sf1ImportRepository {
  preview(filePath: string): Promise<Sf1ImportPreview>;
  commit(sectionId: string, startsOn: string, plans: Sf1RowCommitPlan[]): Promise<Sf1ImportSummary>;
}
