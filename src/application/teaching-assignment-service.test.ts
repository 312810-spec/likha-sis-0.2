import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { TeachingAssignmentApplicationService } from "./teaching-assignment-service";

const DETAIL: TeachingAssignmentDetail = {
  id: "ta-1",
  teacherUserId: "teacher-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  calls: unknown[] = [];
  async listMine() {
    return [];
  }
  async listMeetings() {
    return [];
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
});
