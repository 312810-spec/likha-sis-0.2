import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import { LearnerApplicationService } from "./learner-service";

class FakeLearnerRepository implements LearnerRepository {
  private learners: Learner[] = [];
  createCalls: Array<{ givenName: string; familyName: string }> = [];

  async list(): Promise<Learner[]> {
    return [...this.learners];
  }

  async create(givenName: string, familyName: string): Promise<Learner> {
    this.createCalls.push({ givenName, familyName });
    const learner: Learner = {
      id: `learner-${this.learners.length + 1}`,
      schoolId: "current-session-school",
      givenName,
      familyName,
      createdAt: "now",
    };
    this.learners.push(learner);
    return learner;
  }
}

describe("LearnerApplicationService", () => {
  it("enrolls a learner with trimmed names", async () => {
    const repo = new FakeLearnerRepository();
    const service = new LearnerApplicationService(repo);

    const learner = await service.enrollLearner("  Ana  ", "  Santos  ");

    expect(learner).toMatchObject({ givenName: "Ana", familyName: "Santos" });
    expect(repo.createCalls).toEqual([{ givenName: "Ana", familyName: "Santos" }]);
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

  it("listLearners delegates to the repository", async () => {
    const repo = new FakeLearnerRepository();
    await repo.create("Ana", "Santos");
    const service = new LearnerApplicationService(repo);

    const learners = await service.listLearners();

    expect(learners.map((l) => l.givenName)).toEqual(["Ana"]);
  });
});
