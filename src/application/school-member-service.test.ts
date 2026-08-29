import { describe, expect, it } from "vitest";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";
import { SchoolMemberApplicationService } from "./school-member-service";

const MEMBERS: SchoolMember[] = [
  { id: "u-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
];

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  calls = 0;
  async listMembers() {
    this.calls += 1;
    return MEMBERS;
  }
}

describe("SchoolMemberApplicationService", () => {
  it("lists members of the caller's own school", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.listMembers();

    expect(repo.calls).toBe(1);
    expect(result).toEqual(MEMBERS);
  });
});
