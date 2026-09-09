import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClassRecordApplicationService } from "../application/class-record-service";
import { GradeSubmissionApplicationService } from "../application/grade-submission-service";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { TeacherOversightAssignmentApplicationService } from "../application/teacher-oversight-assignment-service";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type { GradeSubmission, SubmissionNote } from "../domain/grade-submission";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";
import type { GradeSubmissionRepository } from "../domain/ports/grade-submission-repository";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { TeacherOversightAssignmentRepository } from "../domain/ports/teacher-oversight-assignment-repository";
import type { SchoolMember } from "../domain/school-member";
import type { TeacherOversightAssignment } from "../domain/teacher-oversight-assignment";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { GradeReviewScreen } from "./GradeReviewScreen";
import { ModeProvider } from "./theme/ModeContext";

const CLASS_RECORD: ClassRecordDetail = {
  id: "cr-1",
  schoolId: "school-1",
  sectionId: "sec-1",
  sectionName: "Section A",
  subjectId: "subj-1",
  subjectName: "Mathematics",
  gradingPeriodId: "period-1",
  gradingPeriodLabel: "1st Quarter",
  schoolYear: "2026-2027",
  weightPolicyId: "policy-1",
  weightPolicyName: "K-10 Default",
  createdAt: "2026-06-01T00:00:00.000Z",
  itemCount: 3,
  recordedCount: 10,
  totalEligible: 10,
};

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "mt-1", username: "mt.one", displayName: "MT One", roles: ["master_teacher"] },
  { id: "head-1", username: "head.one", displayName: "Head One", roles: ["school_head"] },
];

function makeSubmission(overrides: Partial<GradeSubmission> = {}): GradeSubmission {
  return {
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
    ...overrides,
  };
}

class FakeClassRecordRepository implements ClassRecordRepository {
  async list(): Promise<ClassRecordDetail[]> {
    return [CLASS_RECORD];
  }
  async create(): Promise<ClassRecord | null> {
    return null;
  }
  async listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return [];
  }
}

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  async listMembers() {
    return MEMBERS;
  }
  async resetPassword(): Promise<boolean> {
    return true;
  }
  async removeMember(): Promise<boolean> {
    return true;
  }
  async grantRole(): Promise<boolean> {
    return true;
  }
  async revokeRole(): Promise<boolean> {
    return true;
  }
}

class FakeGradeSubmissionRepository implements GradeSubmissionRepository {
  schoolSubmissions: GradeSubmission[] = [];
  masterTeacherSubmissions: GradeSubmission[] = [];
  notes: SubmissionNote[] = [];
  decideMasterTeacherCalls: unknown[] = [];
  decideSchoolHeadCalls: unknown[] = [];
  decisionResult: GradeSubmission | null = null;

  async listForSchool() {
    return this.schoolSubmissions;
  }
  async listForMasterTeacher(asOfDate: string) {
    void asOfDate;
    return this.masterTeacherSubmissions;
  }
  async listNotes() {
    return this.notes;
  }
  async decideMasterTeacher(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ) {
    this.decideMasterTeacherCalls.push([submissionId, approve, feedbackNote, asOfDate]);
    return (
      this.decisionResult ?? {
        ...makeSubmission({ id: submissionId }),
        masterTeacherDecision: approve ? "approved" : "rejected",
        status: approve ? "submitted" : "rejected",
      }
    );
  }
  async decideSchoolHead(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ) {
    this.decideSchoolHeadCalls.push([submissionId, approve, feedbackNote, asOfDate]);
    return (
      this.decisionResult ?? {
        ...makeSubmission({ id: submissionId }),
        status: approve ? "approved" : "rejected",
      }
    );
  }
}

class FakeTeacherOversightAssignmentRepository implements TeacherOversightAssignmentRepository {
  overseerByTeacher: Record<string, TeacherOversightAssignment | null> = {};

  async listForSchool() {
    return [];
  }
  async currentOverseer(teacherUserId: string) {
    return this.overseerByTeacher[teacherUserId] ?? null;
  }
  async assign(): Promise<never> {
    throw new Error("not used in this screen");
  }
  async end(): Promise<never> {
    throw new Error("not used in this screen");
  }
}

function renderScreen(options: {
  roles: string[];
  userId: string;
  gradeRepo?: FakeGradeSubmissionRepository;
  oversightRepo?: FakeTeacherOversightAssignmentRepository;
}) {
  const gradeRepo = options.gradeRepo ?? new FakeGradeSubmissionRepository();
  const oversightRepo = options.oversightRepo ?? new FakeTeacherOversightAssignmentRepository();
  const utils = render(
    <ModeProvider>
      <GradeReviewScreen
        gradeSubmissionService={new GradeSubmissionApplicationService(gradeRepo)}
        teacherOversightAssignmentService={
          new TeacherOversightAssignmentApplicationService(oversightRepo)
        }
        classRecordService={new ClassRecordApplicationService(new FakeClassRecordRepository())}
        schoolMemberService={new SchoolMemberApplicationService(new FakeSchoolMemberRepository())}
        roles={options.roles}
        userId={options.userId}
      />
    </ModeProvider>,
  );
  return { ...utils, gradeRepo, oversightRepo };
}

