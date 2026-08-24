import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceApplicationService } from "../application/attendance-service";
import { SectionApplicationService } from "../application/section-service";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../domain/attendance";
import type { AttendanceRepository } from "../domain/ports/attendance-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { AttendanceScreen } from "./AttendanceScreen";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "s1",
  schoolYear: "2025-2026",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

class FakeAttendanceRepository implements AttendanceRepository {
  recordCalls: Array<{
    sectionId: string;
    learnerId: string;
    attendanceDate: string;
    status: AttendanceStatus;
  }> = [];
  bulkMarkPresentCalls: Array<{ sectionId: string; attendanceDate: string }> = [];

  constructor(private roster: AttendanceRosterEntry[] = []) {}

  async rosterForDate(): Promise<AttendanceRosterEntry[]> {
    return [...this.roster];
  }

  async monthlySummary(): Promise<MonthlyAttendanceReport> {
    return { year: 2026, month: 8, schoolDays: [], learners: [] };
  }

  async record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    this.recordCalls.push({ sectionId, learnerId, attendanceDate, status });
    this.roster = this.roster.map((entry) =>
      entry.learnerId === learnerId ? { ...entry, status, recordedAt: "now" } : entry,
    );
    return {
      id: "a1",
      schoolId: "s1",
      sectionId,
      learnerId,
      attendanceDate,
      status,
      recordedAt: "now",
    };
  }

  async bulkMarkPresent(
    sectionId: string,
    attendanceDate: string,
  ): Promise<AttendanceRosterEntry[]> {
    this.bulkMarkPresentCalls.push({ sectionId, attendanceDate });
    this.roster = this.roster.map((entry) =>
      entry.status === null ? { ...entry, status: "present", recordedAt: "now" } : entry,
    );
    return [...this.roster];
  }
}

class FakeSectionRepository implements SectionRepository {
  constructor(private sections: Section[] = [SECTION]) {}

  async list(): Promise<Section[]> {
    return this.sections;
  }

  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }

  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }

  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

function renderScreen(roster: AttendanceRosterEntry[] = [], sections: Section[] = [SECTION]) {
  const repo = new FakeAttendanceRepository(roster);
  const service = new AttendanceApplicationService(repo, () => new Date("2026-08-24"));
  const sectionService = new SectionApplicationService(new FakeSectionRepository(sections));
  const result = render(
    <ModeProvider>
      <AttendanceScreen attendanceService={service} sectionService={sectionService} />
    </ModeProvider>,
  );
  return { ...result, repo };
}

beforeEach(() => {
  window.localStorage.clear();
  // AttendanceScreen's own `todayAsIsoDate()` reads the real system clock
  // (independently of the fixed `now` these tests inject into
  // AttendanceApplicationService below) to default the date picker's
  // value — without freezing it too, this whole file silently breaks the
  // day after whatever fixed date the service uses, since the picker's
  // "today" and the service's injected "today" drift apart. Fake only
  // `Date`, not timers/setTimeout, so userEvent's own internals are
  // unaffected. See docs/learning/ERROR-PATTERNS.md.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AttendanceScreen", () => {
  it("shows a message when there are no sections yet", async () => {
    renderScreen([], []);

    expect(await screen.findByText(/no sections created yet/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no learners yet in the selected section", async () => {
    renderScreen([]);

    expect(
      await screen.findByText("No learners enrolled in this section yet."),
    ).toBeInTheDocument();
  });

  it("lists the roster with unmarked learners showing no pressed status", async () => {
    renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: null,
        recordedAt: null,
      },
    ]);

    expect(await screen.findByText("Ana Santos")).toBeInTheDocument();
    const presentButton = screen.getByRole("button", { name: "Present" });
    expect(presentButton).toHaveAttribute("aria-pressed", "false");
  });

  it("shows an already-recorded status as pressed", async () => {
    renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: "absent",
        recordedAt: "2026-08-24T00:00:00Z",
      },
    ]);
    await screen.findByText("Ana Santos");

    expect(screen.getByRole("button", { name: "Absent" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks a learner present and reflects the change immediately", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: null,
        recordedAt: null,
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Present" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Present" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(repo.recordCalls).toEqual([
      { sectionId: "sec-1", learnerId: "l1", attendanceDate: "2026-08-24", status: "present" },
    ]);
  });

  it("changes a mark from one status to another", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Tardy" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tardy" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: "Present" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks all unmarked learners present without touching an existing mark", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
      {
        learnerId: "l2",
        givenName: "Ben",
        familyName: "Reyes",
        status: "absent",
        recordedAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Mark all present" }));

    // Wait for the actual outcome of the async bulk-mark call — not just
    // "the group element exists," which is trivially true before the
    // click too and would let this assertion race ahead of the state
    // update it's meant to verify.
    const anaGroup = screen.getByRole("group", { name: /attendance status for ana santos/i });
    await waitFor(() =>
      expect(within(anaGroup).getByRole("button", { name: "Present" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    const benGroup = screen.getByRole("group", { name: /attendance status for ben reyes/i });
    expect(within(benGroup).getByRole("button", { name: "Absent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(repo.bulkMarkPresentCalls).toEqual([
      { sectionId: "sec-1", attendanceDate: "2026-08-24" },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(/marked 1 learner present/i);
  });

  it("disables the bulk-mark button once every learner already has a mark", async () => {
    renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    expect(screen.getByRole("button", { name: "Mark all present" })).toBeDisabled();
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen([]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Attendance" })).toHaveFocus());
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen([]);
    await screen.findByText("No learners enrolled in this section yet.");

    expect(screen.getByText(/mark each learner present/i)).toBeInTheDocument();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen([]);
    await screen.findByText("No learners enrolled in this section yet.");

    expect(screen.queryByText(/mark each learner present/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ]);
    await waitFor(() => screen.getByText("Ana Santos"));

    await expectNoAccessibilityViolations(container);
  });
});
