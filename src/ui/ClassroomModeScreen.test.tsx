import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClassOccurrenceApplicationService } from "../application/class-occurrence-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  ClassOccurrence,
  LearnerFollowupMarker,
  OccurrenceOutcome,
} from "../domain/class-occurrence";
import type { ClassOccurrenceRepository } from "../domain/ports/class-occurrence-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type {
  AdviserAttendanceOverview,
  RecordEntryOutcome,
  SubjectAttendanceMonitor,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import type { Section } from "../domain/section";
import type { CreateMeetingOutcome, ScheduleMeeting } from "../domain/schedule-meeting";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignment, TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ClassroomModeScreen } from "./ClassroomModeScreen";
import type { TeacherClassWorkContext } from "./work-context";

const CLASS_CONTEXT: TeacherClassWorkContext = {
  teachingAssignmentId: "ta-1",
  subjectName: "Mathematics",
  sectionName: "Mabini",
  startsAt: "08:00",
  endsAt: "08:50",
  room: "Room A",
};

/** The cockpit dates every call with the local wall-clock date, so the
 * fixtures have to line up with it. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

const TODAY = todayIso();

function makeOccurrence(overrides: Partial<ClassOccurrence> = {}): ClassOccurrence {
  return {
    id: "occ-1",
    schoolId: "s1",
    teachingAssignmentId: "ta-1",
    occurrenceDate: TODAY,
    status: "planned",
    plannedStartsAt: "08:00",
    plannedEndsAt: "08:50",
    plannedRoom: "Room A",
    actualStartsAt: null,
    actualEndsAt: null,
    actualRoom: null,
    learningTarget: "Adds polynomials (M7AL-Ig-1)",
    quickEvidence: "",
    notes: "",
    summary: "",
    cancelledReason: "",
    startedAt: "2026-09-09T00:00:00.000Z",
    finishedAt: null,
    cancelledAt: null,
    revision: 0,
    createdByUserId: "u1",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Mirrors the Rust repository's own semantics rather than inventing a third
 * set: the same status transitions, the same refusal outcomes, and the same
 * "no occurrence means not started" reading. The point is to prove the
 * cockpit renders what it is given, not to re-prove the rules -- those are
 * covered by 31 Rust tests in `repository::class_occurrence`.
 */
class FakeClassOccurrenceRepository implements ClassOccurrenceRepository {
  occurrence: ClassOccurrence | null = null;
  history: ClassOccurrence[] = [];
  markers: LearnerFollowupMarker[] = [];
  /** The attendance gate the Rust side derives from session entries; flipped
   * by the test to let a finish through. */
  attendanceSettled = false;
  captureCalls = 0;
  nextMarkerId = 1;

  private record() {
    if (!this.occurrence) return;
    this.history = [this.occurrence, ...this.history.filter((o) => o.id !== this.occurrence?.id)];
  }

  async start(teachingAssignmentId: string, occurrenceDate: string) {
    void occurrenceDate;
    if (teachingAssignmentId !== "ta-1") {
      return { outcome: "unknownAssignment" } as OccurrenceOutcome;
    }
    if (this.occurrence) {
      return this.occurrence.status === "delivered"
        ? ({ outcome: "alreadyDelivered" } as OccurrenceOutcome)
        : this.occurrence.status === "cancelled"
          ? ({ outcome: "alreadyCancelled" } as OccurrenceOutcome)
          : ({ outcome: "alreadyOpen", occurrence: this.occurrence } as OccurrenceOutcome);
    }
    this.occurrence = makeOccurrence({ id: "occ-new" });
    this.record();
    return { outcome: "started", occurrence: this.occurrence } as OccurrenceOutcome;
  }

