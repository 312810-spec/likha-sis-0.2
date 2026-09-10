import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { expectNoAccessibilityViolations } from "../../test/a11y";
import { ModeProvider } from "../theme/ModeContext";
import { TeacherHome } from "./TeacherHome";

const FIXED = new Date(2026, 7, 29, 12); // Sat 2026-08-29

const CLEAN_SYNC = {
  enrolled: true,
  lastPullAt: null,
  pendingChangeCount: 0,
  hasPendingSyncTrouble: false,
  openConflictCount: 0,
};

function section(over: Partial<{ id: string; name: string; gradeLevel: string }> = {}) {
  return {
    id: over.id ?? "sec-1",
    schoolId: "sch-1",
    schoolYear: "2026-2027",
    gradeLevel: over.gradeLevel ?? "4",
    name: over.name ?? "Mabini",
    createdAt: "2026-06-01T00:00:00Z",
  };
}

type Overrides = {
  sections?: ReturnType<typeof section>[];
  rosterBySection?: Record<string, { status: string | null }[]>;
  periods?: unknown[];
  assignments?: { id: string; subjectName: string; sectionName: string }[];
  meetingsByAssignment?: Record<string, unknown[]>;
  sessionsByAssignment?: Record<string, unknown[]>;
  syncStatus?: Record<string, unknown>;
  auditLog?: { username: string; eventType: string; createdAt: string }[];
  dutiesReject?: boolean;
};

function makeProps(o: Overrides = {}): ComponentProps<typeof TeacherHome> {
  return {
    displayName: "Ana Cruz",
    username: "ana.cruz",
    teacherUserId: "u-ana",
    attendanceService: {
      rosterForDate: vi.fn((id: string) => Promise.resolve(o.rosterBySection?.[id] ?? [])),
    } as never,
    authService: {
      listAuditLog: vi.fn(() => Promise.resolve(o.auditLog ?? [])),
    } as never,
    gradingService: {
      listPeriodsBySchoolYear: vi.fn(() => Promise.resolve(o.periods ?? [])),
    } as never,
    sectionService: {
      listSections: vi.fn(() =>
        o.dutiesReject ? Promise.reject(new Error("boom")) : Promise.resolve(o.sections ?? []),
      ),
    } as never,
    subjectAttendanceService: {
      listMyAssignments: vi.fn(() => Promise.resolve(o.assignments ?? [])),
      listMeetings: vi.fn((id: string) => Promise.resolve(o.meetingsByAssignment?.[id] ?? [])),
      listSessions: vi.fn((id: string) => Promise.resolve(o.sessionsByAssignment?.[id] ?? [])),
    } as never,
    syncStatusService: {
      getStatus: vi.fn(() =>
        Promise.resolve(
          o.syncStatus ?? {
            enrolled: true,
            lastPullAt: null,
            pendingChangeCount: 0,
            hasPendingSyncTrouble: false,
            openConflictCount: 0,
          },
        ),
      ),
    } as never,
    onOpenAttendance: vi.fn(),
    onOpenSubjectAttendance: vi.fn(),
    onManageSections: vi.fn(),
    onOpenClassRecords: vi.fn(),
    onViewSyncStatus: vi.fn(),
  };
}

