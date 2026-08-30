import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { SubjectApplicationService } from "../application/subject-service";
import { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SubjectRepository } from "../domain/ports/subject-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type { SchoolMember } from "../domain/school-member";
import type { Subject } from "../domain/subject";
import type { TeachingAssignment, TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { TeachingAssignmentsScreen } from "./TeachingAssignmentsScreen";

const SUBJECTS: Subject[] = [
  { id: "sub-math", schoolId: "s1", name: "Mathematics", createdAt: "now" },
  { id: "sub-sci", schoolId: "s1", name: "Science", createdAt: "now" },
];

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "head-1", username: "bo.reyes", displayName: "Bo Reyes", roles: ["school_head"] },
];

const ASSIGNMENT: TeachingAssignmentDetail = {
  id: "ta-1",
  teacherUserId: "teacher-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-math",
  subjectName: "Mathematics",
};

class FakeSubjectRepository implements SubjectRepository {
  async list() {
    return SUBJECTS;
  }
  async create(name: string): Promise<Subject> {
    return { id: "sub-new", schoolId: "s1", name, createdAt: "now" };
  }
}

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  constructor(private members: SchoolMember[] = MEMBERS) {}
  async listMembers() {
    return this.members;
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  assignments: TeachingAssignmentDetail[];
  createResult: TeachingAssignment | null | "reject" = null;
  removeResult = true;

  constructor(assignments: TeachingAssignmentDetail[] = []) {
    this.assignments = assignments;
  }

  async listMine() {
    return [];
  }
  async listMeetings() {
    return [];
  }
  async listBySection(sectionId: string) {
    return this.assignments.filter((a) => a.sectionId === sectionId);
  }
  async create(teacherUserId: string, sectionId: string, subjectId: string) {
    if (this.createResult === "reject") {
      throw new Error("duplicate");
    }
    if (this.createResult === null) {
      const created = { id: "ta-new", teacherUserId, sectionId, subjectId };
      this.assignments.push({
        ...created,
        sectionName: "Mabini",
        schoolYear: "2026-2027",
        subjectName: SUBJECTS.find((s) => s.id === subjectId)?.name ?? subjectId,
      });
      return created;
    }
    return this.createResult;
  }
  async remove(id: string) {
    this.assignments = this.assignments.filter((a) => a.id !== id);
    return this.removeResult;
  }
  async createMeeting(): Promise<CreateMeetingOutcome> {
    return { outcome: "unknownAssignment" };
  }
  async removeMeeting() {
    return false;
  }
  async getLoad() {
    return { assignmentCount: 0, distinctSubjectCount: 0, weeklyInstructionalMinutes: 0 };
  }
}

function renderScreen(
  options: {
    assignments?: TeachingAssignmentDetail[];
    members?: SchoolMember[];
    onBack?: () => void;
    onManageSchedule?: (teachingAssignmentId: string, subjectName: string) => void;
  } = {},
) {
  const teachingAssignmentRepo = new FakeTeachingAssignmentRepository(options.assignments ?? []);
  const teachingAssignmentService = new TeachingAssignmentApplicationService(
    teachingAssignmentRepo,
  );
  const subjectService = new SubjectApplicationService(new FakeSubjectRepository());
  const schoolMemberService = new SchoolMemberApplicationService(
    new FakeSchoolMemberRepository(options.members ?? MEMBERS),
  );

  const result = render(
    <ModeProvider>
      <TeachingAssignmentsScreen
        teachingAssignmentService={teachingAssignmentService}
        subjectService={subjectService}
        schoolMemberService={schoolMemberService}
        sectionId="sec-1"
        sectionName="Mabini"
        onBack={options.onBack ?? (() => {})}
        onManageSchedule={options.onManageSchedule ?? (() => {})}
      />
    </ModeProvider>,
  );
  return { ...result, teachingAssignmentRepo };
}

describe("TeachingAssignmentsScreen", () => {
  it("shows an empty state when no teacher is assigned yet", async () => {
    renderScreen();

    expect(
      await screen.findByText("No teacher has been assigned to this section yet."),
    ).toBeInTheDocument();
  });

  it("lists an existing assignment with the teacher's display name", async () => {
    renderScreen({ assignments: [ASSIGNMENT] });

    expect(await screen.findByRole("rowheader", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ana Cruz" })).toBeInTheDocument();
  });

  it("only offers members with the teacher role in the teacher picker", async () => {
    renderScreen();
    await screen.findByRole("combobox", { name: "Teacher" });

    expect(screen.getByRole("option", { name: "Ana Cruz" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bo Reyes" })).not.toBeInTheDocument();
  });

  it("assigns a teacher and shows the new assignment", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("combobox", { name: "Subject" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), "sub-math");
    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.click(screen.getByRole("button", { name: "Assign teacher" }));

    expect(await screen.findByText("Teacher assigned.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Cruz" })).toBeInTheDocument());
  });

  it("calls onManageSchedule with the assignment id and subject name", async () => {
    const user = userEvent.setup();
    const onManageSchedule = vi.fn();
    renderScreen({ assignments: [ASSIGNMENT], onManageSchedule });
    await screen.findByRole("rowheader", { name: "Mathematics" });

    await user.click(screen.getByRole("button", { name: "Manage schedule for Mathematics" }));

    expect(onManageSchedule).toHaveBeenCalledWith("ta-1", "Mathematics");
  });

  it("removes an assignment", async () => {
    const user = userEvent.setup();
    renderScreen({ assignments: [ASSIGNMENT] });
    await screen.findByRole("rowheader", { name: "Mathematics" });

    await user.click(screen.getByRole("button", { name: "Remove Ana Cruz from Mathematics" }));

    await waitFor(() =>
      expect(
        screen.getByText("No teacher has been assigned to this section yet."),
      ).toBeInTheDocument(),
    );
  });

  it("calls onBack when Back to sections is selected", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderScreen({ onBack });
    await screen.findByText("No teacher has been assigned to this section yet.");

    await user.click(screen.getByRole("button", { name: "Back to sections" }));

    expect(onBack).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations with an assignment listed", async () => {
    const { container } = renderScreen({ assignments: [ASSIGNMENT] });
    await screen.findByRole("rowheader", { name: "Mathematics" });

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations on the empty state", async () => {
    const { container } = renderScreen();
    await screen.findByText("No teacher has been assigned to this section yet.");

    await expectNoAccessibilityViolations(container);
  });
});