  async capture(
    _teachingAssignmentId: string,
    _occurrenceDate: string,
    fields: {
      actualStartsAt?: string | null;
      actualEndsAt?: string | null;
      actualRoom?: string | null;
      learningTarget?: string;
      quickEvidence?: string;
      notes?: string;
    },
  ) {
    if (!this.occurrence) return null;
    this.captureCalls += 1;
    this.occurrence = {
      ...this.occurrence,
      actualStartsAt: fields.actualStartsAt ?? null,
      actualEndsAt: fields.actualEndsAt ?? null,
      actualRoom: fields.actualRoom ?? null,
      learningTarget: fields.learningTarget ?? this.occurrence.learningTarget,
      quickEvidence: fields.quickEvidence ?? this.occurrence.quickEvidence,
      notes: fields.notes ?? this.occurrence.notes,
    };
    // A recorded slot that differs from the plan is what makes "changed"
    // distinguishable from "planned" on screen.
    const nothingRecorded =
      this.occurrence.actualStartsAt === null &&
      this.occurrence.actualEndsAt === null &&
      this.occurrence.actualRoom === null;
    const offSchedule = this.occurrence.plannedStartsAt === null;
    const deviates =
      !nothingRecorded &&
      (offSchedule ||
        this.occurrence.actualStartsAt !== this.occurrence.plannedStartsAt ||
        this.occurrence.actualEndsAt !== this.occurrence.plannedEndsAt ||
        this.occurrence.actualRoom !== this.occurrence.plannedRoom);
    this.occurrence.status = deviates ? "changed" : "planned";
    this.record();
    return this.occurrence;
  }

  async finish(_teachingAssignmentId: string, _occurrenceDate: string, summary: string) {
    if (!this.occurrence) return { outcome: "notStarted" } as OccurrenceOutcome;
    if (this.occurrence.status === "cancelled") {
      return { outcome: "cancelledCannotFinish" } as OccurrenceOutcome;
    }
    if (this.occurrence.status === "delivered") {
      return { outcome: "alreadyDelivered" } as OccurrenceOutcome;
    }
    if (!this.attendanceSettled) {
      return { outcome: "attendanceNotChecked" } as OccurrenceOutcome;
    }
    this.occurrence = {
      ...this.occurrence,
      status: "delivered",
      summary,
      finishedAt: "2026-09-09T01:00:00.000Z",
    };
    this.record();
    return { outcome: "updated", occurrence: this.occurrence } as OccurrenceOutcome;
  }

  async cancel(_teachingAssignmentId: string, _occurrenceDate: string, reason: string) {
    if (reason.trim().length === 0) {
      return { outcome: "cancelRequiresReason" } as OccurrenceOutcome;
    }
    this.occurrence = makeOccurrence({
      id: this.occurrence?.id ?? "occ-1",
      status: "cancelled",
      cancelledReason: reason,
      cancelledAt: "2026-09-09T01:00:00.000Z",
    });
    this.record();
    return { outcome: "updated", occurrence: this.occurrence } as OccurrenceOutcome;
  }

  async reopen() {
    if (!this.occurrence) return { outcome: "notStarted" } as OccurrenceOutcome;
    if (this.occurrence.status !== "delivered" && this.occurrence.status !== "cancelled") {
      return { outcome: "alreadyOpen", occurrence: this.occurrence } as OccurrenceOutcome;
    }
    this.occurrence = {
      ...this.occurrence,
      status: "changed",
      summary: "",
      cancelledReason: "",
      finishedAt: null,
      cancelledAt: null,
      revision: this.occurrence.revision + 1,
    };
    this.record();
    return { outcome: "updated", occurrence: this.occurrence } as OccurrenceOutcome;
  }

  async getForDate() {
    return this.occurrence;
  }

  async listForAssignment() {
    return this.history;
  }

  async markFollowup(_occurrenceId: string, sectionMembershipId: string, reason: string) {
    if (!this.occurrence) return null;
    if (!sectionMembershipId.startsWith("sm-")) return null;
    const existing = this.markers.find((m) => m.sectionMembershipId === sectionMembershipId);
    const marker: LearnerFollowupMarker = {
      id: existing?.id ?? `m-${this.nextMarkerId++}`,
      schoolId: "s1",
      classOccurrenceId: this.occurrence.id,
      sectionMembershipId,
      reason,
      clearedAt: null,
      markedByUserId: "u1",
      markedAt: "2026-09-09T01:00:00.000Z",
    };
    this.markers = [
      marker,
      ...this.markers.filter((m) => m.sectionMembershipId !== sectionMembershipId),
    ];
    return marker;
  }

  async clearFollowup(_occurrenceId: string, sectionMembershipId: string) {
    const marker = this.markers.find((m) => m.sectionMembershipId === sectionMembershipId);
    if (!marker) return null;
    const cleared = { ...marker, clearedAt: "2026-09-09T02:00:00.000Z" };
    this.markers = this.markers.map((m) => (m.id === marker.id ? cleared : m));
    return cleared;
  }

  async listFollowupMarkers() {
    return this.markers;
  }
}

