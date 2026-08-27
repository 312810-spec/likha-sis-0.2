import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type { SectionRepository } from "../domain/ports/section-repository";
import { SectionApplicationService } from "./section-service";

class FakeSectionRepository implements SectionRepository {
  createCalls: Array<{ schoolYear: string; gradeLevel: string; name: string }> = [];
  enrollCalls: Array<{ sectionId: string; learnerId: string; startsOn: string }> = [];
  rosterCalls: Array<{ sectionId: string; asOfDate: string }> = [];
  sectionsToReturn: Section[] = [];
  rosterToReturn: SectionRosterMember[] = [];

  async list(): Promise<Section[]> {
    return this.sectionsToReturn;
  }

  async create(schoolYear: string, gradeLevel: string, name: string): Promise<Section> {
    this.createCalls.push({ schoolYear, gradeLevel, name });
    return {
      id: "sec-1",
      schoolId: "current-session-school",
      schoolYear,
      gradeLevel,
      name,
      createdAt: "now",
    };
  }

  async enroll(
    sectionId: string,
    learnerId: string,
    startsOn: string,
  ): Promise<SectionMembership | null> {
    this.enrollCalls.push({ sectionId, learnerId, startsOn });
    return {
      id: "mem-1",
      schoolId: "current-session-school",
      sectionId,
      learnerId,
      startsOn,
      endsOn: null,
      createdAt: "now",
    };
  }

  async roster(sectionId: string, asOfDate: string): Promise<SectionRosterMember[]> {
    this.rosterCalls.push({ sectionId, asOfDate });
    return this.rosterToReturn;
  }
}

describe("SectionApplicationService", () => {
  it("creates a section with trimmed fields", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    const section = await service.createSection(" 2025-2026 ", " 7 ", " Mabini ");

    expect(section.name).toBe("Mabini");
    expect(repo.createCalls).toEqual([
      { schoolYear: "2025-2026", gradeLevel: "7", name: "Mabini" },
    ]);
  });

  it("rejects an empty school year without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.createSection("  ", "7", "Mabini")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty grade level without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.createSection("2025-2026", "  ", "Mabini")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty section name without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.createSection("2025-2026", "7", "  ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a field longer than the max length without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.createSection("2025-2026", "7", "a".repeat(101))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("lists sections by delegating to the repository", async () => {
    const repo = new FakeSectionRepository();
    repo.sectionsToReturn = [
      {
        id: "sec-1",
        schoolId: "s1",
        schoolYear: "2025-2026",
        gradeLevel: "7",
        name: "Mabini",
        createdAt: "now",
      },
    ];
    const service = new SectionApplicationService(repo);

    const sections = await service.listSections();

    expect(sections).toBe(repo.sectionsToReturn);
  });

  it("enrolls a learner with trimmed ids and a well-formed date", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    const membership = await service.enrollLearner(" sec-1 ", " learner-1 ", "2026-08-01");

    expect(membership).toMatchObject({ sectionId: "sec-1", learnerId: "learner-1" });
    expect(repo.enrollCalls).toEqual([
      { sectionId: "sec-1", learnerId: "learner-1", startsOn: "2026-08-01" },
    ]);
  });

  it("rejects an empty section id for enrollment without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.enrollLearner("  ", "learner-1", "2026-08-01")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.enrollCalls).toEqual([]);
  });

  it("rejects an empty learner id for enrollment without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.enrollLearner("sec-1", "  ", "2026-08-01")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.enrollCalls).toEqual([]);
  });

  it("rejects a malformed start date without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.enrollLearner("sec-1", "learner-1", "08/01/2026")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.enrollCalls).toEqual([]);
  });

  it("fetches a roster with a trimmed section id and a well-formed date", async () => {
    const repo = new FakeSectionRepository();
    repo.rosterToReturn = [
      { learnerId: "l1", givenName: "Ana", familyName: "Cruz", lrn: null, startsOn: "2026-08-01" },
    ];
    const service = new SectionApplicationService(repo);

    const roster = await service.roster(" sec-1 ", "2026-09-01");

    expect(roster).toBe(repo.rosterToReturn);
    expect(repo.rosterCalls).toEqual([{ sectionId: "sec-1", asOfDate: "2026-09-01" }]);
  });

  it("rejects an empty section id for a roster without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.roster("  ", "2026-09-01")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.rosterCalls).toEqual([]);
  });

  it("rejects a malformed as-of date for a roster without calling the repository", async () => {
    const repo = new FakeSectionRepository();
    const service = new SectionApplicationService(repo);

    await expect(service.roster("sec-1", "Sept 1")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.rosterCalls).toEqual([]);
  });
});
