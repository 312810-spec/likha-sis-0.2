import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";
import { SchoolMemberApplicationService } from "./school-member-service";

const MEMBERS: SchoolMember[] = [
  { id: "u-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
];

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  calls = 0;
  resetPasswordCalls: Array<{ targetUserId: string; newPassword: string }> = [];
  resetPasswordResult: boolean | "reject" = true;

  async listMembers() {
    this.calls += 1;
    return MEMBERS;
  }

  async resetPassword(targetUserId: string, newPassword: string): Promise<boolean> {
    this.resetPasswordCalls.push({ targetUserId, newPassword });
    if (this.resetPasswordResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.resetPasswordResult;
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

  it("resets a colleague's password, trimming the target id and passing the password through unchanged", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.resetPassword(" u-1 ", "brand-new-password");

    expect(result).toBe(true);
    expect(repo.resetPasswordCalls).toEqual([
      { targetUserId: "u-1", newPassword: "brand-new-password" },
    ]);
  });

  it("propagates a false result (target not found or in a different school) without throwing", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.resetPasswordResult = false;
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.resetPassword("u-1", "brand-new-password");

    expect(result).toBe(false);
  });

  it("rejects an empty target id before ever calling the repository", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.resetPassword("  ", "brand-new-password")).rejects.toThrow(
      ValidationError,
    );
    expect(repo.resetPasswordCalls).toHaveLength(0);
  });

  it("rejects a new password shorter than the minimum length before ever calling the repository", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.resetPassword("u-1", "short")).rejects.toThrow(ValidationError);
    expect(repo.resetPasswordCalls).toHaveLength(0);
  });
});
