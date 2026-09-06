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

  removeMemberCalls: string[] = [];
  removeMemberResult: boolean | "reject" = true;

  async removeMember(targetUserId: string): Promise<boolean> {
    this.removeMemberCalls.push(targetUserId);
    if (this.removeMemberResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.removeMemberResult;
  }

  grantRoleCalls: Array<{ targetUserId: string; role: string }> = [];
  grantRoleResult: boolean | "reject" = true;

  async grantRole(targetUserId: string, role: string): Promise<boolean> {
    this.grantRoleCalls.push({ targetUserId, role });
    if (this.grantRoleResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.grantRoleResult;
  }

  revokeRoleCalls: Array<{ targetUserId: string; role: string }> = [];
  revokeRoleResult: boolean | "reject" = true;

  async revokeRole(targetUserId: string, role: string): Promise<boolean> {
    this.revokeRoleCalls.push({ targetUserId, role });
    if (this.revokeRoleResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.revokeRoleResult;
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

  it("removes a member, trimming the target id", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.removeMember(" u-1 ");

    expect(result).toBe(true);
    expect(repo.removeMemberCalls).toEqual(["u-1"]);
  });

  it("propagates a false removal result (target not found, wrong school, or last School Head) without throwing", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.removeMemberResult = false;
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.removeMember("u-1");

    expect(result).toBe(false);
  });

  it("rejects an empty target id before ever calling the repository for removal", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.removeMember("  ")).rejects.toThrow(ValidationError);
    expect(repo.removeMemberCalls).toHaveLength(0);
  });

  it("grants a role, trimming the target id", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.grantRole(" u-1 ", "registrar");

    expect(result).toBe(true);
    expect(repo.grantRoleCalls).toEqual([{ targetUserId: "u-1", role: "registrar" }]);
  });

  it("propagates a false grant result without throwing", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.grantRoleResult = false;
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.grantRole("u-1", "registrar");

    expect(result).toBe(false);
  });

  it("rejects an empty target id before ever calling the repository for a grant", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.grantRole("  ", "registrar")).rejects.toThrow(ValidationError);
    expect(repo.grantRoleCalls).toHaveLength(0);
  });

  it("rejects an unrecognized role before ever calling the repository for a grant", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.grantRole("u-1", "principal")).rejects.toThrow(ValidationError);
    expect(repo.grantRoleCalls).toHaveLength(0);
  });

  it("revokes a role, trimming the target id", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.revokeRole(" u-1 ", "teacher");

    expect(result).toBe(true);
    expect(repo.revokeRoleCalls).toEqual([{ targetUserId: "u-1", role: "teacher" }]);
  });

  it("propagates a false revoke result (target not found, wrong school, role never held, or last School Head) without throwing", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.revokeRoleResult = false;
    const service = new SchoolMemberApplicationService(repo);

    const result = await service.revokeRole("u-1", "school_head");

    expect(result).toBe(false);
  });

  it("rejects an empty target id before ever calling the repository for a revoke", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.revokeRole("  ", "teacher")).rejects.toThrow(ValidationError);
    expect(repo.revokeRoleCalls).toHaveLength(0);
  });

  it("rejects an unrecognized role before ever calling the repository for a revoke", async () => {
    const repo = new FakeSchoolMemberRepository();
    const service = new SchoolMemberApplicationService(repo);

    await expect(service.revokeRole("u-1", "principal")).rejects.toThrow(ValidationError);
    expect(repo.revokeRoleCalls).toHaveLength(0);
  });
});
