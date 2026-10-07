import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MyDayApplicationService } from "../application/my-day-service";
import type { MyDayRepository } from "../domain/ports/my-day-repository";
import type { MyDaySummary } from "../domain/my-day";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { MyDayScreen } from "./MyDayScreen";
import type { TeacherClassWorkContext } from "./work-context";

const SCHEDULE_ITEM = {
  teachingAssignmentId: "ta-1",
  subjectName: "Mathematics",
  sectionName: "Mabini",
  startsAt: "08:00",
  endsAt: "08:50",
  room: "Room 101",
};

const SUMMARY: MyDaySummary = {
  schedule: [SCHEDULE_ITEM],
  next: SCHEDULE_ITEM,
  pendingAttendance: [
    { teachingAssignmentId: "ta-1", subjectName: "Mathematics", sectionName: "Mabini" },
  ],
  pendingAssignments: [],
  pendingConflicts: [{ id: "c-1", entityKind: "learner" }],
  hasAnyAssignments: true,
};

/** A teacher who has classes, just none today. */
const FREE_DAY_SUMMARY: MyDaySummary = {
  schedule: [],
  next: null,
  pendingAttendance: [],
  pendingAssignments: [],
  pendingConflicts: [],
  hasAnyAssignments: true,
};

/** A teacher with no teaching assignments at all. */
const UNASSIGNED_SUMMARY: MyDaySummary = {
  schedule: [],
  next: null,
  pendingAttendance: [],
  pendingAssignments: [],
  pendingConflicts: [],
  hasAnyAssignments: false,
};

/** A class on this teacher's load that has never been given a schedule slot. */
const UNSCHEDULED_SUMMARY: MyDaySummary = {
  schedule: [],
  next: null,
  pendingAttendance: [],
  pendingAssignments: [
    { teachingAssignmentId: "ta-2", subjectName: "Filipino", sectionName: "Aguinaldo" },
  ],
  pendingConflicts: [],
  hasAnyAssignments: true,
};

class FakeMyDayRepository implements MyDayRepository {
  calls: Array<[number, string, string]> = [];
  constructor(private result: MyDaySummary | "reject" = SUMMARY) {}

  async getSummary(
    todayWeekday: number,
    todayDate: string,
    nowTime: string,
  ): Promise<MyDaySummary> {
    this.calls.push([todayWeekday, todayDate, nowTime]);
    if (this.result === "reject") throw new Error("boom");
    return this.result;
  }
}

function renderScreen(
  result: MyDaySummary | "reject" = SUMMARY,
  initialContext: TeacherClassWorkContext | null = null,
) {
  const repo = new FakeMyDayRepository(result);
  const service = new MyDayApplicationService(repo);
  const onCheckAttendance = vi.fn();
  const onOpenClassRecord = vi.fn();
  const onStartClassroom = vi.fn();
  const onReviewConflicts = vi.fn();

  function Host() {
    const [context, setContext] = useState<TeacherClassWorkContext | null>(initialContext);
    return (
      <ModeProvider>
        <MyDayScreen
          myDayService={service}
          selectedClassContext={context}
          onOpenClassContext={setContext}
          onBackToToday={() => setContext(null)}
          onCheckAttendance={onCheckAttendance}
          onOpenClassRecord={onOpenClassRecord}
          onStartClassroom={onStartClassroom}
          onReviewConflicts={onReviewConflicts}
        />
      </ModeProvider>
    );
  }

  const rendered = render(<Host />);
  return {
    ...rendered,
    repo,
    onCheckAttendance,
    onOpenClassRecord,
    onStartClassroom,
    onReviewConflicts,
  };
}

