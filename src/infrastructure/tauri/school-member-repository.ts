import type { SchoolMemberRepository } from "../../domain/ports/school-member-repository";
import type { SchoolMember } from "../../domain/school-member";
import { invoke } from "./invoke";

/** Tauri adapter for the new `list_school_members` command (Wave 2Y). */
export class TauriSchoolMemberRepository implements SchoolMemberRepository {
  listMembers(): Promise<SchoolMember[]> {
    return invoke<SchoolMember[]>("list_school_members");
  }
}
