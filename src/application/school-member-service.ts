import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";

/** No input to validate -- `listMembers` takes no parameters, matching
 * every other same-school reference-data read in this codebase. */
export class SchoolMemberApplicationService {
  constructor(private readonly schoolMembers: SchoolMemberRepository) {}

  listMembers(): Promise<SchoolMember[]> {
    return this.schoolMembers.listMembers();
  }
}
