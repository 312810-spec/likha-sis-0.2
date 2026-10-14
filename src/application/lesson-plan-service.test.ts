import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  LessonPlan,
  LessonPlanFields,
  LessonSourceArtifact,
  LessonSourceAmendment,
  LessonSourceReference,
} from "../domain/lesson-plan";
import type { LessonPlanRepository } from "../domain/ports/lesson-plan-repository";
import { LessonPlanApplicationService } from "./lesson-plan-service";

const VALID_FIELDS: LessonPlanFields = {
  learningCompetency: "Add and subtract fractions with unlike denominators",
  learningCompetencyCode: "M7NS-Ig-1",
  learningObjectives: "Add fractions\nSubtract fractions",
  connectionToPreviousLearning: "Builds on like denominators",
  learningExperiences: "Group activity with fraction strips",
  assessment: "3-item exit ticket",
  waysForward: "Reteach if accuracy is low",
};

const PLAN: LessonPlan = {
  id: "lp-1",
  schoolId: "s1",
  teachingAssignmentId: "ta-1",
  planDate: "2026-09-07",
  createdByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
  ...VALID_FIELDS,
};

class FakeLessonPlanRepository implements LessonPlanRepository {
  artifact: LessonSourceArtifact = {
    id: "artifact-1",
    fileName: "source.pdf",
    mediaType: "application/pdf",
    byteLength: 20,
    sha256: "a".repeat(64),
    ingestedByUserId: "u1",
    ingestedByName: "Teacher A",
    createdAt: "now",
    alreadyImported: false,
  };

  async ingestSourceFile(): Promise<LessonSourceArtifact> {
    return this.artifact;
  }

  async getSourceArtifact(): Promise<LessonSourceArtifact | null> {
    return this.artifact;
  }

  createCalls: Array<{
    teachingAssignmentId: string;
    planDate: string;
    fields: LessonPlanFields;
    sourceReference?: LessonSourceReference;
  }> = [];
  updateCalls: Array<{
    id: string;
    teachingAssignmentId: string;
    fields: LessonPlanFields;
  }> = [];
  createResult: LessonPlan | null = PLAN;
  updateResult: LessonPlan | null = PLAN;
  plansToReturn: LessonPlan[] = [];
  amendCalls: Array<{
    lessonPlanId: string;
    teachingAssignmentId: string;
    sourceReference: LessonSourceReference;
    reason: string;
  }> = [];
  amendmentsToReturn: LessonSourceAmendment[] = [];

  async create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
    sourceReference?: LessonSourceReference,
  ): Promise<LessonPlan | null> {
    this.createCalls.push({
      teachingAssignmentId,
      planDate,
      fields,
      ...(sourceReference ? { sourceReference } : {}),
    });
    return this.createResult;
  }

  async update(
    id: string,
    teachingAssignmentId: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    this.updateCalls.push({ id, teachingAssignmentId, fields });
    return this.updateResult;
  }

  async listByAssignment(): Promise<LessonPlan[]> {
    return this.plansToReturn;
  }

  async amendSource(
    lessonPlanId: string,
    teachingAssignmentId: string,
    sourceReference: LessonSourceReference,
    reason: string,
  ): Promise<LessonPlan | null> {
    this.amendCalls.push({ lessonPlanId, teachingAssignmentId, sourceReference, reason });
    return { ...PLAN, sourceReference };
  }

  async listSourceAmendments(): Promise<LessonSourceAmendment[]> {
    return this.amendmentsToReturn;
  }
}

