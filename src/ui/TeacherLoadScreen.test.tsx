import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { TeacherLoadScreen } from "./TeacherLoadScreen";

const LOAD: TeacherLoad = {
  assignmentCount: 2,
  distinctSubjectCount: 2,
  weeklyInstructionalMinutes: 130,
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
  constructor(
    private load: TeacherLoad | "reject" = LOAD,
    private assignments: TeachingAssignmentSummary[] = ASSIGNMENTS,
  ) {}
  async listMine() {
    return this.assignments;
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
  async getLoad() {
    if (this.load === "reject") throw new Error("boom");
    return this.load;
  }
}

function renderScreen(
  options: { load?: TeacherLoad | "reject"; assignments?: TeachingAssignmentSummary[] } = {},
) {
  const teachingAssignmentService = new TeachingAssignmentApplicationService(
    new FakeTeachingAssignmentRepository(options.load ?? LOAD, options.assignments ?? ASSIGNMENTS),
  );
  const subjectAttendanceService = new SubjectAttendanceApplicationService(
    new FakeSubjectAttendanceRepository(),
    new FakeTeachingAssignmentRepository(options.load ?? LOAD, options.assignments ?? ASSIGNMENTS),
  );
  return render(
    <ModeProvider>
      <TeacherLoadScreen
        teachingAssignmentService={teachingAssignmentService}
        subjectAttendanceService={subjectAttendanceService}
        teacherUserId="teacher-1"
      />
    </ModeProvider>,
  );
}

describe("TeacherLoadScreen", () => {
  it("shows the three derived load numbers", async () => {
    renderScreen();

    const assignmentsRow = (await screen.findByText("Assignments")).closest("div");
    expect(assignmentsRow?.querySelector("dd")).toHaveTextContent("2");
    const subjectsRow = screen.getByText("Distinct subjects").closest("div");
    expect(subjectsRow?.querySelector("dd")).toHaveTextContent("2");
    expect(screen.getByText("Weekly instructional time")).toBeInTheDocument();
    expect(screen.getByText("2h 10m")).toBeInTheDocument();
  });

  it("shows 0m for zero weekly instructional minutes", async () => {
    renderScreen({
      load: { assignmentCount: 1, distinctSubjectCount: 1, weeklyInstructionalMinutes: 0 },
    });

    expect(await screen.findByText("0m")).toBeInTheDocument();
  });

  it("lists the assignments counted in the load", async () => {
    renderScreen();

    expect(await screen.findByText(/Mathematics/)).toBeInTheDocument();
  });

  it("shows a retryable error when loading fails", async () => {
    const user = userEvent.setup();
    renderScreen({ load: "reject" });

    expect(await screen.findByText("Could not load your teaching load.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Could not load your teaching load.")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Assignments");

    await expectNoAccessibilityViolations(container);
  });
});
