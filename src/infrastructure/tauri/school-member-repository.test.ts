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
});
