import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { ClassOccurrence, LearnerFollowupMarker } from "../../domain/class-occurrence";
import { TauriClassOccurrenceRepository } from "./class-occurrence-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const occurrence: ClassOccurrence = {
  id: "occ-1",
  schoolId: "s1",
  teachingAssignmentId: "ta-1",
  occurrenceDate: "2026-09-09",
  status: "planned",
  plannedStartsAt: "08:00",
  plannedEndsAt: "08:50",
  plannedRoom: "Room A",
  actualStartsAt: null,
  actualEndsAt: null,
  actualRoom: null,
  learningTarget: "Adds polynomials (M7AL-Ig-1)",
  quickEvidence: "",
  notes: "",
  summary: "",
  cancelledReason: "",
  startedAt: "2026-09-09T00:00:00.000Z",
  finishedAt: null,
  cancelledAt: null,
  revision: 0,
  createdByUserId: "u1",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

describe("TauriClassOccurrenceRepository", () => {
  it("start invokes start_class_occurrence with the class and date only (scope comes from the session)", async () => {
    mockInvoke.mockResolvedValueOnce({ outcome: "started", occurrence });

    const result = await new TauriClassOccurrenceRepository().start("ta-1", "2026-09-09");

    expect(mockInvoke).toHaveBeenCalledWith("start_class_occurrence", {
      teachingAssignmentId: "ta-1",
      occurrenceDate: "2026-09-09",
    });
    expect(result).toEqual({ outcome: "started", occurrence });
  });

  it("capture sends null for every omitted field so the Rust side reads them as unchanged", async () => {
    mockInvoke.mockResolvedValueOnce(occurrence);

    await new TauriClassOccurrenceRepository().capture("ta-1", "2026-09-09", {
      quickEvidence: "Exit slips collected",
    });

    expect(mockInvoke).toHaveBeenCalledWith("capture_class_occurrence", {
      teachingAssignmentId: "ta-1",
      occurrenceDate: "2026-09-09",
      actualStartsAt: null,
      actualEndsAt: null,
      actualRoom: null,
      learningTarget: null,
      quickEvidence: "Exit slips collected",
      notes: null,
    });
  });

  it("finish invokes finish_class_occurrence with the summary", async () => {
    mockInvoke.mockResolvedValueOnce({ outcome: "updated", occurrence });

    await new TauriClassOccurrenceRepository().finish("ta-1", "2026-09-09", "Went well");

    expect(mockInvoke).toHaveBeenCalledWith("finish_class_occurrence", {
      teachingAssignmentId: "ta-1",
      occurrenceDate: "2026-09-09",
      summary: "Went well",
    });
  });

  it("cancel invokes cancel_class_occurrence with the reason", async () => {
    mockInvoke.mockResolvedValueOnce({ outcome: "updated", occurrence });

    await new TauriClassOccurrenceRepository().cancel("ta-1", "2026-09-09", "Suspension");

    expect(mockInvoke).toHaveBeenCalledWith("cancel_class_occurrence", {
      teachingAssignmentId: "ta-1",
      occurrenceDate: "2026-09-09",
      reason: "Suspension",
    });
  });

  it("getForDate invokes get_class_occurrence and passes null through", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriClassOccurrenceRepository().getForDate("ta-1", "2026-09-09");

    expect(mockInvoke).toHaveBeenCalledWith("get_class_occurrence", {
      teachingAssignmentId: "ta-1",
      occurrenceDate: "2026-09-09",
    });
    expect(result).toBeNull();
  });

  it("listForAssignment invokes list_class_occurrences", async () => {
    mockInvoke.mockResolvedValueOnce([occurrence]);

    const result = await new TauriClassOccurrenceRepository().listForAssignment("ta-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_class_occurrences", {
      teachingAssignmentId: "ta-1",
    });
    expect(result).toEqual([occurrence]);
  });

  it("markFollowup and clearFollowup key to the occurrence and the membership", async () => {
    const marker: LearnerFollowupMarker = {
      id: "m-1",
      schoolId: "s1",
      classOccurrenceId: "occ-1",
      sectionMembershipId: "sm-1",
      reason: "Call home",
      clearedAt: null,
      markedByUserId: "u1",
      markedAt: "2026-09-09T00:00:00.000Z",
    };
    mockInvoke.mockResolvedValueOnce(marker);
    mockInvoke.mockResolvedValueOnce({ ...marker, clearedAt: "2026-09-09T01:00:00.000Z" });

    const marked = await new TauriClassOccurrenceRepository().markFollowup(
      "occ-1",
      "sm-1",
      "Call home",
    );
    const cleared = await new TauriClassOccurrenceRepository().clearFollowup("occ-1", "sm-1");

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "mark_learner_followup", {
      classOccurrenceId: "occ-1",
      sectionMembershipId: "sm-1",
      reason: "Call home",
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "clear_learner_followup", {
      classOccurrenceId: "occ-1",
      sectionMembershipId: "sm-1",
    });
    expect(marked?.clearedAt).toBeNull();
    expect(cleared?.clearedAt).not.toBeNull();
  });

  it("listFollowupMarkers invokes list_learner_followup_markers", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    const result = await new TauriClassOccurrenceRepository().listFollowupMarkers("occ-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_learner_followup_markers", {
      classOccurrenceId: "occ-1",
    });
    expect(result).toEqual([]);
  });
});
