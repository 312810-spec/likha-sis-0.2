import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearnerApplicationService } from "../../application/learner-service";
import type { SchoolAttendanceApplicationService } from "../../application/school-attendance-service";
import type { SchoolMemberApplicationService } from "../../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../../application/section-advisory-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { TeachingAssignmentApplicationService } from "../../application/teaching-assignment-service";
import type { SchoolDayAttendanceTotals } from "../../domain/attendance";
import type { SchoolMember } from "../../domain/school-member";
import type { Section } from "../../domain/section";
import type { SectionAdvisory } from "../../domain/section-advisory";
import type { TeacherLoad } from "../../domain/teacher-load";
import { expectNoAccessibilityViolations } from "../../test/a11y";
import { ModeProvider } from "../theme/ModeContext";
import { SchoolHeadHome } from "./SchoolHeadHome";

function makeSection(id: string, schoolYear: string): Section {
  return {
    id,
    schoolId: "school-1",
    schoolYear,
    gradeLevel: "7",
    name: `Section ${id}`,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeMember(id: string, displayName: string, roles: string[] = ["teacher"]): SchoolMember {
  return { id, username: id, displayName, roles };
}

function makeAdvisory(sectionId: string): SectionAdvisory {
  return {
    id: `adv-${sectionId}`,
    schoolId: "school-1",
    sectionId,
    teacherUserId: "teacher-x",
    startsOn: "2026-01-01",
    endsOn: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const ZERO_LOAD: TeacherLoad = {
  assignmentCount: 0,
  distinctSubjectCount: 0,
  weeklyInstructionalMinutes: 0,
};

type FailingService = "sections" | "attendance" | "adviser" | "members" | "load";

interface RenderOptions {
  sections?: Section[];
  learnerCount?: number;
  dayTotals?: SchoolDayAttendanceTotals;
  /** Adviser per section id; a section absent from the map (or mapped to
   * `null`) has no adviser. Omitted entirely => every section has one. */
  advisers?: Record<string, SectionAdvisory | null>;
  members?: SchoolMember[];
  loads?: Record<string, TeacherLoad>;
  failing?: FailingService;
}

function renderHome(
  options: RenderOptions = {},
  callbacks: {
    onManageSections?: () => void;
    onOpenSf1Import?: () => void;
    onViewTeacherLoad?: () => void;
  } = {},
) {
  const sections = options.sections ?? [
    makeSection("a", "2026-2027"),
    makeSection("b", "2026-2027"),
    makeSection("c", "2026-2027"),
  ];
  const learners = Array.from({ length: options.learnerCount ?? 40 }, (_, index) => ({
    id: `learner-${index}`,
  }));
  const dayTotals = options.dayTotals ?? { present: 18, absent: 2, tardy: 0 };
  const members = options.members ?? [];
  const fail = options.failing;

  const resolveAdviser = (sectionId: string) =>
    Promise.resolve(
      options.advisers ? (options.advisers[sectionId] ?? null) : makeAdvisory(sectionId),
    );
  const resolveLoad = (id: string) => Promise.resolve(options.loads?.[id] ?? ZERO_LOAD);

  const listSections =
    fail === "sections"
      ? vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(sections)
      : vi.fn(() => Promise.resolve(sections));
  const sectionService = { listSections } as unknown as SectionApplicationService;

  const learnerService = {
    listLearners: vi.fn(() => Promise.resolve(learners)),
  } as unknown as LearnerApplicationService;

  const dayTotalsFn =
    fail === "attendance"
      ? vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(dayTotals)
      : vi.fn(() => Promise.resolve(dayTotals));
  const schoolAttendanceService = {
    dayTotals: dayTotalsFn,
  } as unknown as SchoolAttendanceApplicationService;

  const currentAdviser =
    fail === "adviser"
      ? vi
          .fn()
          .mockRejectedValueOnce(new Error("boom"))
          .mockImplementation((sectionId: string) => resolveAdviser(sectionId))
      : vi.fn((sectionId: string) => resolveAdviser(sectionId));
  const sectionAdvisoryService = {
    currentAdviser,
  } as unknown as SectionAdvisoryApplicationService;

  const listMembers =
    fail === "members"
      ? vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(members)
      : vi.fn(() => Promise.resolve(members));
  const schoolMemberService = { listMembers } as unknown as SchoolMemberApplicationService;

  const getLoad =
    fail === "load"
      ? vi
          .fn()
          .mockRejectedValueOnce(new Error("boom"))
          .mockImplementation((id: string) => resolveLoad(id))
      : vi.fn((id: string) => resolveLoad(id));
  const teachingAssignmentService = {
    getLoad,
  } as unknown as TeachingAssignmentApplicationService;

  const onManageSections = callbacks.onManageSections ?? vi.fn();
  const onOpenSf1Import = callbacks.onOpenSf1Import ?? vi.fn();
  const onViewTeacherLoad = callbacks.onViewTeacherLoad ?? vi.fn();

  const utils = render(
    <ModeProvider>
      <SchoolHeadHome
        schoolName="Mabini Elementary School"
        sectionService={sectionService}
        learnerService={learnerService}
        schoolAttendanceService={schoolAttendanceService}
        sectionAdvisoryService={sectionAdvisoryService}
        schoolMemberService={schoolMemberService}
        teachingAssignmentService={teachingAssignmentService}
        onManageSections={onManageSections}
        onOpenSf1Import={onOpenSf1Import}
        onViewTeacherLoad={onViewTeacherLoad}
      />
    </ModeProvider>,
  );

  return { ...utils, onManageSections, onOpenSf1Import, onViewTeacherLoad };
}

describe("SchoolHeadHome", () => {
  it("shows Loading first, then the context line with learner + section counts and school year", async () => {
    renderHome();

    expect(screen.getByText("Loading school overview…")).toBeInTheDocument();

    const context = await screen.findByText(/40 learners · 3 sections · SY 2026-2027/);
    expect(context).toBeInTheDocument();
  });

  it("shows an em dash for school year when sections disagree", async () => {
    renderHome({
      sections: [makeSection("a", "2026-2027"), makeSection("b", "2025-2026")],
      advisers: { a: makeAdvisory("a"), b: makeAdvisory("b") },
    });

    expect(await screen.findByText(/SY — ·/)).toBeInTheDocument();
    expect(screen.getByText("Sections span more than one school year.")).toBeInTheDocument();
  });

  it("moves Manage / Import to header actions and wires them", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    const onOpenSf1Import = vi.fn();
    renderHome(
      { advisers: { a: makeAdvisory("a"), b: makeAdvisory("b"), c: makeAdvisory("c") } },
      {
        onManageSections,
        onOpenSf1Import,
      },
    );

    await screen.findByRole("heading", { name: "Needs your attention" });
    await user.click(screen.getByRole("button", { name: "Manage sections" }));
    await user.click(screen.getByRole("button", { name: "Import learners (SF1)" }));
    expect(onManageSections).toHaveBeenCalledTimes(1);
    expect(onOpenSf1Import).toHaveBeenCalledTimes(1);
  });

  it("shows a calm empty state when nothing needs attention", async () => {
    renderHome({
      sections: [makeSection("a", "2026-2027")],
      advisers: { a: makeAdvisory("a") },
      members: [makeMember("t1", "Teacher One")],
      loads: { t1: ZERO_LOAD },
    });

    expect(await screen.findByText("Nothing needs your attention right now.")).toBeInTheDocument();
  });

  it("lists exactly the sections with no adviser, each with an Assign adviser action", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    renderHome(
      {
        sections: [
          makeSection("a", "2026-2027"),
          makeSection("b", "2026-2027"),
          makeSection("c", "2026-2027"),
        ],
        advisers: { a: null, b: makeAdvisory("b"), c: null },
      },
      { onManageSections },
    );

    expect(await screen.findByText("Section a — Grade 7")).toBeInTheDocument();
    expect(screen.getByText("Section c — Grade 7")).toBeInTheDocument();
    expect(screen.queryByText("Section b — Grade 7")).not.toBeInTheDocument();

    const chips = screen.getAllByText("No adviser");
    expect(chips).toHaveLength(2);
    for (const chip of chips) expect(chip).toHaveClass("status-chip", "status-chip-warning");

    await user.click(screen.getAllByRole("button", { name: "Assign adviser" })[0]!);
    expect(onManageSections).toHaveBeenCalledTimes(1);
  });

  it("adds the single teaching-load outlier as an attention row wired to onViewTeacherLoad", async () => {
    const user = userEvent.setup();
    const onViewTeacherLoad = vi.fn();
    renderHome(
      {
        sections: [makeSection("a", "2026-2027")],
        advisers: { a: makeAdvisory("a") },
        members: [
          makeMember("t1", "Teacher One"),
          makeMember("t2", "Teacher Two"),
          makeMember("t3", "Teacher Three"),
          makeMember("t4", "Teacher Four"),
        ],
        loads: {
          t1: { assignmentCount: 1, distinctSubjectCount: 1, weeklyInstructionalMinutes: 60 },
          t2: { assignmentCount: 2, distinctSubjectCount: 2, weeklyInstructionalMinutes: 90 },
          t3: { assignmentCount: 2, distinctSubjectCount: 2, weeklyInstructionalMinutes: 120 },
          t4: { assignmentCount: 6, distinctSubjectCount: 4, weeklyInstructionalMinutes: 600 },
        },
      },
      { onViewTeacherLoad },
    );

    expect(await screen.findByText("Teacher Four — heaviest teaching load")).toBeInTheDocument();
    expect(screen.getByText("10h 0m / week")).toHaveClass("status-chip", "status-chip-warning");
    // No non-outlier teacher shows up as an attention row.
    expect(screen.queryByText(/Teacher One — heaviest/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review teaching load" }));
    expect(onViewTeacherLoad).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ present: 90, absent: 6, tardy: 4 }, "90%", "status-chip-success"],
    [{ present: 70, absent: 20, tardy: 10 }, "70%", "status-chip-warning"],
    [{ present: 40, absent: 50, tardy: 10 }, "40%", "status-chip-danger"],
  ])("tones the attendance-today chip by rate (%o)", async (dayTotals, label, toneClass) => {
    renderHome({ dayTotals });
    const chip = await screen.findByText(label);
    expect(chip).toHaveClass("status-chip", toneClass);
  });

  it("shows a neutral 'not recorded' attendance chip when nothing is marked", async () => {
    renderHome({ dayTotals: { present: 0, absent: 0, tardy: 0 } });
    const chip = await screen.findByText("not recorded");
    expect(chip).toHaveClass("status-chip", "status-chip-neutral");
    expect(
      screen.getByText(/No attendance recorded yet · \d{1,2} [A-Z][a-z]{2} \d{4}/),
    ).toBeInTheDocument();
  });

  it.each(["sections", "attendance", "adviser", "members", "load"] as const)(
    "shows the error Alert with a working Retry when %s rejects",
    async (failing) => {
      const user = userEvent.setup();
      renderHome({ failing, members: [makeMember("t1", "Teacher One")], advisers: { a: null } });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not load the school overview.",
      );

      await user.click(screen.getByRole("button", { name: "Retry" }));

      expect(
        await screen.findByRole("heading", { name: "Needs your attention" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("has no detectable accessibility violations once loaded", async () => {
    const { container } = renderHome({
      advisers: { a: null, b: makeAdvisory("b"), c: null },
      members: [makeMember("t1", "Teacher One"), makeMember("t2", "Teacher Two")],
      loads: {
        t1: { assignmentCount: 1, distinctSubjectCount: 1, weeklyInstructionalMinutes: 120 },
        t2: { assignmentCount: 6, distinctSubjectCount: 4, weeklyInstructionalMinutes: 600 },
      },
      dayTotals: { present: 40, absent: 50, tardy: 10 },
    });

    await screen.findByRole("heading", { name: "Needs your attention" });
    await expectNoAccessibilityViolations(container);
  });
});
