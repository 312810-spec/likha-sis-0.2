import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { Subject } from "../domain/subject";
import type { SubjectRepository } from "../domain/ports/subject-repository";
import { SubjectApplicationService } from "./subject-service";

class FakeSubjectRepository implements SubjectRepository {
  createCalls: string[] = [];
  subjectsToReturn: Subject[] = [];

  async list(): Promise<Subject[]> {
    return this.subjectsToReturn;
  }

  async create(name: string): Promise<Subject> {
    this.createCalls.push(name);
    return { id: "sub-1", schoolId: "current-session-school", name, createdAt: "now" };
  }
}

describe("SubjectApplicationService", () => {
  it("creates a subject with a trimmed name", async () => {
    const repo = new FakeSubjectRepository();
    const service = new SubjectApplicationService(repo);

    const subject = await service.createSubject(" Mathematics ");

    expect(subject.name).toBe("Mathematics");
    expect(repo.createCalls).toEqual(["Mathematics"]);
  });

  it("rejects an empty name without calling the repository", async () => {
    const repo = new FakeSubjectRepository();
    const service = new SubjectApplicationService(repo);

    await expect(service.createSubject("  ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a name longer than the max length without calling the repository", async () => {
    const repo = new FakeSubjectRepository();
    const service = new SubjectApplicationService(repo);

    await expect(service.createSubject("a".repeat(101))).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("lists subjects by delegating to the repository", async () => {
    const repo = new FakeSubjectRepository();
    repo.subjectsToReturn = [
      { id: "sub-1", schoolId: "s1", name: "Mathematics", createdAt: "now" },
    ];
    const service = new SubjectApplicationService(repo);

    const subjects = await service.listSubjects();

    expect(subjects).toBe(repo.subjectsToReturn);
  });
});
