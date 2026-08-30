import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../domain/section-advisory";
import { SectionAdvisoryApplicationService } from "./section-advisory-service";

const ADVISORY: SectionAdvisory = {
  id: "adv-1",
  schoolId: "school-1",
  sectionId: "sec-1",
  teacherUserId: "teacher-1",
  startsOn: "2026-08-01",
  endsOn: null,
  createdAt: "now",
};

class FakeSectionAdvisoryRepository implements SectionAdvisoryRepository {
  calls: unknown[] = [];
  assignResult: AssignAdviserOutcome = { kind: "assigned", advisory: ADVISORY };
  endResult: EndAdvisoryOutcome = { kind: "ended", advisory: ADVISORY };
  currentAdviserResult: SectionAdvisory | null = ADVISORY;

  async currentAdviser(sectionId: string, asOfDate: string) {
    this.calls.push(["currentAdviser", sectionId, asOfDate]);
    return this.currentAdviserResult;
  }
  async assign(sectionId: string, teacherUserId: string, startsOn: string) {
    this.calls.push(["assign", sectionId, teacherUserId, startsOn]);
    return this.assignResult;
  }
  async end(sectionId: string, advisoryId: string, endsOn: string) {
    this.calls.push(["end", sectionId, advisoryId, endsOn]);
    return this.endResult;
  }
}

function makeService() {
  const repo = new FakeSectionAdvisoryRepository();
  const service = new SectionAdvisoryApplicationService(repo);
  return { service, repo };
}

describe("SectionAdvisoryApplicationService", () => {
  it("reads the current adviser for a section", async () => {
    const { service, repo } = makeService();

    const result = await service.currentAdviser("sec-1", "2026-08-30");

    expect(repo.calls).toEqual([["currentAdviser", "sec-1", "2026-08-30"]]);
    expect(result).toEqual(ADVISORY);
  });

  it("rejects an empty section id before calling the repository for currentAdviser", async () => {
    const { service, repo } = makeService();

    await expect(service.currentAdviser("  ", "2026-08-30")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("assigns an adviser with trimmed ids", async () => {
    const { service, repo } = makeService();

    const result = await service.assign("  sec-1  ", "teacher-1", "2026-08-01");

    expect(repo.calls).toEqual([["assign", "sec-1", "teacher-1", "2026-08-01"]]);
    expect(result).toEqual({ kind: "assigned", advisory: ADVISORY });
  });

  it("rejects assign with any empty argument before calling the repository", async () => {
    const { service, repo } = makeService();

    await expect(service.assign("sec-1", "", "2026-08-01")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("ends an advisory", async () => {
    const { service, repo } = makeService();

    const result = await service.end("sec-1", "adv-1", "2026-08-30");

    expect(repo.calls).toEqual([["end", "sec-1", "adv-1", "2026-08-30"]]);
    expect(result).toEqual({ kind: "ended", advisory: ADVISORY });
  });

  it("rejects end with any empty argument before calling the repository", async () => {
    const { service, repo } = makeService();

    await expect(service.end("sec-1", " ", "2026-08-30")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });
});
