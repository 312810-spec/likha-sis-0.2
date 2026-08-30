import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome, ScheduleMeeting } from "../domain/schedule-meeting";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { TeachingAssignmentApplicationService } from "./teaching-assignment-service";

const LOAD: TeacherLoad = {
  assignmentCount: 3,
  distinctSubjectCount: 2,
  weeklyInstructionalMinutes: 250,
};

const DETAIL: TeachingAssignmentDetail = {
  id: "ta-1",
  teacherUserId: "teacher-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

const MEETING: ScheduleMeeting = {
  id: "meeting-1",
  teachingAssignmentId: "ta-1",
  weekday: 1,
  startsAt: "08:00",
  endsAt: "08:50",
  room: "Room 3",
};

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  calls: unknown[] = [];
  async listMine() {
    return [];
  }
  async listMeetings(teachingAssignmentId: string) {
    this.calls.push(["listMeetings", teachingAssignmentId]);
    return [MEETING];
  }
  async listBySection(sectionId: string) {
    this.calls.push(["listBySection", sectionId]);
    return [DETAIL];
  }
  async create(teacherUserId: string, sectionId: string, subjectId: string) {
    this.calls.push(["create", teacherUserId, sectionId, subjectId]);
    return {
      id: "ta-1",
      teacherUserId,
      sectionId,
      subjectId,
    };
  }
  async remove(id: string) {
    this.calls.push(["remove", id]);
    return true;
  }
  async createMeeting(
    teachingAssignmentId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<CreateMeetingOutcome> {
    this.calls.push(["createMeeting", teachingAssignmentId, weekday, startsAt, endsAt, room]);
    return { outcome: "created", meeting: { ...MEETING, teachingAssignmentId } };
  }
  async removeMeeting(id: string) {
    this.calls.push(["removeMeeting", id]);
    return true;
  }
  async getLoad(teacherUserId: string): Promise<TeacherLoad> {
    this.calls.push(["getLoad", teacherUserId]);
    return LOAD;
  }
}

function makeService() {
  const repo = new FakeTeachingAssignmentRepository();
  const service = new TeachingAssignmentApplicationService(repo);
  return { service, repo };
}

describe("TeachingAssignmentApplicationService", () => {
  it("lists teaching assignments for a section", async () => {
    const { service, repo } = makeService();

    const result = await service.listBySection("sec-1");

    expect(repo.calls).toEqual([["listBySection", "sec-1"]]);
    expect(result).toEqual([DETAIL]);
  });

  it("rejects an empty section id before calling the repository", async () => {
    const { service, repo } = makeService();

    await expect(service.listBySection("  ")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("creates a teaching assignment with trimmed ids", async () => {
    const { service, repo } = makeService();

    const result = await service.create("  teacher-1  ", "sec-1", "sub-1");

    expect(repo.calls).toEqual([["create", "teacher-1", "sec-1", "sub-1"]]);
    expect(result).toEqual({
      id: "ta-1",
      teacherUserId: "teacher-1",
      sectionId: "sec-1",
      subjectId: "sub-1",
    });
  });

  it("rejects create with any empty id before calling the repository", async () => {
    const { service, repo } = makeService();

    await expect(service.create("", "sec-1", "sub-1")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("removes a teaching assignment", async () => {
    const { service, repo } = makeService();

    const result = await service.remove("ta-1");

    expect(repo.calls).toEqual([["remove", "ta-1"]]);
    expect(result).toBe(true);
  });

  it("rejects an empty id before calling the repository for remove", async () => {
    const { service, repo } = makeService();

    await expect(service.remove(" ")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("lists an assignment's schedule meetings", async () => {
    const { service, repo } = makeService();

    const result = await service.listMeetings("ta-1");

    expect(repo.calls).toEqual([["listMeetings", "ta-1"]]);
    expect(result).toEqual([MEETING]);
  });

  it("creates a schedule meeting with a trimmed room, or null when blank", async () => {
    const { service, repo } = makeService();

    const result = await service.createMeeting("ta-1", 1, "08:00", "08:50", "  Room 3  ");

    expect(repo.calls).toEqual([["createMeeting", "ta-1", 1, "08:00", "08:50", "Room 3"]]);
    expect(result.outcome).toBe("created");
  });

  it("passes a blank room through as null", async () => {
    const { service, repo } = makeService();

    await service.createMeeting("ta-1", 1, "08:00", "08:50", "   ");

    expect(repo.calls).toEqual([["createMeeting", "ta-1", 1, "08:00", "08:50", null]]);
  });

  it("rejects a weekday outside 0-6 before calling the repository", async () => {
    const { service, repo } = makeService();

    await expect(service.createMeeting("ta-1", 7, "08:00", "08:50", null)).rejects.toThrow(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("rejects a malformed start time before calling the repository", async () => {
    const { service, repo } = makeService();

    await expect(service.createMeeting("ta-1", 1, "8:00", "08:50", null)).rejects.toThrow(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("rejects an empty class id before calling the repository for createMeeting", async () => {
    const { service, repo } = makeService();

    await expect(service.createMeeting("  ", 1, "08:00", "08:50", null)).rejects.toThrow(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("removes a schedule meeting", async () => {
    const { service, repo } = makeService();

    const result = await service.removeMeeting("meeting-1");

    expect(repo.calls).toEqual([["removeMeeting", "meeting-1"]]);
    expect(result).toBe(true);
  });

  it("rejects an empty id before calling the repository for removeMeeting", async () => {
    const { service, repo } = makeService();

    await expect(service.removeMeeting(" ")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("gets a teacher's derived load", async () => {
    const { service, repo } = makeService();

    const result = await service.getLoad("teacher-1");

    expect(repo.calls).toEqual([["getLoad", "teacher-1"]]);
    expect(result).toEqual(LOAD);
  });

  it("rejects an empty teacher id before calling the repository for getLoad", async () => {
    const { service, repo } = makeService();

    await expect(service.getLoad(" ")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });
});
