import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { School } from "../../domain/school";
import { TauriSchoolRepository } from "./school-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSchoolRepository", () => {
  it("listAll invokes list_schools and returns the result", async () => {
    const schools: School[] = [{ id: "1", name: "Rizal Elementary", createdAt: "now" }];
    mockInvoke.mockResolvedValueOnce(schools);

    const result = await new TauriSchoolRepository().listAll();

    expect(mockInvoke).toHaveBeenCalledWith("list_schools");
    expect(result).toEqual(schools);
  });

  it("create invokes create_school with the name", async () => {
    const school: School = { id: "1", name: "Rizal Elementary", createdAt: "now" };
    mockInvoke.mockResolvedValueOnce(school);

    const result = await new TauriSchoolRepository().create("Rizal Elementary");

    expect(mockInvoke).toHaveBeenCalledWith("create_school", { name: "Rizal Elementary" });
    expect(result).toEqual(school);
  });
});