describe("GradeReviewScreen", () => {
  it("shows an empty state for a user with neither School Head nor Master Teacher access", async () => {
    renderScreen({ roles: ["teacher"], userId: "teacher-1" });
    expect(
      await screen.findByText(/do not hold School Head or Master Teacher access/i),
    ).toBeInTheDocument();
  });

  it("shows the School Head's full submission matrix with the awaiting-school-head stage for the no-MT-assigned fallback", async () => {
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.schoolSubmissions = [makeSubmission()];
    renderScreen({ roles: ["school_head"], userId: "head-1", gradeRepo });

    expect(await screen.findByText("Mathematics — Section A (1st Quarter)")).toBeInTheDocument();
    expect(screen.getByText("Awaiting School Head final lock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Final lock decision" })).toBeInTheDocument();
  });

  it("shows awaiting-master-teacher when a current overseer is assigned and undecided, with no School Head action yet", async () => {
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.schoolSubmissions = [makeSubmission()];
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.overseerByTeacher["teacher-1"] = {
      id: "oa-1",
      schoolId: "school-1",
      masterTeacherUserId: "mt-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "now",
    };
    renderScreen({ roles: ["school_head"], userId: "head-1", gradeRepo, oversightRepo });

    expect(await screen.findByText("Awaiting Master Teacher review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Final lock decision" })).not.toBeInTheDocument();
  });

  it("lets the assigned Master Teacher decide their own tier, calling decideMasterTeacher", async () => {
    const user = userEvent.setup();
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.masterTeacherSubmissions = [makeSubmission()];
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.overseerByTeacher["teacher-1"] = {
      id: "oa-1",
      schoolId: "school-1",
      masterTeacherUserId: "mt-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "now",
    };
    renderScreen({ roles: ["master_teacher"], userId: "mt-1", gradeRepo, oversightRepo });

    await user.click(await screen.findByRole("button", { name: "Decide as Master Teacher" }));
    await user.click(screen.getByRole("button", { name: "Approve (Master Teacher)" }));

    await waitFor(() => expect(gradeRepo.decideMasterTeacherCalls.length).toBe(1));
    expect(gradeRepo.decideSchoolHeadCalls).toEqual([]);
  });

  it("does not let a Master Teacher who is not the current overseer decide", async () => {
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.masterTeacherSubmissions = [makeSubmission()];
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    // Overseer is a DIFFERENT master teacher than the signed-in user.
    oversightRepo.overseerByTeacher["teacher-1"] = {
      id: "oa-1",
      schoolId: "school-1",
      masterTeacherUserId: "some-other-mt",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "now",
    };
    renderScreen({ roles: ["master_teacher"], userId: "mt-1", gradeRepo, oversightRepo });

    await screen.findByText("Awaiting Master Teacher review");
    expect(
      screen.queryByRole("button", { name: "Decide as Master Teacher" }),
    ).not.toBeInTheDocument();
  });

  it("shows the rejection tier explicitly for a Master-Teacher-rejected submission", async () => {
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.schoolSubmissions = [
      makeSubmission({
        status: "rejected",
        masterTeacherDecision: "rejected",
        decidedByUserId: "mt-1",
      }),
    ];
    renderScreen({ roles: ["school_head"], userId: "head-1", gradeRepo });

    expect(await screen.findByText("Rejected by Master Teacher")).toBeInTheDocument();
  });

  it("expands and lists notes for a submission on demand", async () => {
    const user = userEvent.setup();
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.schoolSubmissions = [makeSubmission()];
    gradeRepo.notes = [
      {
        id: "note-1",
        submissionId: "gs-1",
        authorUserId: null,
        noteType: "automated_check",
        note: "No summative scores recorded.",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    renderScreen({ roles: ["school_head"], userId: "head-1", gradeRepo });

    await user.click(await screen.findByRole("button", { name: "View notes" }));
    expect(await screen.findByText("No summative scores recorded.")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations for the School Head matrix", async () => {
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.schoolSubmissions = [makeSubmission()];
    const { container } = renderScreen({ roles: ["school_head"], userId: "head-1", gradeRepo });

    await screen.findByText("Mathematics — Section A (1st Quarter)");
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while a decision panel is open", async () => {
    const user = userEvent.setup();
    const gradeRepo = new FakeGradeSubmissionRepository();
    gradeRepo.schoolSubmissions = [makeSubmission()];
    const { container } = renderScreen({ roles: ["school_head"], userId: "head-1", gradeRepo });

    await user.click(await screen.findByRole("button", { name: "Final lock decision" }));
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations for the no-access empty state", async () => {
    const { container } = renderScreen({ roles: ["teacher"], userId: "teacher-1" });
    await screen.findByText(/do not hold School Head or Master Teacher access/i);
    await expectNoAccessibilityViolations(container);
  });
});
