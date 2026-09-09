import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { TeacherOversightAssignmentRepository } from "../domain/ports/teacher-oversight-assignment-repository";
import type {
  AssignOversightOutcome,
  EndOversightOutcome,
  TeacherOversightAssignment,
} from "../domain/teacher-oversight-assignment";
import { TeacherOversightAssignmentApplicationService } from "./teacher-oversight-assignment-service";

const ASSIGNMENT: TeacherOversightAssignment = {
  id: "oa-1",
  schoolId: "school-1",
  masterTeacherUserId: "mt-1",
  teacherUserId: "teacher-1",
  startsOn: "2026-08-01",
  endsOn: null,
  createdAt: "now",
};

class FakeTeacherOversightAssignmentRepository implements TeacherOversightAssignmentRepository {
  calls: unknown[] = [];
  listResult: TeacherOversightAssignment[] = [ASSIGNMENT];
  currentOverseerResult: TeacherOversightAssignment | null = ASSIGNMENT;
  assignResult: AssignOversightOutcome = { kind: "assigned", assignment: ASSIGNMENT };
  endResult: EndOversightOutcome = { kind: "ended", assignment: ASSIGNMENT };

  async listForSchool() {
    this.calls.push(["listForSchool"]);
    return this.listResult;
  }
  async currentOverseer(teacherUserId: string, asOfDate: string) {
    this.calls.push(["currentOverseer", teacherUserId, asOfDate]);
    return this.currentOverseerResult;
  }
  async assign(masterTeacherUserId: string, teacherUserId: string, startsOn: string) {
    this.calls.push(["assign", masterTeacherUserId, teacherUserId, startsOn]);
    return this.assignResult;
  }
  async end(teacherUserId: string, assignmentId: string, endsOn: string) {
    this.calls.push(["end", teacherUserId, assignmentId, endsOn]);
    return this.endResult;
  }
}

function makeService() {
  const repo = new FakeTeacherOversightAssignmentRepository();
  const service = new TeacherOversightAssignmentApplicationService(repo);
  return { service, repo };
}

describe("TeacherOversightAssignmentApplicationService", () => {
  it("lists assignments for the school", async () => {
    const { service, repo } = makeService();
    const result = await service.listForSchool();
    expect(repo.calls).toEqual([["listForSchool"]]);
    expect(result).toEqual([ASSIGNMENT]);
  });

  it("reads the current overseer for a teacher with trimmed ids", async () => {
    const { service, repo } = makeService();
    const result = await service.currentOverseer("  teacher-1  ", "2026-08-30");
    expect(repo.calls).toEqual([["currentOverseer", "teacher-1", "2026-08-30"]]);
    expect(result).toEqual(ASSIGNMENT);
  });

  it("rejects an empty teacher id before calling the repository for currentOverseer", async () => {
    const { service, repo } = makeService();
    await expect(service.currentOverseer(" ", "2026-08-30")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("assigns an oversight with trimmed ids", async () => {
    const { service, repo } = makeService();
    const result = await service.assign("  mt-1  ", "teacher-1", "2026-08-01");
    expect(repo.calls).toEqual([["assign", "mt-1", "teacher-1", "2026-08-01"]]);
    expect(result).toEqual({ kind: "assigned", assignment: ASSIGNMENT });
  });

  it("rejects assign with any empty argument before calling the repository", async () => {
    const { service, repo } = makeService();
    await expect(service.assign("mt-1", "", "2026-08-01")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("ends an oversight assignment", async () => {
    const { service, repo } = makeService();
    const result = await service.end("teacher-1", "oa-1", "2026-08-30");
    expect(repo.calls).toEqual([["end", "teacher-1", "oa-1", "2026-08-30"]]);
    expect(result).toEqual({ kind: "ended", assignment: ASSIGNMENT });
  });

  it("rejects end with any empty argument before calling the repository", async () => {
    const { service, repo } = makeService();
    await expect(service.end("teacher-1", " ", "2026-08-30")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });
});
