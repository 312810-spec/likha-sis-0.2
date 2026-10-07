import { describe, expect, it } from "vitest";
import type { LearnerSupportCase } from "../domain/learner-support";
import type { LearnerSupportRepository } from "../domain/ports/learner-support-repository";
import { LearnerSupportApplicationService } from "./learner-support-service";

function fixture(over: Partial<LearnerSupportCase> = {}): LearnerSupportCase {
  return {
    id: "case-1",
    schoolId: "school-1",
    classOccurrenceId: "occurrence-1",
    sectionMembershipId: "membership-1",
    need: "Cannot read CVC words",
    goal: "Read a short passage independently",
    intervention: "Daily 10-minute one-on-one reading",
    status: "open",
    participation: null,
    outcome: null,
    openedByUserId: "teacher-1",
    openedAt: "2026-09-09T01:00:00.000Z",
    updatedAt: "2026-09-09T01:00:00.000Z",
    resolvedAt: null,
    learnerGivenName: "Ana",
    learnerFamilyName: "Cruz",
    ...over,
  };
}

class FakeRepository implements LearnerSupportRepository {
  openCalls: [string, string, string, string, string][] = [];
  participationCalls: [string, string][] = [];
  resolveCalls: [string, string][] = [];
  listCalls: string[] = [];
  nextResult: LearnerSupportCase | null = fixture();
  listed: LearnerSupportCase[] = [];

  async openCase(
    classOccurrenceId: string,
    sectionMembershipId: string,
    need: string,
    goal: string,
    intervention: string,
  ) {
    this.openCalls.push([classOccurrenceId, sectionMembershipId, need, goal, intervention]);
    return this.nextResult;
  }

  async recordParticipation(caseId: string, participation: string) {
    this.participationCalls.push([caseId, participation]);
    return this.nextResult;
  }

  async resolve(caseId: string, outcome: string) {
    this.resolveCalls.push([caseId, outcome]);
    return this.nextResult;
  }

  async listForOccurrence(classOccurrenceId: string) {
    this.listCalls.push(classOccurrenceId);
    return this.listed;
  }
}

describe("LearnerSupportApplicationService", () => {
  it("delegates the plan to the port with the occurrence and enrollment", async () => {
    const repository = new FakeRepository();
    const service = new LearnerSupportApplicationService(repository);

    const result = await service.openCase(
      "occurrence-1",
      "membership-1",
      "Cannot read CVC words",
      "Read a short passage",
      "Daily reading",
    );

    expect(result).not.toBeNull();
    expect(repository.openCalls).toEqual([
      [
        "occurrence-1",
        "membership-1",
        "Cannot read CVC words",
        "Read a short passage",
        "Daily reading",
      ],
    ]);
  });

  it("carries a refused plan through as null rather than inventing a case", async () => {
    const repository = new FakeRepository();
    repository.nextResult = null;
    const service = new LearnerSupportApplicationService(repository);

    await expect(
      service.openCase("occurrence-1", "membership-1", "need", "goal", "intervention"),
    ).resolves.toBeNull();
  });

  it("delegates participation and resolution without exposing a status", async () => {
    const repository = new FakeRepository();
    const service = new LearnerSupportApplicationService(repository);

    await service.recordParticipation("case-1", "Joined the full session");
    await service.resolve("case-1", "Met the goal");

    expect(repository.participationCalls).toEqual([["case-1", "Joined the full session"]]);
    expect(repository.resolveCalls).toEqual([["case-1", "Met the goal"]]);
  });

  it("reads the intervention history for one occurrence", async () => {
    const repository = new FakeRepository();
    repository.listed = [fixture({ id: "case-2" })];
    const service = new LearnerSupportApplicationService(repository);

    await expect(service.listForOccurrence("occurrence-1")).resolves.toEqual([
      expect.objectContaining({ id: "case-2" }),
    ]);
    expect(repository.listCalls).toEqual(["occurrence-1"]);
  });
});
