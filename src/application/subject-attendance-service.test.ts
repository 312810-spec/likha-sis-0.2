import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type {
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { SubjectAttendanceApplicationService } from "./subject-attendance-service";

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

const ROSTER: SubjectAttendanceRosterRow[] = [
  {
    membershipId: "mem-1",
    learnerId: "l-1",
    givenName: "Ana",
    familyName: "Cruz",
    entryStatus: null,
  },
];

const ASSIGNMENTS: TeachingAssignmentSummary[] = [
  {
    id: "ta-1",
    sectionId: "sec-1",
    sectionName: "Mabini",
    schoolYear: "2026-2027",
    subjectId: "sub-1",
    subjectName: "Mathematics",
  },
];

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  calls: unknown[] = [];

  async openSession(teachingAssignmentId: string, sessionDate: string) {
    this.calls.push(["openSession", teachingAssignmentId, sessionDate]);
    return SESSION;
  }
  async markNoClass(teachingAssignmentId: string, sessionDate: string) {
    this.calls.push(["markNoClass", teachingAssignmentId, sessionDate]);
    return { ...SESSION, status: "no_class" as const };
  }
  async recordEntry(
    teachingAssignmentId: string,
    sessionId: string,
    membershipId: string,
    status: EntryStatus,
    note?: string,
  ): Promise<RecordEntryOutcome> {
    this.calls.push(["recordEntry", teachingAssignmentId, sessionId, membershipId, status, note]);
    return {
      kind: "recorded",
      entry: {
        id: "entry-1",
        sessionId,
        membershipId,
        learnerId: "l-1",
        status,
        note: note ?? null,
        updatedAt: "now",
      },
    };
  }
  async markAllPresent(teachingAssignmentId: string, sessionId: string) {
    this.calls.push(["markAllPresent", teachingAssignmentId, sessionId]);
    return ROSTER;
  }
  async rosterForSession(teachingAssignmentId: string, sessionId: string) {
    this.calls.push(["rosterForSession", teachingAssignmentId, sessionId]);
    return ROSTER;
  }
  async listSessions(teachingAssignmentId: string) {
    this.calls.push(["listSessions", teachingAssignmentId]);
    return [SESSION];
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  teacherUserIds: string[] = [];
  async listMine(teacherUserId: string) {
    this.teacherUserIds.push(teacherUserId);
    return ASSIGNMENTS;
  }
}

function makeService() {
  const subjectAttendance = new FakeSubjectAttendanceRepository();
  const teachingAssignments = new FakeTeachingAssignmentRepository();
  const service = new SubjectAttendanceApplicationService(subjectAttendance, teachingAssignments);
  return { service, subjectAttendance, teachingAssignments };
}

describe("SubjectAttendanceApplicationService", () => {
  it("lists a teacher's own assignments, trimmed", async () => {
    const { service, teachingAssignments } = makeService();

    const result = await service.listMyAssignments("  teacher-1  ");

    expect(teachingAssignments.teacherUserIds).toEqual(["teacher-1"]);
    expect(result).toEqual(ASSIGNMENTS);
  });

  it("rejects an empty teacher id without calling the repository", async () => {
    const { service, teachingAssignments } = makeService();

    await expect(service.listMyAssignments("  ")).rejects.toThrow(ValidationError);
    expect(teachingAssignments.teacherUserIds).toEqual([]);
  });

  it("opens a session with a validated date", async () => {
    const { service, subjectAttendance } = makeService();

    const result = await service.openSession("ta-1", "2026-08-29");

    expect(subjectAttendance.calls).toEqual([["openSession", "ta-1", "2026-08-29"]]);
    expect(result).toEqual(SESSION);
  });

  it("rejects a malformed date before calling the repository", async () => {
    const { service, subjectAttendance } = makeService();

    await expect(service.openSession("ta-1", "08/29/2026")).rejects.toThrow(ValidationError);
    expect(subjectAttendance.calls).toEqual([]);
  });

  it("marks a day no class", async () => {
    const { service, subjectAttendance } = makeService();

    const result = await service.markNoClass("ta-1", "2026-08-29");

    expect(subjectAttendance.calls).toEqual([["markNoClass", "ta-1", "2026-08-29"]]);
    expect(result?.status).toBe("no_class");
  });

  it("records an entry", async () => {
    const { service, subjectAttendance } = makeService();

    const outcome = await service.recordEntry("ta-1", "session-1", "mem-1", "present");

    expect(subjectAttendance.calls).toEqual([
      ["recordEntry", "ta-1", "session-1", "mem-1", "present", undefined],
    ]);
    expect(outcome.kind).toBe("recorded");
  });

  it("marks all present", async () => {
    const { service, subjectAttendance } = makeService();

    const result = await service.markAllPresent("ta-1", "session-1");

    expect(subjectAttendance.calls).toEqual([["markAllPresent", "ta-1", "session-1"]]);
    expect(result).toEqual(ROSTER);
  });

  it("loads a session's roster", async () => {
    const { service, subjectAttendance } = makeService();

    const result = await service.rosterForSession("ta-1", "session-1");

    expect(subjectAttendance.calls).toEqual([["rosterForSession", "ta-1", "session-1"]]);
    expect(result).toEqual(ROSTER);
  });

  it("lists an assignment's sessions", async () => {
    const { service, subjectAttendance } = makeService();

    const result = await service.listSessions("ta-1");

    expect(subjectAttendance.calls).toEqual([["listSessions", "ta-1"]]);
    expect(result).toEqual([SESSION]);
  });
});
