import type { SchoolMember } from "../school-member";

/**
 * Read-only reference data: every member of the caller's own school.
 * `school_id` is always session-derived server-side, never a parameter
 * here -- matching every other same-school reference-data command in
 * this codebase.
 */
export interface SchoolMemberRepository {
  listMembers(): Promise<SchoolMember[]>;
}