function renderHome(o?: Overrides) {
  const props = makeProps(o);
  return {
    props,
    ...render(
      <ModeProvider>
        <TeacherHome {...props} />
      </ModeProvider>,
    ),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TeacherHome", () => {
  it("shows a calm empty state in Zone 1 when there is nothing to do today", async () => {
    renderHome();
    expect(await screen.findByText("No attendance to mark today.")).toBeInTheDocument();
  });

  it("merges homeroom and subject duties into one list, urgency first", async () => {
    const { props } = renderHome({
      sections: [section({ id: "sec-done", name: "Rizal" })],
      rosterBySection: { "sec-done": [{ status: "present" }, { status: "present" }] },
      assignments: [{ id: "ta-1", subjectName: "Math", sectionName: "Mabini" }],
      meetingsByAssignment: {
        "ta-1": [{ weekday: 6, startsAt: "08:00", endsAt: "09:00", room: null }],
      },
    });

    // The unchecked subject class (urgent) sorts before the fully-marked homeroom.
    const items = await screen.findAllByRole("listitem");
    const [first, second] = items as [HTMLElement, HTMLElement];
    expect(within(first).getByText(/Math — Mabini/)).toBeInTheDocument();
    expect(within(first).getByText("not checked")).toBeInTheDocument();
    expect(within(second).getByText(/Rizal — Grade 4 · advisory class/)).toBeInTheDocument();
    expect(within(second).getByText("all 2 marked")).toBeInTheDocument();

    await userEvent.click(within(first).getByRole("button", { name: "Check attendance" }));
    expect(props.onOpenSubjectAttendance).toHaveBeenCalledWith("ta-1");
  });

  it("hides the Grading zone when no period is open, shows it when one is", async () => {
    const { unmount } = renderHome({ sections: [section()] });
    await screen.findByRole("heading", { name: "What needs you today" });
    expect(screen.queryByRole("heading", { name: "Grading" })).not.toBeInTheDocument();
    unmount();

    renderHome({
      sections: [section()],
      periods: [
        {
          id: "gp-1",
          schoolId: "sch-1",
          schoolYear: "2026-2027",
          policyPeriodId: "pp-1",
          label: "First Quarter",
          startsOn: "2026-08-01",
          endsOn: "2026-10-31",
          createdAt: "x",
        },
      ],
    });
    expect(await screen.findByRole("heading", { name: "Grading" })).toBeInTheDocument();
    expect(screen.getByText(/First Quarter is open/)).toBeInTheDocument();
  });

  it.each([
    [{ enrolled: false }, "Offline"],
    [{ enrolled: true, pendingChangeCount: 2 }, "Waiting to sync"],
    [{ enrolled: true, hasPendingSyncTrouble: true, pendingChangeCount: 1 }, "Sync failed"],
    [{ enrolled: true, openConflictCount: 1 }, "Needs your review"],
    [{ enrolled: true }, "Synced"],
  ])("maps sync status %o to the %s device chip", async (status, label) => {
    renderHome({ syncStatus: { ...CLEAN_SYNC, ...status } });
    const zone = await screen.findByRole("region", { name: "Your device" });
    expect(within(zone).getByText(label)).toHaveClass("status-chip");
  });

  it("shows a single last-sign-in line for the current user only", async () => {
    renderHome({
      auditLog: [
        { username: "someone.else", eventType: "login_success", createdAt: "2026-08-29T07:00:00Z" },
        { username: "ana.cruz", eventType: "login_success", createdAt: "2026-08-29T06:30:00Z" },
      ],
    });
    expect(await screen.findByText(/^Last sign-in:/)).toBeInTheDocument();
  });

  it("keeps the device zone usable when the duties zone fails to load", async () => {
    renderHome({ dutiesReject: true });
    expect(await screen.findByText("Could not load what needs you today.")).toBeInTheDocument();
    const zone = screen.getByRole("region", { name: "Your device" });
    expect(within(zone).getByText("Synced")).toBeInTheDocument();
  });

  it("has no accessibility violations with all three zones populated", async () => {
    const { container } = renderHome({
      sections: [section()],
      rosterBySection: { "sec-1": [{ status: null }] },
      periods: [
        {
          id: "gp-1",
          schoolId: "sch-1",
          schoolYear: "2026-2027",
          policyPeriodId: "pp-1",
          label: "First Quarter",
          startsOn: "2026-08-01",
          endsOn: "2026-10-31",
          createdAt: "x",
        },
      ],
    });
    await screen.findByRole("heading", { name: "Grading" });
    await expectNoAccessibilityViolations(container);
  });
});
