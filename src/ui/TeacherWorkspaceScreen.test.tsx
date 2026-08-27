import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceApplicationService } from "../application/attendance-service";
import { AuthApplicationService } from "../application/auth-service";
import { GradingApplicationService } from "../application/grading-service";
import { LearnerApplicationService } from "../application/learner-service";
import { SectionApplicationService } from "../application/section-service";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../domain/attendance";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { GradingRepository } from "../domain/ports/grading-repository";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { AttendanceRepository } from "../domain/ports/attendance-repository";
import type { Learner } from "../domain/learner";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type { AuditLogEntry, CurrentSession } from "../domain/session";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { TeacherWorkspaceScreen } from "./TeacherWorkspaceScreen";

class FakeLearnerRepository implements LearnerRepository {
  constructor(private learners: Learner[] = []) {}

  async list(): Promise<Learner[]> {
    return this.learners;
  }

  async create(): Promise<Learner> {
    throw new Error("not used in this test");
  }

  async updateProfile(): Promise<Learner | null> {
    throw new Error("not used in this test");
  }
}

class FakeSectionRepository implements SectionRepository {
  shouldFail = false;

  constructor(private sections: Section[] = []) {}

  async list(): Promise<Section[]> {
    if (this.shouldFail) throw new Error("boom");
    return this.sections;
  }

  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }

  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }
  async transferMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async endMembership(): Promise<never> {
    throw new Error("not used in this test");
  }

  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

class FakeAttendanceRepository implements AttendanceRepository {
  constructor(private rostersBySectionId: Record<string, AttendanceRosterEntry[]> = {}) {}

  async rosterForDate(sectionId: string): Promise<AttendanceRosterEntry[]> {
    return this.rostersBySectionId[sectionId] ?? [];
  }

  async record(): Promise<AttendanceRecord | null> {
    throw new Error("not used in this test");
  }

  async bulkMarkPresent(): Promise<AttendanceRosterEntry[]> {
    throw new Error("not used in this test");
  }

  async monthlySummary(): Promise<MonthlyAttendanceReport> {
    throw new Error("not used in this test");
  }
}

class FakeAuthRepository implements AuthRepository {
  shouldFail = false;

  constructor(private entries: AuditLogEntry[] = []) {}

