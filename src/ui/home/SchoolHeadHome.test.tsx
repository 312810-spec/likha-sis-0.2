import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearnerApplicationService } from "../../application/learner-service";
import type { SchoolAttendanceApplicationService } from "../../application/school-attendance-service";
import type { SchoolMemberApplicationService } from "../../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../../application/section-advisory-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { Sf1ImportApplicationService } from "../../application/sf1-import-service";
import type { TeachingAssignmentApplicationService } from "../../application/teaching-assignment-service";
import type { SchoolDayAttendanceTotals } from "../../domain/attendance";
import type { SchoolMember } from "../../domain/school-member";
import type { Section } from "../../domain/section";
import type { SectionAdvisory } from "../../domain/section-advisory";
import type { Sf1ImportHistoryEntry } from "../../domain/sf1-import";
import type { TeacherLoad } from "../../domain/teacher-load";
import { expectNoAccessibilityViolations } from "../../test/a11y";
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

function makeHistory(overrides: Partial<Sf1ImportHistoryEntry> = {}): Sf1ImportHistoryEntry {
  return {
    id: "import-1",
    schoolId: "school-1",
    sectionId: "section-a",
    userId: "user-1",
    username: "teacher1",
    sourceFilename: "SF1-Mabini.xlsx",
    sourceFingerprint: "fingerprint",
    rowsCommitted: 30,
    newLearnersCreated: 20,
    existingLearnersEnrolled: 10,
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
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
  history?: Sf1ImportHistoryEntry[];
  dayTotals?: SchoolDayAttendanceTotals;
  /** Adviser resolved per section id; a section absent from the map (or
   * mapped to `null`) is treated as having no adviser. When omitted
   * entirely, every section gets a fake adviser. */
  advisers?: Record<string, SectionAdvisory | null>;
  members?: SchoolMember[];
  loads?: Record<string, TeacherLoad>;
  failing?: FailingService;
}

function renderHome(
  options: RenderOptions = {},
  callbacks: { onManageSections?: () => void; onOpenSf1Import?: () => void } = {},
) {
  const sections = options.sections ?? [
    makeSection("a", "2026-2027"),
    makeSection("b", "2026-2027"),
    makeSection("c", "2026-2027"),
  ];
  const learners = Array.from({ length: options.learnerCount ?? 40 }, (_, index) => ({
    id: `learner-${index}`,
  }));
  const history = options.history ?? [];
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
  const sf1ImportService = {
    listImportHistory: vi.fn(() => Promise.resolve(history)),
  } as unknown as Sf1ImportApplicationService;

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

  const utils = render(
    <SchoolHeadHome
      schoolName="Mabini Elementary School"
      sectionService={sectionService}
      learnerService={learnerService}
      sf1ImportService={sf1ImportService}
      schoolAttendanceService={schoolAttendanceService}
      sectionAdvisoryService={sectionAdvisoryService}
      schoolMemberService={schoolMemberService}
      teachingAssignmentService={teachingAssignmentService}
      onManageSections={onManageSections}
      onOpenSf1Import={onOpenSf1Import}
    />,
  );

  return { ...utils, onManageSections, onOpenSf1Import };
}

describe("SchoolHeadHome", () => {
  it("shows Loading first, then the section and learner counts", async () => {
    renderHome();

    expect(screen.getByText("Loading school overview…")).toBeInTheDocument();

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.getByText("Learners")).toBeInTheDocument();
  });

  it("shows the shared school year when every section matches", async () => {
    renderHome();

    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
  });

  it("shows an em dash for school year when sections disagree", async () => {
    renderHome({
      sections: [makeSection("a", "2026-2027"), makeSection("b", "2025-2026")],
    });

    await screen.findByText("Sections");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em dash for school year when there are no sections", async () => {
    renderHome({ sections: [] });

    await screen.findByText("Sections");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders both card titles", async () => {
    renderHome();

    expect(await screen.findByText("Recent SF1 imports")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
  });

  it("wires the navigation buttons to their callbacks", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    const onOpenSf1Import = vi.fn();
    renderHome({}, { onManageSections, onOpenSf1Import });

    await screen.findByText("Manage");

    await user.click(screen.getByRole("button", { name: "Manage sections" }));
    expect(onManageSections).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "SF1 import" }));
    expect(onOpenSf1Import).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state when there are no imports", async () => {
    renderHome({ history: [] });

    expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
  });

  it("lists recent import filenames when history exists", async () => {
    renderHome({
      history: [makeHistory({ id: "import-9", sourceFilename: "SF1-Rizal.xlsx" })],
    });

    expect(await screen.findByText(/SF1-Rizal\.xlsx/)).toBeInTheDocument();
  });

  it("shows an error with a working Retry after a failed load", async () => {
    const user = userEvent.setup();
    const listSections = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([makeSection("a", "2026-2027")]);
    const sectionService = { listSections } as unknown as SectionApplicationService;
    const learnerService = {
      listLearners: vi.fn().mockResolvedValue([]),
    } as unknown as LearnerApplicationService;
    const sf1ImportService = {
      listImportHistory: vi.fn().mockResolvedValue([]),
    } as unknown as Sf1ImportApplicationService;
    const schoolAttendanceService = {
      dayTotals: vi.fn().mockResolvedValue({ present: 0, absent: 0, tardy: 0 }),
    } as unknown as SchoolAttendanceApplicationService;
    const sectionAdvisoryService = {
      currentAdviser: vi.fn().mockResolvedValue(null),
    } as unknown as SectionAdvisoryApplicationService;
    const schoolMemberService = {
      listMembers: vi.fn().mockResolvedValue([]),
    } as unknown as SchoolMemberApplicationService;
    const teachingAssignmentService = {
      getLoad: vi.fn().mockResolvedValue(ZERO_LOAD),
    } as unknown as TeachingAssignmentApplicationService;

    render(
      <SchoolHeadHome
        schoolName="Mabini Elementary School"
        sectionService={sectionService}
        learnerService={learnerService}
        sf1ImportService={sf1ImportService}
        schoolAttendanceService={schoolAttendanceService}
        sectionAdvisoryService={sectionAdvisoryService}
        schoolMemberService={schoolMemberService}
        teachingAssignmentService={teachingAssignmentService}
        onManageSections={vi.fn()}
        onOpenSf1Import={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the school overview.",
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations once loaded", async () => {
    const { container } = renderHome({ history: [makeHistory()] });
    await screen.findByText("Recent SF1 imports");

    await expectNoAccessibilityViolations(container);
  });

  // --- Wave 4 Task 4: the three enrichment cards -------------------------

  it("shows the attendance-today KPI value and raw-count foot", async () => {
    renderHome({ dayTotals: { present: 90, absent: 6, tardy: 4 } });

    expect(await screen.findByText("Attendance today")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText(/90 present of 100 marked · \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();
  });

  it("tones the attendance KPI success at roughly 90 percent", async () => {
    renderHome({ dayTotals: { present: 90, absent: 6, tardy: 4 } });

    const kpi = (await screen.findByText("Attendance today")).closest(".kpi");
    expect(kpi).toHaveAttribute("data-tone", "success");
  });

  it("tones the attendance KPI warning at roughly 70 percent", async () => {
    renderHome({ dayTotals: { present: 70, absent: 20, tardy: 10 } });

    const kpi = (await screen.findByText("Attendance today")).closest(".kpi");
    expect(kpi).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("tones the attendance KPI danger at roughly 40 percent", async () => {
    renderHome({ dayTotals: { present: 40, absent: 50, tardy: 10 } });

    const kpi = (await screen.findByText("Attendance today")).closest(".kpi");
    expect(kpi).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("shows a neutral attendance KPI and 'no attendance recorded yet' foot when nothing is marked", async () => {
    renderHome({ dayTotals: { present: 0, absent: 0, tardy: 0 } });

    expect(
      await screen.findByText(/no attendance recorded yet · \d{4}-\d{2}-\d{2}/),
    ).toBeInTheDocument();
    const kpi = screen.getByText("Attendance today").closest(".kpi") as HTMLElement;
    expect(kpi).toHaveAttribute("data-tone", "neutral");
    expect(within(kpi).getByText("—")).toBeInTheDocument();
  });

  it("lists exactly the sections whose adviser lookup resolved null", async () => {
    renderHome({
      sections: [
        makeSection("a", "2026-2027"),
        makeSection("b", "2026-2027"),
        makeSection("c", "2026-2027"),
      ],
      advisers: { a: null, b: makeAdvisory("b"), c: null },
    });

    expect(await screen.findByText("Sections without an adviser")).toBeInTheDocument();
    expect(screen.getByText("Section a — Grade 7")).toBeInTheDocument();
    expect(screen.getByText("Section c — Grade 7")).toBeInTheDocument();
    expect(screen.queryByText("Section b — Grade 7")).not.toBeInTheDocument();
  });

  it("shows 'Every section has an adviser.' when every section has one", async () => {
    renderHome({
      sections: [makeSection("a", "2026-2027"), makeSection("b", "2026-2027")],
      advisers: { a: makeAdvisory("a"), b: makeAdvisory("b") },
    });

    expect(await screen.findByText("Every section has an adviser.")).toBeInTheDocument();
  });

  it("wires the adviser-gap Assign button to onManageSections", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    renderHome({ advisers: { a: null } }, { onManageSections });

    await screen.findByText("Sections without an adviser");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(onManageSections).toHaveBeenCalledTimes(1);
  });

  it("lists each teacher with their weekly hours and flags the single outlier", async () => {
    renderHome({
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
    });

    expect(await screen.findByText("Teaching load")).toBeInTheDocument();
    expect(screen.getByText("Teacher One")).toBeInTheDocument();
    expect(screen.getByText("1h 0m")).toBeInTheDocument();

    const outlierRow = screen.getByText("Teacher Four").closest("li") as HTMLElement;
    expect(outlierRow).toHaveTextContent("10h 0m ⚠ high");
    expect(outlierRow).toHaveClass("warn");
    expect(outlierRow).toHaveAttribute("data-tone", "warning");

    const normalRow = screen.getByText("Teacher One").closest("li") as HTMLElement;
    expect(normalRow).not.toHaveTextContent("⚠ high");
  });

  it("shows 'No teachers on record.' when no member has the teacher role", async () => {
    renderHome({ members: [makeMember("r1", "Reggie Registrar", ["registrar"])] });

    expect(await screen.findByText("No teachers on record.")).toBeInTheDocument();
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

      expect(await screen.findByText("Teaching load")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("has no detectable accessibility violations with the enrichment cards populated", async () => {
    const { container } = renderHome({
      history: [makeHistory()],
      advisers: { a: null, b: makeAdvisory("b"), c: null },
      members: [makeMember("t1", "Teacher One"), makeMember("t2", "Teacher Two")],
      loads: {
        t1: { assignmentCount: 1, distinctSubjectCount: 1, weeklyInstructionalMinutes: 120 },
        t2: { assignmentCount: 6, distinctSubjectCount: 4, weeklyInstructionalMinutes: 600 },
      },
      dayTotals: { present: 40, absent: 50, tardy: 10 },
    });

    await screen.findByText("Teaching load");
    await expectNoAccessibilityViolations(container);
  });
});
