import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { SchoolMember } from "../domain/school-member";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { TeacherLoadScreen } from "./TeacherLoadScreen";

const SELF_LOAD: TeacherLoad = {
  assignmentCount: 2,
  distinctSubjectCount: 2,
  weeklyInstructionalMinutes: 130,
};

const COLLEAGUE_LOAD: TeacherLoad = {
  assignmentCount: 1,
  distinctSubjectCount: 1,
  weeklyInstructionalMinutes: 50,
};

const ASSIGNMENTS: TeachingAssignmentSummary[] = [
  {
    id: "ta-1",
    sectionId: "sec-1",
    sectionName: "Mabini",
    schoolYear: "2026-2027",
    subjectId: "sub-1",
    subjectName: "Mathematics",
  },
];

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "teacher-2", username: "bo.reyes", displayName: "Bo Reyes", roles: ["teacher"] },
  { id: "head-1", username: "cid.santos", displayName: "Cid Santos", roles: ["school_head"] },
];

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  async openSession() {
    return null;
  }
  async markNoClass() {
    return null;
  }
  async recordEntry(): Promise<never> {
    throw new Error("not used by TeacherLoadScreen");
  }
  async markAllPresent() {
    return null;
  }
  async rosterForSession() {
    return null;
  }
  async listSessions() {
    return [];
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  loadCalls: string[] = [];

  constructor(
    private loadByTeacher: Record<string, TeacherLoad | "reject"> = { "teacher-1": SELF_LOAD },
    private assignmentsByTeacher: Record<string, TeachingAssignmentSummary[]> = {
      "teacher-1": ASSIGNMENTS,
    },
  ) {}

  async listMine(teacherUserId: string) {
    return this.assignmentsByTeacher[teacherUserId] ?? [];
  }
  async listMeetings() {
    return [];
  }
  async listBySection() {
    return [];
  }
  async create() {
    return null;
  }
  async remove() {
    return false;
  }
  async createMeeting(): Promise<never> {
    throw new Error("not used by TeacherLoadScreen");
  }
  async removeMeeting() {
    return false;
  }
  async getLoad(teacherUserId: string) {
    this.loadCalls.push(teacherUserId);
    const result = this.loadByTeacher[teacherUserId];
    if (result === undefined || result === "reject") {
      throw new Error("boom");
    }
    return result;
  }
}

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  constructor(private members: SchoolMember[] = MEMBERS) {}
  async listMembers() {
    return this.members;
  }
}

function renderScreen(
  options: {
    loadByTeacher?: Record<string, TeacherLoad | "reject">;
    assignmentsByTeacher?: Record<string, TeachingAssignmentSummary[]>;
    members?: SchoolMember[];
  } = {},
) {
  const teachingAssignmentRepo = new FakeTeachingAssignmentRepository(
    options.loadByTeacher,
    options.assignmentsByTeacher,
  );
  const teachingAssignmentService = new TeachingAssignmentApplicationService(
    teachingAssignmentRepo,
  );
  const subjectAttendanceService = new SubjectAttendanceApplicationService(
    new FakeSubjectAttendanceRepository(),
    teachingAssignmentRepo,
  );
  const schoolMemberService = new SchoolMemberApplicationService(
    new FakeSchoolMemberRepository(options.members ?? MEMBERS),
  );
  const result = render(
    <ModeProvider>
      <TeacherLoadScreen
        teachingAssignmentService={teachingAssignmentService}
        subjectAttendanceService={subjectAttendanceService}
        schoolMemberService={schoolMemberService}
        teacherUserId="teacher-1"
      />
    </ModeProvider>,
  );
  return { ...result, teachingAssignmentRepo };
}

describe("TeacherLoadScreen", () => {
  it("shows the three derived load numbers for the signed-in teacher by default", async () => {
    renderScreen();

    const assignmentsRow = (await screen.findByText("Assignments")).closest("div");
    expect(assignmentsRow?.querySelector("dd")).toHaveTextContent("2");
    const subjectsRow = screen.getByText("Distinct subjects").closest("div");
    expect(subjectsRow?.querySelector("dd")).toHaveTextContent("2");
    expect(screen.getByText("Weekly instructional time")).toBeInTheDocument();
    expect(screen.getByText("2h 10m")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My Teaching Load" })).toBeInTheDocument();
  });

  it("shows 0m for zero weekly instructional minutes", async () => {
    renderScreen({
      loadByTeacher: {
        "teacher-1": { assignmentCount: 1, distinctSubjectCount: 1, weeklyInstructionalMinutes: 0 },
      },
    });

    expect(await screen.findByText("0m")).toBeInTheDocument();
  });

  it("lists the assignments counted in the load", async () => {
    renderScreen();

    expect(await screen.findByText(/Mathematics/)).toBeInTheDocument();
  });

  it("shows a retryable error when loading the signed-in teacher's own load fails", async () => {
    const user = userEvent.setup();
    renderScreen({ loadByTeacher: { "teacher-1": "reject" } });

    expect(await screen.findByText("Could not load your teaching load.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Could not load your teaching load.")).toBeInTheDocument();
  });

  it("offers a picker to view a colleague's load when other teachers exist", async () => {
    renderScreen();

    expect(await screen.findByRole("combobox", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Myself" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bo Reyes" })).toBeInTheDocument();
    // Only teacher-role members are offered -- a School Head is not a
    // teaching-load target.
    expect(screen.queryByRole("option", { name: "Cid Santos" })).not.toBeInTheDocument();
  });

  it("hides the picker when the signed-in teacher is the school's only teacher", async () => {
    renderScreen({ members: [MEMBERS[0]!] });

    await screen.findByText("Assignments");

    expect(screen.queryByRole("combobox", { name: "View" })).not.toBeInTheDocument();
  });

  it("switches to a colleague's load and updates the heading", async () => {
    const user = userEvent.setup();
    renderScreen({
      loadByTeacher: { "teacher-1": SELF_LOAD, "teacher-2": COLLEAGUE_LOAD },
      assignmentsByTeacher: { "teacher-1": ASSIGNMENTS, "teacher-2": [] },
    });
    await screen.findByRole("combobox", { name: "View" });

    await user.selectOptions(screen.getByRole("combobox", { name: "View" }), "teacher-2");

    expect(
      await screen.findByRole("heading", { name: "Bo Reyes's Teaching Load" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const assignmentsRow = screen.getByText("Assignments").closest("div");
      expect(assignmentsRow?.querySelector("dd")).toHaveTextContent("1");
    });
  });

  it("shows a permission-denial message when viewing a colleague's load is refused", async () => {
    const user = userEvent.setup();
    renderScreen({
      loadByTeacher: { "teacher-1": SELF_LOAD, "teacher-2": "reject" },
    });
    await screen.findByRole("combobox", { name: "View" });

    await user.selectOptions(screen.getByRole("combobox", { name: "View" }), "teacher-2");

    expect(
      await screen.findByText(
        "Could not load this teacher's load — you may not have permission to view it.",
      ),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Assignments");

    await expectNoAccessibilityViolations(container);
  });
});
