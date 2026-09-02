import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriSchoolMemberRepository } from "./school-member-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("TauriSchoolMemberRepository", () => {
  it("lists members of the caller's own school via list_school_members", async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: "u-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
    ]);

    const result = await new TauriSchoolMemberRepository().listMembers();

    expect(mockInvoke).toHaveBeenCalledWith("list_school_members");
    expect(result).toEqual([
      { id: "u-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
    ]);
  });

  it("resets a colleague's password via admin_reset_teacher_password", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const result = await new TauriSchoolMemberRepository().resetPassword(
      "u-1",
      "brand-new-password",
    );

    expect(mockInvoke).toHaveBeenCalledWith("admin_reset_teacher_password", {
      targetUserId: "u-1",
      newPassword: "brand-new-password",
    });
    expect(result).toBe(true);
  });

  it("grants a role via grant_school_role", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriSchoolMemberRepository().grantRole("u-1", "registrar");

    expect(mockInvoke).toHaveBeenCalledWith("grant_school_role", {
      targetUserId: "u-1",
      roleName: "registrar",
    });
  });

  it("revokes a role via revoke_school_role", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriSchoolMemberRepository().revokeRole("u-1", "school_head");

    expect(mockInvoke).toHaveBeenCalledWith("revoke_school_role", {
      targetUserId: "u-1",
      roleName: "school_head",
    });
  });
});