describe("LessonPlanApplicationService", () => {
  it("checks inclusive declared source dates and rejects invalid or out-of-window drafts", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);
    const source = {
      title: "Synthetic BOW",
      version: "v1",
      citation: "fixture:bow",
      curriculumName: "Synthetic",
      term: "Synthetic term",
      applicableDates: { startsOn: " 2026-09-07 ", endsOn: "2026-09-08" },
    };
    await service.create("ta-1", "2026-09-07", VALID_FIELDS, source);
    await service.create("ta-1", "2026-09-08", VALID_FIELDS, source);
    expect(repo.createCalls[0]?.sourceReference?.applicableDates?.startsOn).toBe("2026-09-07");
    for (const date of ["2026-09-06", "2026-09-09", "2026-02-30"]) {
      await expect(service.create("ta-1", date, VALID_FIELDS, source)).rejects.toThrow(/outside/);
    }
    for (const startsOn of ["2026-02-29", "1900-02-29", "2026-09-09", ""]) {
      await expect(
        service.create("ta-1", "2026-09-07", VALID_FIELDS, {
          ...source,
          applicableDates: { startsOn, endsOn: "2026-09-08" },
        }),
      ).rejects.toThrow(/real ordered/);
    }
    expect(repo.createCalls).toHaveLength(2);
  });
  it("ingests a teacher-selected source and preserves cancellation", async () => {
    const repo = new FakeLessonPlanRepository();
    let selected: string | null = "/tmp/source.pdf";
    const service = new LessonPlanApplicationService(repo, {
      async pickSf1Workbook() {
        return null;
      },
      async pickLessonSourceFile() {
        return selected;
      },
    });
    await expect(service.pickAndIngestSource(" ta-1 ")).resolves.toEqual(repo.artifact);
    selected = null;
    await expect(service.pickAndIngestSource("ta-1")).resolves.toBeNull();
    await expect(service.getSourceArtifact(" artifact-1 ")).resolves.toEqual(repo.artifact);
  });

  it("validates and trims source corrections before forwarding them", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);
    const source = {
      title: " Synthetic BOW ",
      version: " v2 ",
      citation: " fixture:two ",
      curriculumName: " Synthetic curriculum ",
      term: " Term A ",
    };
    await service.amendSource(" lp-1 ", " ta-1 ", source, " Corrected citation ");
    expect(repo.amendCalls).toEqual([
      {
        lessonPlanId: "lp-1",
        teachingAssignmentId: "ta-1",
        sourceReference: {
          title: "Synthetic BOW",
          version: "v2",
          citation: "fixture:two",
          curriculumName: "Synthetic curriculum",
          term: "Term A",
        },
        reason: "Corrected citation",
      },
    ]);
    for (const reason of [" ", "x".repeat(1001)]) {
      await expect(service.amendSource("lp-1", "ta-1", source, reason)).rejects.toThrow(
        ValidationError,
      );
    }
    expect(repo.amendCalls).toHaveLength(1);
  });

  it("validates amendment-history identifiers", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);
    expect(() => service.listSourceAmendments(" ", "ta-1")).toThrow(ValidationError);
    expect(() => service.listSourceAmendments("lp-1", " ")).toThrow(ValidationError);
    await expect(service.listSourceAmendments(" lp-1 ", " ta-1 ")).resolves.toEqual([]);
  });
  it("preserves a declared scope and rejects incomplete scope without writing", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);
    const source = {
      title: "Synthetic BOW",
      version: "v1",
      citation: "fixture:bow",
      curriculumName: "Synthetic curriculum",
      term: "Term A",
      scope: { schoolYear: " 2026-2027 ", subjectId: " sub-1 " },
    };
    await service.create("ta-1", "2026-09-07", VALID_FIELDS, source);
    expect(repo.createCalls[0]?.sourceReference?.scope).toEqual({
      schoolYear: "2026-2027",
      subjectId: "sub-1",
    });
    for (const scope of [
      { schoolYear: " ", subjectId: "sub-1" },
      { schoolYear: "2026-2027", subjectId: " " },
      { schoolYear: "x".repeat(4001), subjectId: "sub-1" },
    ]) {
      await expect(
        service.create("ta-1", "2026-09-08", VALID_FIELDS, { ...source, scope }),
      ).rejects.toThrow(ValidationError);
    }
    await expect(
      service.create("ta-1", "2026-09-08", VALID_FIELDS, {
        title: "",
        version: "",
        citation: "",
        curriculumName: "",
        term: "",
        scope: source.scope,
      }),
    ).rejects.toThrow(ValidationError);
    expect(repo.createCalls).toHaveLength(1);
  });
  it("stores a trimmed declared source version only when every source field is supplied", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);
    const source = {
      title: " Synthetic BOW ",
      version: " v1 ",
      citation: " fixture:bow ",
      curriculumName: " Synthetic curriculum ",
      term: " Term A ",
    };
    await service.create("ta-1", "2026-09-07", VALID_FIELDS, source);
    expect(repo.createCalls[0]?.sourceReference).toEqual({
      title: "Synthetic BOW",
      version: "v1",
      citation: "fixture:bow",
      curriculumName: "Synthetic curriculum",
      term: "Term A",
    });
    await expect(
      service.create("ta-1", "2026-09-08", VALID_FIELDS, { ...source, version: " " }),
    ).rejects.toThrow(ValidationError);
    expect(repo.createCalls).toHaveLength(1);
  });
  it("allows unknown source metadata without making a source claim", async () => {
    const repo = new FakeLessonPlanRepository();
    await new LessonPlanApplicationService(repo).create("ta-1", "2026-09-07", VALID_FIELDS, {
      title: " ",
      version: "",
      citation: "",
      curriculumName: "",
      term: "",
    });
    expect(repo.createCalls[0]?.sourceReference).toBeUndefined();
  });
  it("trims and forwards fields to create", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await service.create("  ta-1  ", "2026-09-07", {
      ...VALID_FIELDS,
      learningCompetency: "  Add and subtract fractions  ",
    });

    expect(repo.createCalls).toHaveLength(1);
    const call = repo.createCalls.at(0);
    expect(call?.teachingAssignmentId).toBe("ta-1");
    expect(call?.fields.learningCompetency).toBe("Add and subtract fractions");
  });

  it("rejects a blank learning competency", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, learningCompetency: "   " }),
    ).rejects.toThrow(ValidationError);
    expect(repo.createCalls).toHaveLength(0);
  });

  it("rejects blank learning objectives", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, learningObjectives: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects blank learning experiences", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, learningExperiences: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects blank assessment", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, assessment: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("allows a blank competency code, connection, and ways forward", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await service.create("ta-1", "2026-09-07", {
      ...VALID_FIELDS,
      learningCompetencyCode: "",
      connectionToPreviousLearning: "",
      waysForward: "",
    });

    expect(repo.createCalls).toHaveLength(1);
  });

  it("rejects an empty teaching assignment id", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(service.create("  ", "2026-09-07", VALID_FIELDS)).rejects.toThrow(ValidationError);
  });

  it("rejects an empty plan date", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(service.create("ta-1", "  ", VALID_FIELDS)).rejects.toThrow(ValidationError);
  });

  it("forwards update calls with trimmed ids", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await service.update("  lp-1  ", "  ta-1  ", VALID_FIELDS);

    expect(repo.updateCalls).toHaveLength(1);
    const call = repo.updateCalls.at(0);
    expect(call?.id).toBe("lp-1");
    expect(call?.teachingAssignmentId).toBe("ta-1");
  });

  it("forwards listByAssignment with a trimmed id", async () => {
    const repo = new FakeLessonPlanRepository();
    repo.plansToReturn = [PLAN];
    const service = new LessonPlanApplicationService(repo);

    const result = await service.listByAssignment("  ta-1  ");

    expect(result).toEqual([PLAN]);
  });
});
