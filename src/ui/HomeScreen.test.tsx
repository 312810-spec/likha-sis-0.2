import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { AuthApplicationService } from "../application/auth-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { SchoolAttendanceApplicationService } from "../application/school-attendance-service";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import type { SectionApplicationService } from "../application/section-service";
import type { Sf1ImportApplicationService } from "../application/sf1-import-service";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { HomeScreen } from "./HomeScreen";

function makeServices() {
  const attendanceService = {
    rosterForDate: vi.fn(() => Promise.resolve([])),
  } as unknown as AttendanceApplicationService;
  const authService = {
    listAuditLog: vi.fn(() => Promise.resolve([])),
  } as unknown as AuthApplicationService;
  const gradingService = {
    listPeriodsBySchoolYear: vi.fn(() => Promise.resolve([])),
  } as unknown as GradingApplicationService;
  const learnerService = {
    listLearners: vi.fn(() => Promise.resolve([])),
  } as unknown as LearnerApplicationService;
  const sectionService = {
    listSections: vi.fn(() => Promise.resolve([])),
  } as unknown as SectionApplicationService;
  const sf1ImportService = {
    listImportHistory: vi.fn(() => Promise.resolve([])),
  } as unknown as Sf1ImportApplicationService;
  const schoolAttendanceService = {
    dayTotals: vi.fn(() => Promise.resolve({ present: 0, absent: 0, tardy: 0 })),
  } as unknown as SchoolAttendanceApplicationService;
  const sectionAdvisoryService = {
    currentAdviser: vi.fn(() => Promise.resolve(null)),
  } as unknown as SectionAdvisoryApplicationService;
  const schoolMemberService = {
    listMembers: vi.fn(() => Promise.resolve([])),
  } as unknown as SchoolMemberApplicationService;
  const teachingAssignmentService = {
    getLoad: vi.fn(() =>
      Promise.resolve({
        assignmentCount: 0,
        distinctSubjectCount: 0,
        weeklyInstructionalMinutes: 0,
      }),
    ),
  } as unknown as TeachingAssignmentApplicationService;
  return {
    attendanceService,
    authService,
    gradingService,
    learnerService,
    sectionService,
    sf1ImportService,
    schoolAttendanceService,
    sectionAdvisoryService,
    schoolMemberService,
    teachingAssignmentService,
  };
}

function renderHome(roles: string[]) {
  const services = makeServices();
  const utils = render(
    <ModeProvider>
      <HomeScreen
        roles={roles}
        displayName="Ana Cruz"
        schoolName="Mabini Elementary School"
        {...services}
        onOpenAttendance={vi.fn()}
        onManageSections={vi.fn()}
        onViewAuditLog={vi.fn()}
        onOpenSf1Import={vi.fn()}
      />
    </ModeProvider>,
  );
  return { ...utils, services };
}

describe("HomeScreen", () => {
  it("renders the teacher workspace and no view switch for a non-school-head", () => {
    renderHome(["teacher"]);

    expect(screen.getByRole("region", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Home view" })).not.toBeInTheDocument();
  });

  it("shows a school-overview/my-teaching switch for a school head, defaulting to overview", async () => {
    renderHome(["school_head", "teacher"]);

    const group = screen.getByRole("group", { name: "Home view" });
    const overviewButton = screen.getByRole("button", { name: "School overview" });
    const teachingButton = screen.getByRole("button", { name: "My teaching" });
    expect(group).toContainElement(overviewButton);
    expect(group).toContainElement(teachingButton);
    expect(overviewButton).toHaveAttribute("aria-pressed", "true");
    expect(teachingButton).toHaveAttribute("aria-pressed", "false");

    expect(await screen.findByRole("heading", { name: "School overview" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Workspace" })).not.toBeInTheDocument();
  });

  it("switches to the teacher workspace when the school head picks My teaching", async () => {
    const user = userEvent.setup();
    renderHome(["school_head", "teacher"]);

    await screen.findByRole("heading", { name: "School overview" });
    await user.click(screen.getByRole("button", { name: "My teaching" }));

    expect(await screen.findByRole("region", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My teaching" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "School overview" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("has no detectable accessibility violations for the teacher view", async () => {
    const { container } = renderHome(["teacher"]);
    await screen.findByRole("heading", { name: "Welcome, Ana Cruz" });

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations for the school-head view", async () => {
    const { container } = renderHome(["school_head", "teacher"]);
    await screen.findByRole("heading", { name: "School overview" });

    await expectNoAccessibilityViolations(container);
  });
});
