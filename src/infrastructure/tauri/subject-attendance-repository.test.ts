import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { SubjectAttendanceSession } from "../../domain/subject-attendance";
import { TauriSubjectAttendanceRepository } from "./subject-attendance-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const SESSION: SubjectAttendanceSession = {
  id: "session-1",
  schoolId: "school-1",
  teachingAssignmentId: "ta-1",
  sectionId: "sec-1",
  subjectId: "sub-1",
  sessionDate: "2026-08-29",
  status: "held",
  createdByUserId: "teacher-1",
  createdAt: "now",
  updatedAt: "now",
};

describe("TauriSubjectAttendanceRepository", () => {
  it("opens a session", async () => {
    mockInvoke.mockResolvedValueOnce(SESSION);

    const result = await new TauriSubjectAttendanceRepository().openSession("ta-1", "2026-08-29");

    expect(mockInvoke).toHaveBeenCalledWith("open_subject_attendance_session", {
      teachingAssignmentId: "ta-1",
      sessionDate: "2026-08-29",
    });
    expect(result).toEqual(SESSION);
  });

  it("marks a day no class", async () => {
    mockInvoke.mockResolvedValueOnce({ ...SESSION, status: "no_class" });

    await new TauriSubjectAttendanceRepository().markNoClass("ta-1", "2026-08-29");

    expect(mockInvoke).toHaveBeenCalledWith("mark_subject_attendance_no_class", {
      teachingAssignmentId: "ta-1",
      sessionDate: "2026-08-29",
    });
  });

  it("records an entry with an explicit null note when none is given", async () => {
    mockInvoke.mockResolvedValueOnce({ kind: "recorded", entry: {} });

    await new TauriSubjectAttendanceRepository().recordEntry(
      "ta-1",
      "session-1",
      "mem-1",
      "present",
    );

    expect(mockInvoke).toHaveBeenCalledWith("record_subject_attendance_entry", {
      teachingAssignmentId: "ta-1",
      sessionId: "session-1",
      membershipId: "mem-1",
      status: "present",
      note: null,
    });
  });

  it("marks all present", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await new TauriSubjectAttendanceRepository().markAllPresent("ta-1", "session-1");

    expect(mockInvoke).toHaveBeenCalledWith("mark_subject_attendance_all_present", {
      teachingAssignmentId: "ta-1",
      sessionId: "session-1",
    });
  });

  it("loads a session's roster", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await new TauriSubjectAttendanceRepository().rosterForSession("ta-1", "session-1");

    expect(mockInvoke).toHaveBeenCalledWith("subject_attendance_roster_for_session", {
      teachingAssignmentId: "ta-1",
      sessionId: "session-1",
    });
  });

  it("lists sessions for an assignment", async () => {
    mockInvoke.mockResolvedValueOnce([SESSION]);

    const result = await new TauriSubjectAttendanceRepository().listSessions("ta-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_subject_attendance_sessions", {
      teachingAssignmentId: "ta-1",
    });
    expect(result).toEqual([SESSION]);
  });

  it("loads the monitor for an assignment as of a date", async () => {
    const monitor = { heldSessionCount: 2, rows: [] };
    mockInvoke.mockResolvedValueOnce(monitor);

    const result = await new TauriSubjectAttendanceRepository().monitor("ta-1", "2026-08-29");

    expect(mockInvoke).toHaveBeenCalledWith("subject_attendance_monitor", {
      teachingAssignmentId: "ta-1",
      asOfDate: "2026-08-29",
    });
    expect(result).toEqual(monitor);
  });
});
