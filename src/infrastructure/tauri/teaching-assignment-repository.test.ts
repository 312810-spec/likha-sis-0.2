import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriTeachingAssignmentRepository } from "./teaching-assignment-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("TauriTeachingAssignmentRepository", () => {
  it("projects the existing list_teacher_assignments detail down to the narrow summary shape", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: "ta-1",
        schoolId: "school-1",
        teacherUserId: "teacher-1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        schoolYear: "2026-2027",
        subjectId: "sub-1",
        subjectName: "Mathematics",
        createdAt: "now",
      },
    ]);

    const result = await new TauriTeachingAssignmentRepository().listMine("teacher-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_teacher_assignments", {
      teacherUserId: "teacher-1",
    });
    expect(result).toEqual([
      {
        id: "ta-1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        schoolYear: "2026-2027",
        subjectId: "sub-1",
        subjectName: "Mathematics",
      },
    ]);
  });

  it("passes through the existing list_schedule_meetings_by_assignment command unchanged", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: "meeting-1",
        teachingAssignmentId: "ta-1",
        weekday: 1,
        startsAt: "08:00",
        endsAt: "09:00",
        room: "Room 3",
      },
    ]);

    const result = await new TauriTeachingAssignmentRepository().listMeetings("ta-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_schedule_meetings_by_assignment", {
      teachingAssignmentId: "ta-1",
    });
    expect(result).toEqual([
      {
        id: "meeting-1",
        teachingAssignmentId: "ta-1",
        weekday: 1,
        startsAt: "08:00",
        endsAt: "09:00",
        room: "Room 3",
      },
    ]);
  });
});
