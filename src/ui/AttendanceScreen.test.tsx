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
  rosterForDateCallCount = 0;
  failNextBulkMarkPresentCall = false;
  failNextRecordCall = false;

  constructor(private roster: AttendanceRosterEntry[] = []) {}

  async rosterForDate(): Promise<AttendanceRosterEntry[]> {
    this.rosterForDateCallCount += 1;
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
    if (this.failNextRecordCall) {
      this.failNextRecordCall = false;
      throw new Error("simulated record failure");
    }
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
    if (this.failNextBulkMarkPresentCall) {
      this.failNextBulkMarkPresentCall = false;
      throw new Error("simulated bulk-mark failure");
    }
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

const SECTION_A: Section = {
  id: "sec-a",
  schoolId: "s1",
  schoolYear: "2025-2026",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

const SECTION_B: Section = {
  id: "sec-b",
  schoolId: "s1",
  schoolYear: "2025-2026",
  gradeLevel: "8",
  name: "Rizal",
  createdAt: "now",
};

/** A repository whose `rosterForDate` behavior is configured per section
 * id, so a test can make one section succeed and another fail — used to
 * reproduce the stale-context-after-a-failed-load defect. */
class PerSectionAttendanceRepository implements AttendanceRepository {
  constructor(private readonly bySection: Record<string, AttendanceRosterEntry[] | "reject">) {}

  async rosterForDate(sectionId: string): Promise<AttendanceRosterEntry[]> {
    const configured = this.bySection[sectionId];
    if (configured === "reject" || configured === undefined) {
      throw new Error("simulated roster load failure");
    }
    return configured;
  }

  async monthlySummary(): Promise<MonthlyAttendanceReport> {
    return { year: 2026, month: 8, schoolDays: [], learners: [] };
  }

  async record(): Promise<AttendanceRecord | null> {
    throw new Error("not used in this test");
  }

  async bulkMarkPresent(): Promise<AttendanceRosterEntry[]> {
    throw new Error("not used in this test");
  }
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

  it("Retry on a failed bulk-mark actually retries the bulk mark, not a roster reload", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");
    repo.failNextBulkMarkPresentCall = true;

    await user.click(screen.getByRole("button", { name: "Mark all present" }));

    await screen.findByText(/could not mark the roster present/i);
    const rosterCallsBeforeRetry = repo.rosterForDateCallCount;

    await user.click(screen.getByRole("button", { name: "Retry" }));

    const anaGroup = screen.getByRole("group", { name: /attendance status for ana santos/i });
    await waitFor(() =>
      expect(within(anaGroup).getByRole("button", { name: "Present" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    // The bug this pins: Retry must call bulkMarkPresent again, not just
    // loadRoster (which would leave the learner unmarked and misleadingly
    // imply the retry had done something).
    expect(repo.bulkMarkPresentCalls).toEqual([
      { sectionId: "sec-1", attendanceDate: "2026-08-24" },
      { sectionId: "sec-1", attendanceDate: "2026-08-24" },
    ]);
    expect(repo.rosterForDateCallCount).toBe(rosterCallsBeforeRetry);
    expect(screen.queryByText(/could not mark the roster present/i)).not.toBeInTheDocument();
  });

  it("clicking Retry on a failed bulk-mark does not drop keyboard focus to <body>", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");
    repo.failNextBulkMarkPresentCall = true;
    await user.click(screen.getByRole("button", { name: "Mark all present" }));
    await screen.findByText(/could not mark the roster present/i);

    // Retry's own retry function clears the error (unmounting the Retry
    // button being clicked) as its first synchronous step -- without a
    // focus fix, the browser drops focus to <body> at that point.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("heading", { name: "Attendance" })).toHaveFocus();
  });

  it("clicking Retry on a failed roster load does not drop keyboard focus to <body>", async () => {
    const user = userEvent.setup();
    const repo = new PerSectionAttendanceRepository({});
    const sectionService = new SectionApplicationService(new FakeSectionRepository([SECTION]));
    render(
      <ModeProvider>
        <AttendanceScreen
          attendanceService={new AttendanceApplicationService(repo, () => new Date("2026-08-24"))}
          sectionService={sectionService}
        />
      </ModeProvider>,
    );
    await screen.findByText(/could not load the attendance roster for this date/i);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("heading", { name: "Attendance" })).toHaveFocus();
  });

  it("clicking a row's Retry after a failed mark keeps focus on that row's status button, not <body>", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");
    repo.failNextRecordCall = true;

    await user.click(screen.getByRole("button", { name: "Present" }));
    await screen.findByText(/could not save this mark/i);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(document.activeElement).not.toBe(document.body);
    const anaGroup = screen.getByRole("group", { name: /attendance status for ana santos/i });
    expect(within(anaGroup).getByRole("button", { name: "Present" })).toHaveFocus();
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

  it("communicates that Mark all present preserves existing marks in every teacher mode", async () => {
    renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");

    // Not mode-gated: this reassurance must be visible in Comfortable
    // (the default) too, not only in Guided mode's extra explanatory copy.
    expect(screen.getByText(/never changes a mark you've already made/i)).toBeInTheDocument();
  });

  it("never shows a previous section's roster after switching to a section whose load fails", async () => {
    const user = userEvent.setup();
    const repo = new PerSectionAttendanceRepository({
      "sec-a": [
        { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
      ],
      "sec-b": "reject",
    });
    const service = new AttendanceApplicationService(repo, () => new Date("2026-08-24"));
    const sectionService = new SectionApplicationService(
      new FakeSectionRepository([SECTION_A, SECTION_B]),
    );
    render(
      <ModeProvider>
        <AttendanceScreen attendanceService={service} sectionService={sectionService} />
      </ModeProvider>,
    );

    // Section A's roster loads successfully first.
    expect(await screen.findByText("Ana Santos")).toBeInTheDocument();

    // Switch to Section B, whose load fails.
    await user.selectOptions(screen.getByLabelText("Section"), "sec-b");

    await screen.findByText(/could not load the attendance roster/i);
    // Section A's roster must never render as if it belongs to Section B.
    expect(screen.queryByText("Ana Santos")).not.toBeInTheDocument();
  });

  it("does not perform a write when the teacher selects the already-active status", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Present" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(repo.recordCalls).toEqual([]);
  });

  it("never lets an older write's response overwrite a newer write for the same learner", async () => {
    const user = userEvent.setup();

    class OrderControlledAttendanceRepository implements AttendanceRepository {
      calls: Array<{ learnerId: string; status: AttendanceStatus }> = [];
      private pending: Array<(record: AttendanceRecord) => void> = [];

      async rosterForDate(): Promise<AttendanceRosterEntry[]> {
        return [
          {
            learnerId: "l1",
            givenName: "Ana",
            familyName: "Santos",
            status: null,
            recordedAt: null,
          },
          {
            learnerId: "l2",
            givenName: "Ben",
            familyName: "Reyes",
            status: null,
            recordedAt: null,
          },
        ];
      }
      async monthlySummary(): Promise<MonthlyAttendanceReport> {
        return { year: 2026, month: 8, schoolDays: [], learners: [] };
      }
      record(
        _sectionId: string,
        learnerId: string,
        _attendanceDate: string,
        status: AttendanceStatus,
      ): Promise<AttendanceRecord | null> {
        this.calls.push({ learnerId, status });
        const index = this.calls.length - 1;
        return new Promise((resolve) => {
          this.pending[index] = (record) => resolve(record);
        });
      }
      resolveCall(index: number) {
        const call = this.calls[index];
        if (!call) throw new Error(`no call recorded at index ${index}`);
        this.pending[index]?.({
          id: `a${index}`,
          schoolId: "s1",
          sectionId: "sec-1",
          learnerId: call.learnerId,
          attendanceDate: "2026-08-24",
          status: call.status,
          recordedAt: `record-${index}`,
        });
      }
      async bulkMarkPresent(): Promise<AttendanceRosterEntry[]> {
        throw new Error("not used in this test");
      }
    }

    const repo = new OrderControlledAttendanceRepository();
    const service = new AttendanceApplicationService(repo, () => new Date("2026-08-24"));
    const sectionService = new SectionApplicationService(new FakeSectionRepository([SECTION]));
    render(
      <ModeProvider>
        <AttendanceScreen attendanceService={service} sectionService={sectionService} />
      </ModeProvider>,
    );
    await screen.findByText("Ana Santos");
    const anaGroup = screen.getByRole("group", { name: /attendance status for ana santos/i });
    const benGroup = screen.getByRole("group", { name: /attendance status for ben reyes/i });

    // Start Ana's write (call 0), then Ben's write (call 1) -- Ben's write
    // starting must not leave Ana's row stuck disabled, and must not let a
    // later write for Ana be blocked from starting.
    await user.click(within(anaGroup).getByRole("button", { name: "Present" }));
    await user.click(within(benGroup).getByRole("button", { name: "Present" }));
    // A second, newer write for Ana (call 2) starts before call 0 resolves.
    await user.click(within(anaGroup).getByRole("button", { name: "Absent" }));

    // Resolve out of order: the newer write (call 2, Absent) resolves first...
    repo.resolveCall(2);
    await waitFor(() =>
      expect(within(anaGroup).getByRole("button", { name: "Absent" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    // ...then the older write (call 0, Present) arrives late.
    repo.resolveCall(0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Ana's displayed status must still reflect the newer write (Absent),
    // never reverted by the stale, older response.
    expect(within(anaGroup).getByRole("button", { name: "Absent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(anaGroup).getByRole("button", { name: "Present" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("does not allow an individual write to start while a bulk mark-all-present is in flight", async () => {
    const user = userEvent.setup();

    class SlowBulkRepository implements AttendanceRepository {
      resolveBulk: ((roster: AttendanceRosterEntry[]) => void) | null = null;
      recordCalls: unknown[] = [];

      async rosterForDate(): Promise<AttendanceRosterEntry[]> {
        return [
          {
            learnerId: "l1",
            givenName: "Ana",
            familyName: "Santos",
            status: null,
            recordedAt: null,
          },
        ];
      }
      async monthlySummary(): Promise<MonthlyAttendanceReport> {
        return { year: 2026, month: 8, schoolDays: [], learners: [] };
      }
      async record(): Promise<AttendanceRecord | null> {
        this.recordCalls.push(true);
        throw new Error("individual write must not be reachable while bulk marking is in flight");
      }
      bulkMarkPresent(): Promise<AttendanceRosterEntry[]> {
        return new Promise((resolve) => {
          this.resolveBulk = resolve;
        });
      }
    }

    const repo = new SlowBulkRepository();
    const service = new AttendanceApplicationService(repo, () => new Date("2026-08-24"));
    const sectionService = new SectionApplicationService(new FakeSectionRepository([SECTION]));
    render(
      <ModeProvider>
        <AttendanceScreen attendanceService={service} sectionService={sectionService} />
      </ModeProvider>,
    );
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Mark all present" }));

    // While the bulk operation is in flight, the individual status buttons
    // must be disabled -- the teacher-understandable serialization rule.
    expect(screen.getByRole("button", { name: "Present" })).toBeDisabled();

    repo.resolveBulk?.([
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Present" })).not.toBeDisabled());
    expect(repo.recordCalls).toEqual([]);
  });

  it("marks a learner present by pressing P while focus is on their status button", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");

    screen.getByRole("button", { name: "Absent" }).focus();
    await user.keyboard("p");

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

  it("moves focus to the same status button on the next/previous learner with ArrowDown/ArrowUp", async () => {
    const user = userEvent.setup();
    renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
      { learnerId: "l2", givenName: "Ben", familyName: "Reyes", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");
    const anaGroup = screen.getByRole("group", { name: /attendance status for ana santos/i });
    const benGroup = screen.getByRole("group", { name: /attendance status for ben reyes/i });

    within(anaGroup).getByRole("button", { name: "Tardy" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(within(benGroup).getByRole("button", { name: "Tardy" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(within(anaGroup).getByRole("button", { name: "Tardy" })).toHaveFocus();
  });

  it("does not intercept typing in the date field with attendance keyboard shortcuts", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");

    const dateInput = screen.getByLabelText("Date");
    dateInput.focus();
    await user.keyboard("p");

    expect(repo.recordCalls).toEqual([]);
  });

  it("opens monthly summary with the current section and the selected date's year/month", async () => {
    const user = userEvent.setup();
    const onViewMonthlySummary = vi.fn();
    const repo = new FakeAttendanceRepository([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    const service = new AttendanceApplicationService(repo, () => new Date("2026-08-24"));
    const sectionService = new SectionApplicationService(new FakeSectionRepository([SECTION]));
    render(
      <ModeProvider>
        <AttendanceScreen
          attendanceService={service}
          sectionService={sectionService}
          onViewMonthlySummary={onViewMonthlySummary}
        />
      </ModeProvider>,
    );
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "View monthly summary" }));

    expect(onViewMonthlySummary).toHaveBeenCalledWith("sec-1", 2026, 8);
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

  it("has no detectable accessibility violations with a row error and a failed bulk mark both showing", async () => {
    const user = userEvent.setup();
    const { container, repo } = renderScreen([
      { learnerId: "l1", givenName: "Ana", familyName: "Santos", status: null, recordedAt: null },
    ]);
    await screen.findByText("Ana Santos");

    repo.failNextRecordCall = true;
    await user.click(screen.getByRole("button", { name: "Present" }));
    await screen.findByText(/could not save this mark/i);

    repo.failNextBulkMarkPresentCall = true;
    await user.click(screen.getByRole("button", { name: "Mark all present" }));
    await screen.findByText(/could not mark the roster present/i);

    await expectNoAccessibilityViolations(container);
  });
});
