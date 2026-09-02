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
  grantRoleCalls: Array<{ targetUserId: string; roleName: string }> = [];
  revokeRoleCalls: Array<{ targetUserId: string; roleName: string }> = [];

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

  async grantRole(targetUserId: string, roleName: string): Promise<void> {
    this.grantRoleCalls.push({ targetUserId, roleName });
  }

  async revokeRole(targetUserId: string, roleName: string): Promise<void> {
    this.revokeRoleCalls.push({ targetUserId, roleName });
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

  it("grants a role, trimming the target id", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await service.grantRole(" u-1 ", "registrar");

    expect(repo.grantRoleCalls).toEqual([{ targetUserId: "u-1", roleName: "registrar" }]);
  });

  it("revokes a role, trimming the target id", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await service.revokeRole(" u-1 ", "school_head");

    expect(repo.revokeRoleCalls).toEqual([{ targetUserId: "u-1", roleName: "school_head" }]);
  });

  it("rejects an empty target id before calling the repository, for grant and revoke alike", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.grantRole("  ", "registrar")).rejects.toThrow(ValidationError);
    await expect(service.revokeRole("  ", "registrar")).rejects.toThrow(ValidationError);
    expect(repo.grantRoleCalls).toHaveLength(0);
    expect(repo.revokeRoleCalls).toHaveLength(0);
  });

  it("rejects an ungrantable role name before calling the repository", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.grantRole("u-1", "teacher")).rejects.toThrow(ValidationError);
    await expect(service.grantRole("u-1", "principal")).rejects.toThrow(ValidationError);
    expect(repo.grantRoleCalls).toHaveLength(0);
  });
});
