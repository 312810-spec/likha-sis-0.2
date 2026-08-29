import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import { LearnerApplicationService } from "./learner-service";

class FakeLearnerRepository implements LearnerRepository {
  private learners: Learner[] = [];
  createCalls: Array<{ givenName: string; familyName: string; lrn?: string; sex?: "M" | "F" }> = [];
  createWithDuplicateCheckCalls: Array<{
    givenName: string;
    familyName: string;
    lrn?: string;
    sex?: "M" | "F";
    confirmed: boolean;
  }> = [];
  nextCreateWithDuplicateCheckResult: CreateLearnerResult | null = null;
  updateProfileCalls: Array<{
    learnerId: string;
    givenName: string;
    familyName: string;
    lrn?: string;
    sex?: "M" | "F";
  }> = [];

  async list(): Promise<Learner[]> {
    return [...this.learners];
  }

  async create(
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner> {
    this.createCalls.push({ givenName, familyName, lrn, sex });
    const learner: Learner = {
      id: `learner-${this.learners.length + 1}`,
      schoolId: "current-session-school",
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
      createdAt: "now",
    };
    this.learners.push(learner);
    return learner;
  }

  async createWithDuplicateCheck(
    givenName: string,
    familyName: string,
    lrn: string | undefined,
    sex: "M" | "F" | undefined,
    confirmed: boolean,
  ): Promise<CreateLearnerResult> {
    this.createWithDuplicateCheckCalls.push({ givenName, familyName, lrn, sex, confirmed });
    if (this.nextCreateWithDuplicateCheckResult) {
      return this.nextCreateWithDuplicateCheckResult;
    }
    const learner: Learner = {
      id: `learner-${this.learners.length + 1}`,
      schoolId: "current-session-school",
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
      createdAt: "now",
    };
    this.learners.push(learner);
    return { kind: "created", learner };
  }

  async updateProfile(
    learnerId: string,
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner | null> {
    this.updateProfileCalls.push({ learnerId, givenName, familyName, lrn, sex });
    const existing = this.learners.find((l) => l.id === learnerId);
    if (!existing) return null;
    existing.givenName = givenName;
    existing.familyName = familyName;
    existing.lrn = lrn ?? null;
    existing.sex = sex ?? null;
    return existing;
  }
}

describe("LearnerApplicationService", () => {
  it("enrolls a learner with trimmed names", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    const learner = await service.enrollLearner("  Ana  ", "  Santos  ");

    expect(learner).toMatchObject({ givenName: "Ana", familyName: "Santos" });
    expect(repo.createCalls).toEqual([
      { givenName: "Ana", familyName: "Santos", lrn: undefined, sex: undefined },
    ]);
  });

  it("rejects an empty given name without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await expect(service.enrollLearner("  ", "Santos")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty family name without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await expect(service.enrollLearner("Ana", "  ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a name over the max length without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await expect(service.enrollLearner("A".repeat(101), "Santos")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("accepts a valid 12-digit LRN and sex", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    const learner = await service.enrollLearner("Ana", "Santos", "123456789012", "F");

    expect(learner.lrn).toBe("123456789012");
    expect(learner.sex).toBe("F");
  });

  it("rejects an LRN that is not exactly 12 digits without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await expect(service.enrollLearner("Ana", "Santos", "12345")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("treats an empty/whitespace LRN as not provided rather than invalid", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    const learner = await service.enrollLearner("Ana", "Santos", "   ");

    expect(learner.lrn).toBeNull();
  });

  it("createLearnerWithDuplicateCheck creates with trimmed names when there is no overlap", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    const result = await service.createLearnerWithDuplicateCheck("  Ana  ", "  Santos  ");

    expect(result).toMatchObject({ kind: "created" });
    expect(repo.createWithDuplicateCheckCalls).toEqual([
      { givenName: "Ana", familyName: "Santos", lrn: undefined, sex: undefined, confirmed: false },
    ]);
  });

  it("createLearnerWithDuplicateCheck passes confirmed through to the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await service.createLearnerWithDuplicateCheck("Ana", "Santos", undefined, undefined, true);

    expect(repo.createWithDuplicateCheckCalls).toEqual([
      { givenName: "Ana", familyName: "Santos", lrn: undefined, sex: undefined, confirmed: true },
    ]);
  });

  it("createLearnerWithDuplicateCheck rejects an empty given name without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await expect(service.createLearnerWithDuplicateCheck("  ", "Santos")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createWithDuplicateCheckCalls).toEqual([]);
  });

  it("createLearnerWithDuplicateCheck rejects a malformed LRN without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    await expect(
      service.createLearnerWithDuplicateCheck("Ana", "Santos", "not-an-lrn"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createWithDuplicateCheckCalls).toEqual([]);
  });

  it("createLearnerWithDuplicateCheck returns duplicateCandidates as-is from the repository", async () => {
    const repo = new FakeLearnerRepository();
    const existing = await repo.create("Grace", "Torres");
    repo.nextCreateWithDuplicateCheckResult = {
      kind: "duplicateCandidates",
      candidates: [existing],
    };
    const service = new LearnerApplicationService(repo);

    const result = await service.createLearnerWithDuplicateCheck("Grace", "Torres");

    expect(result).toEqual({ kind: "duplicateCandidates", candidates: [existing] });
  });

  it("createLearnerWithDuplicateCheck returns lrnConflict as-is from the repository", async () => {
    const repo = new FakeLearnerRepository();
    const existing = await repo.create("Grace", "Torres", "123456789012");
    repo.nextCreateWithDuplicateCheckResult = { kind: "lrnConflict", existing };
    const service = new LearnerApplicationService(repo);

    const result = await service.createLearnerWithDuplicateCheck(
      "Different",
      "Person",
      "123456789012",
    );

    expect(result).toEqual({ kind: "lrnConflict", existing });
  });

  it("listLearners delegates to the repository", async () => {
    const repo = new FakeLearnerRepository();
    await repo.create("Ana", "Santos");
    const service = new LearnerApplicationService(repo);

    const learners = await service.listLearners();

    expect(learners.map((l) => l.givenName)).toEqual(["Ana"]);
  });

  it("updateLearnerProfile validates and delegates to the repository", async () => {
    const repo = new FakeLearnerRepository();
    const created = await repo.create("Ana", "Santos");
    const service = new LearnerApplicationService(repo);

    const updated = await service.updateLearnerProfile(
      created.id,
      "Ana",
      "Santos",
      "123456789012",
      "F",
    );

    expect(updated).toMatchObject({ lrn: "123456789012", sex: "F" });
  });

  it("updateLearnerProfile rejects a malformed LRN without calling the repository", async () => {
    const repo = new FakeLearnerRepository();
    const created = await repo.create("Ana", "Santos");
    const service = new LearnerApplicationService(repo);

    await expect(
      service.updateLearnerProfile(created.id, "Ana", "Santos", "not-an-lrn"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.updateProfileCalls).toEqual([]);
  });
});
