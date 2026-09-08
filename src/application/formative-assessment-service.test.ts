import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  FormativeAssessmentLog,
  FormativeAssessmentLogInput,
} from "../domain/formative-assessment";
import { FormativeAssessmentValidationError } from "../domain/formative-assessment";
import type { FormativeAssessmentRepository } from "../domain/ports/formative-assessment-repository";
import { FormativeAssessmentApplicationService } from "./formative-assessment-service";

const VALID_INPUT: FormativeAssessmentLogInput = {
  teachingAssignmentId: "ta1",
  learnerId: "l1",
  gradingPeriodId: "gp1",
  activityName: "Quiz 1",
  esruRating: "E",
  notes: "Great participation",
};

const LOG: FormativeAssessmentLog = {
  id: "f1",
  schoolId: "s1",
  teachingAssignmentId: "ta1",
  learnerId: "l1",
  gradingPeriodId: "gp1",
  activityName: "Quiz 1",
  esruRating: "E",
  notes: "Great participation",
  createdByUserId: "u1",
  updatedByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
};

class FakeFormativeAssessmentRepository implements FormativeAssessmentRepository {
  recordCalls: FormativeAssessmentLogInput[] = [];
  listForAssignmentCalls: string[] = [];
  recordResult: FormativeAssessmentLog = LOG;
  logsToReturn: FormativeAssessmentLog[] = [];

  async record(input: FormativeAssessmentLogInput): Promise<FormativeAssessmentLog> {
    this.recordCalls.push(input);
    return this.recordResult;
  }

  async listForAssignment(teachingAssignmentId: string): Promise<FormativeAssessmentLog[]> {
    this.listForAssignmentCalls.push(teachingAssignmentId);
    return this.logsToReturn;
  }
}

describe("FormativeAssessmentApplicationService", () => {
  it("trims and forwards a valid record", async () => {
    const repo = new FakeFormativeAssessmentRepository();
    const service = new FormativeAssessmentApplicationService(repo);

    await service.record({ ...VALID_INPUT, activityName: "  Quiz 1  " });

    expect(repo.recordCalls).toHaveLength(1);
    expect(repo.recordCalls.at(0)?.activityName).toBe("Quiz 1");
    expect(repo.recordCalls.at(0)?.esruRating).toBe("E");
  });

  it("rejects an invalid rating before reaching the repository", async () => {
    const repo = new FakeFormativeAssessmentRepository();
    const service = new FormativeAssessmentApplicationService(repo);

    await expect(
      service.record({
        ...VALID_INPUT,
        // @ts-expect-error -- deliberately not a valid EsruRating
        esruRating: "Exploration",
      }),
    ).rejects.toThrow(FormativeAssessmentValidationError);
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("rejects a blank activity name before reaching the repository", async () => {
    const repo = new FakeFormativeAssessmentRepository();
    const service = new FormativeAssessmentApplicationService(repo);

    await expect(service.record({ ...VALID_INPUT, activityName: "   " })).rejects.toThrow(
      FormativeAssessmentValidationError,
    );
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("forwards listForAssignment with a trimmed id", async () => {
    const repo = new FakeFormativeAssessmentRepository();
    repo.logsToReturn = [LOG];
    const service = new FormativeAssessmentApplicationService(repo);

    const result = await service.listForAssignment("  ta1  ");

    expect(repo.listForAssignmentCalls).toEqual(["ta1"]);
    expect(result).toEqual([LOG]);
  });

  it("rejects an empty teaching assignment id for listForAssignment", async () => {
    const repo = new FakeFormativeAssessmentRepository();
    const service = new FormativeAssessmentApplicationService(repo);

    await expect(service.listForAssignment("   ")).rejects.toThrow(ValidationError);
    expect(repo.listForAssignmentCalls).toHaveLength(0);
  });
});