function makeSession(status: "held" | "no_class" = "held"): SubjectAttendanceSession {
  return {
    id: "session-1",
    schoolId: "s1",
    teachingAssignmentId: "ta-1",
    sectionId: "sec-1",
    subjectId: "sub-1",
    sessionDate: TODAY,
    status,
    createdByUserId: "u1",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  };
}

const ROSTER: SubjectAttendanceRosterRow[] = [
  {
    membershipId: "sm-1",
    learnerId: "l-1",
    givenName: "Ana",
    familyName: "Cruz",
    entryStatus: "present",
  },
  {
    membershipId: "sm-2",
    learnerId: "l-2",
    givenName: "Ben",
    familyName: "Dela Cruz",
    entryStatus: null,
  },
];

function unused(): never {
  throw new Error("not used by Classroom Mode");
}

/** Only the two read methods the cockpit uses are implemented; the rest throw
 * so an accidental new dependency shows up as a test failure rather than a
 * silent no-op. */
class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  session: SubjectAttendanceSession | null = null;
  roster: SubjectAttendanceRosterRow[] = [];

  async openSession(): Promise<SubjectAttendanceSession | null> {
    unused();
  }
  async markNoClass(): Promise<SubjectAttendanceSession | null> {
    unused();
  }
  async recordEntry(): Promise<RecordEntryOutcome> {
    unused();
  }
  async markAllPresent(): Promise<SubjectAttendanceRosterRow[] | null> {
    unused();
  }
  async rosterForSession(
    _teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    return sessionId === this.session?.id ? this.roster : null;
  }
  async listSessions(): Promise<SubjectAttendanceSession[]> {
    return this.session ? [this.session] : [];
  }
  async monitor(): Promise<SubjectAttendanceMonitor | null> {
    unused();
  }
  async listAdviserViewSections(): Promise<Section[]> {
    unused();
  }
  async adviserOverview(): Promise<AdviserAttendanceOverview | null> {
    unused();
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine(): Promise<TeachingAssignmentSummary[]> {
    unused();
  }
  async listMeetings(): Promise<ScheduleMeeting[]> {
    unused();
  }
  async listBySection(): Promise<TeachingAssignmentDetail[]> {
    unused();
  }
  async create(): Promise<TeachingAssignment | null> {
    unused();
  }
  async remove(): Promise<boolean> {
    unused();
  }
  async createMeeting(): Promise<CreateMeetingOutcome> {
    unused();
  }
  async removeMeeting(): Promise<boolean> {
    unused();
  }
  async getLoad(): Promise<TeacherLoad> {
    unused();
  }
}

interface RenderOptions {
  occurrence?: ClassOccurrence | null;
  history?: ClassOccurrence[];
  session?: SubjectAttendanceSession | null;
  roster?: SubjectAttendanceRosterRow[];
  attendanceSettled?: boolean;
  markers?: LearnerFollowupMarker[];
}

function renderScreen(options: RenderOptions = {}) {
  const occurrenceRepo = new FakeClassOccurrenceRepository();
  occurrenceRepo.occurrence = options.occurrence ?? null;
  occurrenceRepo.history = options.history ?? [];
  occurrenceRepo.attendanceSettled = options.attendanceSettled ?? false;
  occurrenceRepo.markers = options.markers ?? [];
  const attendanceRepo = new FakeSubjectAttendanceRepository();
  attendanceRepo.session = options.session ?? null;
  attendanceRepo.roster = options.roster ?? [];
  const occurrenceService = new ClassOccurrenceApplicationService(occurrenceRepo);
  const attendanceService = new SubjectAttendanceApplicationService(
    attendanceRepo,
    new FakeTeachingAssignmentRepository(),
  );
  const onCheckAttendance = vi.fn();
  const onBackToClass = vi.fn();

  const rendered = render(
    <ModeProvider>
      <ClassroomModeScreen
        teachingAssignmentId="ta-1"
        classContext={CLASS_CONTEXT}
        classOccurrenceService={occurrenceService}
        subjectAttendanceService={attendanceService}
        onCheckAttendance={onCheckAttendance}
        onBackToClass={onBackToClass}
      />
    </ModeProvider>,
  );
  return {
    ...rendered,
    occurrenceRepo,
    attendanceRepo,
    onCheckAttendance,
    onBackToClass,
  };
}

async function learnerRow(name: RegExp): Promise<HTMLElement> {
  const section = await screen.findByText("Learner follow-up");
  const panel = section.closest("section");
  const item = within(panel as HTMLElement)
    .getByText(name)
    .closest("li");
  if (!item) throw new Error(`no roster row matched ${name}`);
  return item;
}