  async login(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async logout(): Promise<void> {}

  async currentSession(): Promise<CurrentSession | null> {
    return null;
  }

  async extendSession(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async listAuditLog(): Promise<AuditLogEntry[]> {
    if (this.shouldFail) throw new Error("boom");
    return this.entries;
  }
}

class FakeGradingRepository implements GradingRepository {
  constructor(private periodsBySchoolYear: Record<string, GradingPeriod[]> = {}) {}

  async listPolicies(): Promise<GradingPolicy[]> {
    throw new Error("not used in this test");
  }

  async listPolicyPeriods(): Promise<GradingPolicyPeriod[]> {
    throw new Error("not used in this test");
  }

  async listPeriodsBySchoolYear(schoolYear: string): Promise<GradingPeriod[]> {
    return this.periodsBySchoolYear[schoolYear] ?? [];
  }

  async createPeriod(): Promise<GradingPeriod | null> {
    throw new Error("not used in this test");
  }
}

function aGradingPeriod(overrides: Partial<GradingPeriod> = {}): GradingPeriod {
  return {
    id: "gp1",
    schoolId: "s1",
    schoolYear: "2026-2027",
    policyPeriodId: "pp1",
    label: "1st Term",
    startsOn: "2026-08-01",
    endsOn: "2026-10-15",
    createdAt: "now",
    ...overrides,
  };
}

/** Matches a section's `<li>` by its full text content (spanning the
 * li's own text and its nested grading-period `<span>`) -- the default
 * `getByText` behavior only matches a single node's own direct text, not
 * text combined across a parent and its element children. */
function findSectionListItem(pattern: RegExp) {
  return screen.findByText((_content, element) => {
    if (element?.tagName.toLowerCase() !== "li") return false;
    return pattern.test(element.textContent ?? "");
  });
}

function anEntry(status: AttendanceStatus | null): AttendanceRosterEntry {
  return {
    learnerId: `l-${Math.random()}`,
    givenName: "Ana",
    familyName: "Santos",
    status,
    recordedAt: status ? "now" : null,
  };
}

function renderScreen(options: {
  learners?: Learner[];
  sections?: Section[];
  rostersBySectionId?: Record<string, AttendanceRosterEntry[]>;
  auditLog?: AuditLogEntry[];
  periodsBySchoolYear?: Record<string, GradingPeriod[]>;
  onOpenAttendance?: (sectionId: string) => void;
  onManageSections?: () => void;
  onViewAuditLog?: () => void;
}) {
  const sectionRepo = new FakeSectionRepository(options.sections);
  const authRepo = new FakeAuthRepository(options.auditLog);
  const result = render(
    <ModeProvider>
      <TeacherWorkspaceScreen
        displayName="Ana Cruz"
        learnerService={new LearnerApplicationService(new FakeLearnerRepository(options.learners))}
        sectionService={new SectionApplicationService(sectionRepo)}
        attendanceService={
          new AttendanceApplicationService(new FakeAttendanceRepository(options.rostersBySectionId))
        }
        authService={new AuthApplicationService(authRepo)}
        gradingService={
          new GradingApplicationService(new FakeGradingRepository(options.periodsBySchoolYear))
        }
        onOpenAttendance={options.onOpenAttendance ?? vi.fn()}
        onManageSections={options.onManageSections ?? vi.fn()}
        onViewAuditLog={options.onViewAuditLog ?? vi.fn()}
      />
    </ModeProvider>,
  );
  return { ...result, sectionRepo, authRepo };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TeacherWorkspaceScreen", () => {
  it("greets the teacher by display name", async () => {
    renderScreen({});

    expect(await screen.findByRole("heading", { name: "Welcome, Ana Cruz" })).toBeInTheDocument();
  });

  it("shows learner and section counts", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      learners: [
        {
          id: "l1",
          schoolId: "s1",
          givenName: "A",
          familyName: "B",
          lrn: null,
          sex: null,
          createdAt: "now",
        },
        {
          id: "l2",
          schoolId: "s1",
          givenName: "C",
          familyName: "D",
          lrn: null,
          sex: null,
          createdAt: "now",
        },
      ],
      sections: [section],
      rostersBySectionId: { sec1: [] },
    });

    expect(await screen.findByText("2 learners across 1 section.")).toBeInTheDocument();
  });

  it("shows a section as not yet marked when nobody has an attendance status today", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [anEntry(null), anEntry(null)] },
    });

    expect(await findSectionListItem(/Mabini.*not yet marked today/)).toBeInTheDocument();
  });

  it("shows a section as fully marked when every learner has a status", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [anEntry("present"), anEntry("absent")] },
    });

    expect(await findSectionListItem(/Mabini.*all 2 marked/)).toBeInTheDocument();
  });

  it("shows a section as partially marked with a count", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [anEntry("present"), anEntry(null)] },
    });

    expect(await findSectionListItem(/Mabini.*1 of 2 marked/)).toBeInTheDocument();
  });

  it("shows the currently open grading period for a section", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2026-2027",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [] },
      periodsBySchoolYear: {
        "2026-2027": [
          aGradingPeriod({ label: "1st Term", startsOn: "2026-08-01", endsOn: "2026-10-15" }),
        ],
      },
    });

    expect(await findSectionListItem(/Mabini.*1st Term is open/)).toBeInTheDocument();
  });

  it("shows no grading period is open when today falls outside every period's range", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2026-2027",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [] },
      periodsBySchoolYear: {
        "2026-2027": [
          aGradingPeriod({ label: "1st Term", startsOn: "2026-06-01", endsOn: "2026-07-31" }),
        ],
      },
    });

    expect(
      await findSectionListItem(/Mabini.*no grading period currently open/),
    ).toBeInTheDocument();
  });

  it("resolves the open grading period per section's own school year, not a single shared one", async () => {
    const sectionA: Section = {
      id: "sec-a",
      schoolId: "s1",
      schoolYear: "2026-2027",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const sectionB: Section = {
      id: "sec-b",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "8",
      name: "Rizal",
      createdAt: "now",
    };
    renderScreen({
      sections: [sectionA, sectionB],
      rostersBySectionId: { "sec-a": [], "sec-b": [] },
      periodsBySchoolYear: {
        "2026-2027": [aGradingPeriod({ schoolYear: "2026-2027", label: "1st Term" })],
        // No open period for 2025-2026 at all.
        "2025-2026": [
          aGradingPeriod({
            schoolYear: "2025-2026",
            label: "4th Term",
            startsOn: "2026-03-01",
            endsOn: "2026-04-15",
          }),
        ],
      },
    });

    expect(await findSectionListItem(/Mabini.*1st Term is open/)).toBeInTheDocument();
    expect(
      await findSectionListItem(/Rizal.*no grading period currently open/),
    ).toBeInTheDocument();
  });

  it("shows recent sign-in activity", async () => {
    renderScreen({
      auditLog: [
        {
          id: "a1",
          schoolId: "s1",
          userId: "u1",
          username: "ana.cruz",
          eventType: "login_success",
          createdAt: "2026-08-25T08:00:00.000Z",
        },
      ],
    });

    expect(await screen.findByText(/ana.cruz signed in/)).toBeInTheDocument();
  });

  it("shows recent activity with a readable date, not the raw ISO storage timestamp", async () => {
    renderScreen({
      auditLog: [
        {
          id: "a1",
          schoolId: "s1",
          userId: "u1",
          username: "ana.cruz",
          eventType: "login_success",
          createdAt: "2026-08-25T08:00:00.000Z",
        },
      ],
    });
    await screen.findByText(/ana.cruz signed in/);

    expect(screen.queryByText(/2026-08-25T08:00:00.000Z/)).not.toBeInTheDocument();
  });

  it("shows a message when there are no sections yet", async () => {
    renderScreen({});

    expect(await screen.findByText(/No sections created yet\./)).toBeInTheDocument();
  });

  it("offers to create a section from the empty state", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    renderScreen({ onManageSections });
    await screen.findByText(/No sections created yet\./);

    await user.click(screen.getByRole("button", { name: "Create a section" }));

    expect(onManageSections).toHaveBeenCalledTimes(1);
  });

  it("ranks sections by attention priority: not-started, then partial, then complete, then no-learners", async () => {
    const complete: Section = {
      id: "complete",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Zamora",
      createdAt: "now",
    };
    const notStarted: Section = {
      id: "not-started",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Aguinaldo",
      createdAt: "now",
    };
    const partial: Section = {
      id: "partial",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const noLearners: Section = {
      id: "no-learners",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Bonifacio",
      createdAt: "now",
    };
    renderScreen({
      // Deliberately supplied out of priority order, to prove the
      // screen re-orders them rather than just reflecting fetch order.
      sections: [complete, noLearners, partial, notStarted],
      rostersBySectionId: {
        complete: [anEntry("present"), anEntry("absent")],
        "not-started": [anEntry(null), anEntry(null)],
        partial: [anEntry("present"), anEntry(null)],
        "no-learners": [],
      },
    });
    await findSectionListItem(/Mabini/);

    const items = screen.getAllByRole("listitem");
    const names = items.map((item) => item.textContent);
    expect(names[0]).toContain("Aguinaldo"); // not-started
    expect(names[1]).toContain("Mabini"); // partial
    expect(names[2]).toContain("Zamora"); // complete
    expect(names[3]).toContain("Bonifacio"); // no-learners, sorts last
  });

  it("opens Attendance for the right section when 'Mark attendance' is clicked", async () => {
    const user = userEvent.setup();
    const onOpenAttendance = vi.fn();
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [anEntry(null)] },
      onOpenAttendance,
    });
    await findSectionListItem(/Mabini/);

    await user.click(screen.getByRole("button", { name: "Mark attendance" }));

    expect(onOpenAttendance).toHaveBeenCalledWith("sec1");
  });

  it("labels the action 'Continue attendance' when partially marked and 'Review attendance' when complete", async () => {
    const partial: Section = {
      id: "partial",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const complete: Section = {
      id: "complete",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Rizal",
      createdAt: "now",
    };
    renderScreen({
      sections: [partial, complete],
      rostersBySectionId: {
        partial: [anEntry("present"), anEntry(null)],
        complete: [anEntry("present")],
      },
    });
    await findSectionListItem(/Mabini/);

    expect(screen.getByRole("button", { name: "Continue attendance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review attendance" })).toBeInTheDocument();
  });

  it("offers 'Manage sections' instead of an attendance action when a section has no learners", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen({ sections: [section], rostersBySectionId: { sec1: [] }, onManageSections });
    await findSectionListItem(/Mabini/);

    await user.click(screen.getByRole("button", { name: "Manage sections" }));

    expect(onManageSections).toHaveBeenCalledTimes(1);
  });

  it("offers a 'View all sign-in activity' action when activity exists", async () => {
    const user = userEvent.setup();
    const onViewAuditLog = vi.fn();
    renderScreen({
      auditLog: [
        {
          id: "a1",
          schoolId: "s1",
          userId: "u1",
          username: "ana.cruz",
          eventType: "login_success",
          createdAt: "2026-08-25T08:00:00.000Z",
        },
      ],
      onViewAuditLog,
    });
    await screen.findByText(/ana.cruz signed in/);

    await user.click(screen.getByRole("button", { name: "View all sign-in activity" }));

    expect(onViewAuditLog).toHaveBeenCalledTimes(1);
  });

  it("shows an error with retry when the workspace overview fails, and recovers on retry", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const sectionRepo = new FakeSectionRepository([section]);
    sectionRepo.shouldFail = true;
    const authRepo = new FakeAuthRepository([]);
    render(
      <ModeProvider>
        <TeacherWorkspaceScreen
          displayName="Ana Cruz"
          learnerService={new LearnerApplicationService(new FakeLearnerRepository([]))}
          sectionService={new SectionApplicationService(sectionRepo)}
          attendanceService={
            new AttendanceApplicationService(new FakeAttendanceRepository({ sec1: [] }))
          }
          authService={new AuthApplicationService(authRepo)}
          gradingService={new GradingApplicationService(new FakeGradingRepository({}))}
          onOpenAttendance={vi.fn()}
          onManageSections={vi.fn()}
          onViewAuditLog={vi.fn()}
        />
      </ModeProvider>,
    );

    expect(await screen.findByText("Could not load your workspace overview.")).toBeInTheDocument();

    sectionRepo.shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await findSectionListItem(/Mabini/)).toBeInTheDocument();
    expect(screen.queryByText("Could not load your workspace overview.")).not.toBeInTheDocument();
  });

  it("shows an error with retry when recent activity fails, without erasing a successfully loaded overview", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const authRepo = new FakeAuthRepository([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "2026-08-25T08:00:00.000Z",
      },
    ]);
    authRepo.shouldFail = true;
    render(
      <ModeProvider>
        <TeacherWorkspaceScreen
          displayName="Ana Cruz"
          learnerService={new LearnerApplicationService(new FakeLearnerRepository([]))}
          sectionService={new SectionApplicationService(new FakeSectionRepository([section]))}
          attendanceService={
            new AttendanceApplicationService(
              new FakeAttendanceRepository({ sec1: [anEntry("present")] }),
            )
          }
          authService={new AuthApplicationService(authRepo)}
          gradingService={new GradingApplicationService(new FakeGradingRepository({}))}
          onOpenAttendance={vi.fn()}
          onManageSections={vi.fn()}
          onViewAuditLog={vi.fn()}
        />
      </ModeProvider>,
    );

    // The critical attendance overview still renders correctly even
    // though the secondary activity feed is about to fail.
    expect(await findSectionListItem(/Mabini/)).toBeInTheDocument();
    expect(await screen.findByText("Could not load recent sign-in activity.")).toBeInTheDocument();

    authRepo.shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/ana.cruz signed in/)).toBeInTheDocument();
    // The overview data was never touched by the activity failure/retry.
    expect(await findSectionListItem(/Mabini/)).toBeInTheDocument();
  });

  it("shows an error with retry when the overview fails, without erasing a successfully loaded activity list", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const sectionRepo = new FakeSectionRepository([section]);
    sectionRepo.shouldFail = true;
    const authRepo = new FakeAuthRepository([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "2026-08-25T08:00:00.000Z",
      },
    ]);
    render(
      <ModeProvider>
        <TeacherWorkspaceScreen
          displayName="Ana Cruz"
          learnerService={new LearnerApplicationService(new FakeLearnerRepository([]))}
          sectionService={new SectionApplicationService(sectionRepo)}
          attendanceService={
            new AttendanceApplicationService(new FakeAttendanceRepository({ sec1: [] }))
          }
          authService={new AuthApplicationService(authRepo)}
          gradingService={new GradingApplicationService(new FakeGradingRepository({}))}
          onOpenAttendance={vi.fn()}
          onManageSections={vi.fn()}
          onViewAuditLog={vi.fn()}
        />
      </ModeProvider>,
    );

    // The secondary activity list still renders correctly even though
    // the critical overview is about to fail -- an overview failure
    // must not hide already-successfully-loaded activity data, the
    // same guarantee the reverse-direction test above proves.
    expect(await screen.findByText("Could not load your workspace overview.")).toBeInTheDocument();
    expect(await screen.findByText(/ana.cruz signed in/)).toBeInTheDocument();

    sectionRepo.shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await findSectionListItem(/Mabini/)).toBeInTheDocument();
    // The activity data was never touched by the overview failure/retry.
    expect(await screen.findByText(/ana.cruz signed in/)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const section: Section = {
      id: "sec1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { container } = renderScreen({
      sections: [section],
      rostersBySectionId: { sec1: [anEntry("present")] },
    });
    await waitFor(() => screen.getByText(/Mabini/));

    await expectNoAccessibilityViolations(container);
  });
});
