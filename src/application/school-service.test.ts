import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SchoolRepository } from "../domain/ports/school-repository";
import type { School } from "../domain/school";
import { SchoolApplicationService } from "./school-service";

class FakeSchoolRepository implements SchoolRepository {
  private schools: School[] = [];
  createCalls: string[] = [];

  async listAll(): Promise<School[]> {
    return [...this.schools];
  }

  async create(name: string): Promise<School> {
    this.createCalls.push(name);
    const school: School = { id: `school-${this.schools.length + 1}`, name, createdAt: "now" };
    this.schools.push(school);
    return school;
  }
}

describe("SchoolApplicationService", () => {
  it("registers a school with a trimmed name", async () => {
    const repo = new FakeSchoolRepository();
    const service = new SchoolApplicationService(repo);

    const school = await service.registerSchool("  Rizal Elementary  ");

    expect(school.name).toBe("Rizal Elementary");
    expect(repo.createCalls).toEqual(["Rizal Elementary"]);
  });

  it("rejects an empty name without calling the repository", async () => {
    const repo = new FakeSchoolRepository();
    const service = new SchoolApplicationService(repo);

    await expect(service.registerSchool("   ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a name over the max length without calling the repository", async () => {
    const repo = new FakeSchoolRepository();
    const service = new SchoolApplicationService(repo);

    await expect(service.registerSchool("A".repeat(201))).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("listAll delegates to the repository", async () => {
    const repo = new FakeSchoolRepository();
    await repo.create("Bonifacio High School");
    const service = new SchoolApplicationService(repo);

    const schools = await service.listAll();

    expect(schools.map((s) => s.name)).toEqual(["Bonifacio High School"]);
  });
});
