import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TauriClassroomDraftRepository } from "./classroom-draft-repository";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
describe("device-local classroom draft boundary", () => {
  it("passes only assignment/date/revision and editable fields, with no caller authority", async () => {
    const repository = new TauriClassroomDraftRepository();
    const scope = {
      teachingAssignmentId: "ta-1",
      occurrenceDate: "2026-10-11",
      expectedRevision: 2,
    };
    const fields = {
      actualStartsAt: "",
      actualEndsAt: "",
      actualRoom: "",
      learningTarget: "Target",
      quickEvidence: "",
      notes: "Draft",
      finishSummary: "",
      cancelReason: "",
      pendingReason: "",
      markingMembershipId: null,
    };
    await repository.save(scope, fields);
    expect(invoke).toHaveBeenLastCalledWith("save_classroom_draft", { ...scope, fields });
    await repository.load(scope);
    expect(invoke).toHaveBeenLastCalledWith("load_classroom_draft", scope);
    await repository.remove(scope);
    expect(invoke).toHaveBeenLastCalledWith("remove_classroom_draft", scope);
  });
});