describe("ClassroomModeScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("says the class has not been started and offers to start it", async () => {
    const { container } = renderScreen();

    expect(await screen.findByText("This class has not been started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start class" })).toBeInTheDocument();
    // No status chip exists for a class that was never opened.
    expect(container.querySelectorAll(".status-chip")).toHaveLength(0);
    await expectNoAccessibilityViolations(container);
  });

  it("starts the class and opens the cockpit on the planned status", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Start class" }));

    expect(await screen.findByText("What is happening in this class")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByLabelText("Current learning target")).toHaveValue(
      "Adds polynomials (M7AL-Ig-1)",
    );
  });

  it("records a changed slot so the class reads as changed, not planned", async () => {
    const { occurrenceRepo } = renderScreen({
      occurrence: makeOccurrence(),
      attendanceSettled: true,
    });

    fireEvent.change(await screen.findByLabelText("Actual start"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("Actual end"), { target: { value: "09:50" } });

    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText("Changed")).toBeInTheDocument();
    expect(occurrenceRepo.occurrence?.actualStartsAt).toBe("09:00");
    expect(occurrenceRepo.occurrence?.status).toBe("changed");
  });

  it("sends a blank slot as null so clearing it does not count as a deviation", async () => {
    const { occurrenceRepo } = renderScreen({
      occurrence: makeOccurrence({ actualStartsAt: "09:00", status: "changed" }),
    });

    fireEvent.change(await screen.findByLabelText("Actual start"), { target: { value: "" } });
    await vi.advanceTimersByTimeAsync(600);

    expect(occurrenceRepo.occurrence?.actualStartsAt).toBeNull();
    expect(await screen.findByText("Planned")).toBeInTheDocument();
  });

  it("refuses to finish before attendance is checked and routes the teacher there", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onCheckAttendance } = renderScreen({ occurrence: makeOccurrence() });

    await user.click(await screen.findByRole("button", { name: "Finish class" }));

    const alert = await screen.findByText("Check attendance before finishing this class.");
    expect(
      within(alert.closest(".alert") as HTMLElement).getByRole("button", {
        name: "Check attendance",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Delivered")).not.toBeInTheDocument();

    await user.click(
      within(alert.closest(".alert") as HTMLElement).getByRole("button", {
        name: "Check attendance",
      }),
    );
    expect(onCheckAttendance).toHaveBeenCalledWith("ta-1");
  });

  it("finishes the class once attendance is settled and reviews the summary", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { occurrenceRepo } = renderScreen({
      occurrence: makeOccurrence(),
      attendanceSettled: true,
    });

    await user.type(
      await screen.findByLabelText("Session summary"),
      "Polynomials clicked; exit slips collected.",
    );
    await user.click(screen.getByRole("button", { name: "Finish class" }));

    expect(await screen.findByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("Polynomials clicked; exit slips collected.")).toBeInTheDocument();
    expect(occurrenceRepo.occurrence?.status).toBe("delivered");
    // The capture inputs lock once the class is confirmed.
    expect(screen.getByLabelText("Current learning target")).toBeDisabled();
  });

  it("refuses to cancel without a reason and records one when given", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { occurrenceRepo } = renderScreen({ occurrence: makeOccurrence() });

    await user.click(await screen.findByText("Cancel this class instead"));
    await user.click(screen.getByRole("button", { name: "Cancel class" }));

    expect(await screen.findByText("Give a reason for the cancellation.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reason for cancelling"), "School-wide suspension");
    await user.click(screen.getByRole("button", { name: "Cancel class" }));

    expect(await screen.findByText("This class was cancelled")).toBeInTheDocument();
    expect(screen.getByText(/School-wide suspension/)).toBeInTheDocument();
    expect(occurrenceRepo.occurrence?.status).toBe("cancelled");
  });

  it("reopens a delivered class, clearing the summary and bumping the revision", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { occurrenceRepo } = renderScreen({
      occurrence: makeOccurrence({
        status: "delivered",
        summary: "Went well",
        finishedAt: "2026-09-09T01:00:00.000Z",
      }),
    });

    await user.click(await screen.findByRole("button", { name: "Reopen class" }));

    expect(await screen.findByText("Changed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish class" })).toBeInTheDocument();
    expect(occurrenceRepo.occurrence?.revision).toBe(1);
    expect(occurrenceRepo.occurrence?.summary).toBe("");
  });

  it("marks a learner for follow-up and clears the marker without deleting it", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { occurrenceRepo } = renderScreen({
      occurrence: makeOccurrence(),
      session: makeSession(),
      roster: ROSTER,
    });

    const row = await learnerRow(/Ben Dela Cruz/);
    await user.click(within(row).getByRole("button", { name: "Follow up" }));
    await user.type(within(row).getByLabelText("Reason"), "Absent again; call home");
    await user.click(within(row).getByRole("button", { name: "Save marker" }));

    expect(await within(row).findByText("Absent again; call home")).toBeInTheDocument();
    expect(occurrenceRepo.markers).toHaveLength(1);
    expect(occurrenceRepo.markers[0]?.clearedAt).toBeNull();

    await user.click(within(row).getByRole("button", { name: "Clear" }));
    // The marker row stays, so "what required follow-up?" stays answerable.
    expect(occurrenceRepo.markers).toHaveLength(1);
    expect(occurrenceRepo.markers[0]?.clearedAt).not.toBeNull();
  });

  it("keeps planned, changed, cancelled and delivered sessions distinguishable in history", async () => {
    const { container } = renderScreen({
      // The headline holds today's delivered session; the history panel shows
      // the recorded ones, so the same row is not described twice.
      occurrence: makeOccurrence({
        id: "occ-today",
        status: "delivered",
        summary: "Today went well",
      }),
      history: [
        makeOccurrence({
          id: "occ-3",
          occurrenceDate: "2026-09-16",
          status: "changed",
          actualStartsAt: "09:00",
        }),
        makeOccurrence({
          id: "occ-2",
          occurrenceDate: "2026-09-12",
          status: "cancelled",
          cancelledReason: "Suspension",
        }),
        makeOccurrence({
          id: "occ-1",
          occurrenceDate: "2026-09-09",
          status: "delivered",
          summary: "Went well",
        }),
      ],
    });

    const heading = await screen.findByText("Recorded sessions for this class");
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const chips = within(section as HTMLElement).getAllByText(
      /^(Planned|Changed|Cancelled|Delivered)$/,
    );
    // Newest first, and every state is labelled in its own words.
    expect(chips.map((chip) => chip.textContent)).toEqual(["Changed", "Cancelled", "Delivered"]);
    expect(within(section as HTMLElement).getByText(/Suspension/)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/Went well/)).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });

  it("reports attendance as not checked until a session is opened", async () => {
    renderScreen({ occurrence: makeOccurrence() });

    expect(await screen.findByText("Not checked yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check attendance" })).toBeInTheDocument();
  });

  it("counts marked learners out of the roster", async () => {
    renderScreen({
      occurrence: makeOccurrence(),
      session: makeSession(),
      roster: ROSTER,
    });

    expect(await screen.findByText("1 of 2 marked")).toBeInTheDocument();
    expect(screen.getByText("Some learners still need a mark.")).toBeInTheDocument();
  });

  it("accepts an explicit no-class attendance decision as settled", async () => {
    renderScreen({
      occurrence: makeOccurrence(),
      session: makeSession("no_class"),
      roster: [],
    });

    expect(await screen.findByText("Marked: no class")).toBeInTheDocument();
  });

  it("returns to the class workspace when the teacher goes back", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onBackToClass } = renderScreen({ occurrence: makeOccurrence() });

    await user.click(await screen.findByRole("button", { name: "Back to class" }));
    expect(onBackToClass).toHaveBeenCalledOnce();
  });

  it("shows a load error with a retry rather than an empty cockpit", async () => {
    const occurrenceRepo = new FakeClassOccurrenceRepository();
    occurrenceRepo.getForDate = async () => {
      throw new Error("offline");
    };
    const occurrenceService = new ClassOccurrenceApplicationService(occurrenceRepo);
    const attendanceService = new SubjectAttendanceApplicationService(
      new FakeSubjectAttendanceRepository(),
      new FakeTeachingAssignmentRepository(),
    );

    render(
      <ModeProvider>
        <ClassroomModeScreen
          teachingAssignmentId="ta-1"
          classContext={CLASS_CONTEXT}
          classOccurrenceService={occurrenceService}
          subjectAttendanceService={attendanceService}
          onCheckAttendance={vi.fn()}
          onBackToClass={vi.fn()}
        />
      </ModeProvider>,
    );

    expect(await screen.findByText("Could not load this class session.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