describe("MyDayScreen", () => {
  it("shows today's schedule and pending tasks", async () => {
    renderScreen();
    expect((await screen.findAllByText(/Mathematics — Mabini/)).length).toBeGreaterThan(0);
    expect(screen.getByText("attendance not yet checked")).toBeInTheDocument();
    expect(screen.getByText(/1 sync\s*conflict/)).toBeInTheDocument();
  });

  it("shows a free-day empty state when the teacher has classes but none today", async () => {
    renderScreen(FREE_DAY_SUMMARY);
    expect(await screen.findByText("No classes scheduled for you today.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing pending/)).toBeInTheDocument();
  });

  it("says when the teacher is not assigned to any class at all", async () => {
    renderScreen(UNASSIGNED_SUMMARY);
    expect(await screen.findByText("You are not assigned to any classes yet.")).toBeInTheDocument();
  });

  it("surfaces a class that has no schedule slot as pending", async () => {
    renderScreen(UNSCHEDULED_SUMMARY);
    expect(await screen.findByText("Filipino — Aguinaldo")).toBeInTheDocument();
    expect(screen.getByText("no schedule given to this class yet")).toBeInTheDocument();
  });

  it("marks the next upcoming class so it can be opened in one action", async () => {
    const user = userEvent.setup();
    renderScreen();
    const next = await screen.findByRole("button", { name: /Next up/ });
    expect(next).toHaveTextContent("Mathematics — Mabini");
    await user.click(next);
    expect(screen.getByRole("heading", { name: "Mathematics — Mabini" })).toBeInTheDocument();
  });

  it("does not mark any class as next once the day's classes have started", async () => {
    renderScreen({ ...SUMMARY, next: null });
    await screen.findAllByText(/Mathematics — Mabini/);
    expect(screen.queryByText("Next up")).not.toBeInTheDocument();
  });

  it("opens the scheduled class without asking for the class again", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Open class$/ }));
    expect(screen.getByRole("heading", { name: "Mathematics — Mabini" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected class schedule")).toHaveTextContent(
      "08:00–08:50 · Room 101",
    );
  });

  it("keeps the index and distinguishes repeat meetings of the same class", async () => {
    const user = userEvent.setup();
    const first = SUMMARY.schedule[0]!;
    renderScreen({
      ...SUMMARY,
      schedule: [first, { ...first, startsAt: "13:00", endsAt: "13:50" }],
    });
    const choices = await screen.findAllByRole("button", { name: /Open class$/ });
    await user.click(choices[0]!);
    expect(choices[0]).toHaveAttribute("aria-pressed", "true");
    expect(choices[1]).toHaveAttribute("aria-pressed", "false");
    await user.click(choices[1]!);
    expect(choices[0]).toHaveAttribute("aria-pressed", "false");
    expect(choices[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Selected class schedule")).toHaveTextContent("13:00–13:50");
  });

  it("can return from the class workspace to today's schedule", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Open class$/ }));
    await user.click(screen.getByRole("button", { name: "Back to Today" }));
    expect(screen.getByRole("heading", { name: "My Day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open class$/ })).toBeInTheDocument();
  });

  it("re-fetches the summary when returning from a class workspace", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await user.click(await screen.findByRole("button", { name: /Open class$/ }));
    const beforeReturn = repo.calls.length;
    await user.click(screen.getByRole("button", { name: "Back to Today" }));
    expect(repo.calls.length).toBeGreaterThan(beforeReturn);
  });

  it("opens subject attendance for the selected class from the class workspace", async () => {
    const user = userEvent.setup();
    const { onCheckAttendance } = renderScreen();
    await user.click(await screen.findByRole("button", { name: /Open class$/ }));
    await user.click(
      within(screen.getByRole("region", { name: "Mathematics — Mabini" })).getByRole("button", {
        name: "Check attendance",
      }),
    );
    expect(onCheckAttendance).toHaveBeenCalledWith("ta-1");
  });

  it("calls onCheckAttendance with the assignment id from Needs Attention", async () => {
    const user = userEvent.setup();
    const { onCheckAttendance } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Check attendance" }));
    expect(onCheckAttendance).toHaveBeenCalledWith("ta-1");
  });

  it("opens the class record for the selected class from the class workspace", async () => {
    const user = userEvent.setup();
    const { onOpenClassRecord } = renderScreen();
    await user.click(await screen.findByRole("button", { name: /Open class$/ }));
    await user.click(screen.getByRole("button", { name: "Open class record" }));
    expect(onOpenClassRecord).toHaveBeenCalledWith("ta-1");
  });

  it("calls onReviewConflicts when the review-conflicts button is clicked", async () => {
    const user = userEvent.setup();
    const { onReviewConflicts } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Review conflicts" }));
    expect(onReviewConflicts).toHaveBeenCalled();
  });

  it("retains previously selected class work when the schedule refresh fails", async () => {
    const user = userEvent.setup();
    const { onOpenClassRecord } = renderScreen("reject", SUMMARY.schedule[0]);
    await screen.findByText("Could not load My Day.");
    expect(screen.getByRole("heading", { name: "Mathematics — Mabini" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open class record" }));
    expect(onOpenClassRecord).toHaveBeenCalledWith("ta-1");
  });

  it("shows a retryable error when loading fails", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen("reject");
    expect(await screen.findByText("Could not load My Day.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(repo.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findAllByText(/Mathematics — Mabini/);
    await expectNoAccessibilityViolations(container);
  });
});
