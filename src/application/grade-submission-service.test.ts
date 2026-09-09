import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { GradeSubmission, SubmissionNote } from "../domain/grade-submission";
import type { GradeSubmissionRepository } from "../domain/ports/grade-submission-repository";
import { GradeSubmissionApplicationService } from "./grade-submission-service";

const SUBMISSION: GradeSubmission = {
  id: "gs-1",
  schoolId: "school-1",
  classRecordId: "cr-1",
  submittedByUserId: "teacher-1",
  status: "submitted",
  submittedAt: "2026-08-01T00:00:00.000Z",
  decidedByUserId: null,
  decidedAt: null,
  masterTeacherDecision: null,
  masterTeacherDecidedByUserId: null,
  masterTeacherDecidedAt: null,
};

const NOTE: SubmissionNote = {
  id: "note-1",
  submissionId: "gs-1",
  authorUserId: "head-1",
  noteType: "feedback",
  note: "Looks good.",
  createdAt: "2026-08-02T00:00:00.000Z",
};

class FakeGradeSubmissionRepository implements GradeSubmissionRepository {
  calls: unknown[] = [];
  submissionResult: GradeSubmission = SUBMISSION;

  async listForSchool() {
    this.calls.push(["listForSchool"]);
    return [SUBMISSION];
  }
  async listForMasterTeacher(asOfDate: string) {
    this.calls.push(["listForMasterTeacher", asOfDate]);
    return [SUBMISSION];
  }
  async listNotes(submissionId: string) {
    this.calls.push(["listNotes", submissionId]);
    return [NOTE];
  }
  async decideMasterTeacher(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ) {
    this.calls.push(["decideMasterTeacher", submissionId, approve, feedbackNote, asOfDate]);
    return this.submissionResult;
  }
  async decideSchoolHead(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ) {
    this.calls.push(["decideSchoolHead", submissionId, approve, feedbackNote, asOfDate]);
    return this.submissionResult;
  }
}

function makeService() {
  const repo = new FakeGradeSubmissionRepository();
  const service = new GradeSubmissionApplicationService(repo);
  return { service, repo };
}

describe("GradeSubmissionApplicationService", () => {
  it("lists submissions for the school", async () => {
    const { service, repo } = makeService();
    const result = await service.listForSchool();
    expect(repo.calls).toEqual([["listForSchool"]]);
    expect(result).toEqual([SUBMISSION]);
  });

  it("lists submissions for a master teacher with a trimmed date", async () => {
    const { service, repo } = makeService();
    const result = await service.listForMasterTeacher("  2026-08-30  ");
    expect(repo.calls).toEqual([["listForMasterTeacher", "2026-08-30"]]);
    expect(result).toEqual([SUBMISSION]);
  });

  it("rejects an empty date before calling the repository for listForMasterTeacher", async () => {
    const { service, repo } = makeService();
    await expect(service.listForMasterTeacher(" ")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });

  it("lists notes for a submission", async () => {
    const { service, repo } = makeService();
    const result = await service.listNotes("gs-1");
    expect(repo.calls).toEqual([["listNotes", "gs-1"]]);
    expect(result).toEqual([NOTE]);
  });

  it("decides as master teacher, converting a blank note to null", async () => {
    const { service, repo } = makeService();
    await service.decideMasterTeacher("gs-1", true, "   ", "2026-08-30");
    expect(repo.calls).toEqual([["decideMasterTeacher", "gs-1", true, null, "2026-08-30"]]);
  });

  it("decides as master teacher, trimming a real note", async () => {
    const { service, repo } = makeService();
    await service.decideMasterTeacher("gs-1", false, "  needs revision  ", "2026-08-30");
    expect(repo.calls).toEqual([
      ["decideMasterTeacher", "gs-1", false, "needs revision", "2026-08-30"],
    ]);
  });

  it("rejects an empty submission id before calling the repository for decideMasterTeacher", async () => {
    const { service, repo } = makeService();
    await expect(service.decideMasterTeacher(" ", true, "", "2026-08-30")).rejects.toThrow(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("decides as school head, converting a blank note to null", async () => {
    const { service, repo } = makeService();
    await service.decideSchoolHead("gs-1", true, "", "2026-08-30");
    expect(repo.calls).toEqual([["decideSchoolHead", "gs-1", true, null, "2026-08-30"]]);
  });

  it("rejects an empty date before calling the repository for decideSchoolHead", async () => {
    const { service, repo } = makeService();
    await expect(service.decideSchoolHead("gs-1", true, "", " ")).rejects.toThrow(ValidationError);
    expect(repo.calls).toEqual([]);
  });
});
