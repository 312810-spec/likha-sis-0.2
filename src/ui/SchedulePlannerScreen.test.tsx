import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchedulePlanningApplicationService } from "../application/schedule-planning-service";
import type {
  GenerationResponse,
  PlanPlacement,
  PublishOutcome,
  SchedulePlan,
  ScheduleRoom,
  ScheduleSettings,
  SubjectScheduleRequirement,
  TeacherUnavailability,
  Violation,
} from "../domain/schedule-planning";
import type { SchedulePlanningRepository } from "../domain/ports/schedule-planning-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SchedulePlannerScreen } from "./SchedulePlannerScreen";

const unavailability: TeacherUnavailability = {
  id: "unavail-1",
  schoolId: "school-1",
  teacherUserId: "teacher-1",
  weekday: 5,
  startsAt: "12:00",
  endsAt: "13:00",
  reason: null,
  createdAt: "2026-10-08T01:00:00.000Z",
};

const room: ScheduleRoom = {
  id: "room-1",
  schoolId: "school-1",
  name: "Science Laboratory",
  isLab: true,
  createdAt: "2026-10-08T01:00:00.000Z",
};

const requirement: SubjectScheduleRequirement = {
  subjectId: "subject-1",
  schoolId: "school-1",
  requiredWeeklyMinutes: 300,
  updatedAt: "2026-10-08T01:00:00.000Z",
};

const settings: ScheduleSettings = {
  schoolId: "school-1",
  dayStartsAt: "07:30",
  dayEndsAt: "17:00",
  schoolDays: 5,
  periodMinutes: 50,
  passingMinutes: 10,
  maxDailyTeachingMinutes: 360,
  maxWeeklyTeachingMinutes: 1800,
  updatedAt: "2026-10-08T01:00:00.000Z",
};

const plan: SchedulePlan = {
  id: "plan-1",
  schoolId: "school-1",
  revision: 3,
  status: "draft",
  inputFingerprint: "abc123",
  generatorNote: "Generated 4 meetings",
  createdAt: "2026-10-08T01:00:00.000Z",
  publishedAt: null,
  publishedByUserId: null,
};

const placement: PlanPlacement = {
  id: "placement-1",
  planId: "plan-1",
  teachingAssignmentId: "assignment-1",
  teacherName: "Teacher A",
  sectionId: "section-1",
  sectionName: "Mabini",
  subjectName: "Mathematics",
  weekday: 1,
  startsAt: "07:30",
  endsAt: "08:20",
  room: null,
};

class FakeRepository implements SchedulePlanningRepository {
  settings = settings;
  currentPlan: SchedulePlan | null = plan;
  placements: PlanPlacement[] = [placement];
  generation: GenerationResponse = {
    planId: "plan-1",
    revision: 3,
    outcome: { outcome: "valid", placements: [placement], notes: [] },
  };
  violations: Violation[] = [];
  publishOutcome: PublishOutcome = { outcome: "published", revision: 3, meetingCount: 4 };
  generateCalls = 0;
  validateCalls = 0;
  publishCalls = 0;
  removePlacementCalls = 0;
  settingsCalls = 0;
  failGenerate = false;
  failPublish = false;

  async getScheduleSettings() {
    return this.settings;
  }
  async updateScheduleSettings() {
    this.settingsCalls += 1;
    return this.settings;
  }
  async listTeacherUnavailability() {
    return [];
  }
  async addTeacherUnavailability() {
    return unavailability;
  }
  async removeTeacherUnavailability() {
    return true;
  }
  async listScheduleRooms() {
    return [];
  }
  async createScheduleRoom() {
    return room;
  }
  async removeScheduleRoom() {
    return true;
  }
  async listSubjectScheduleRequirements() {
    return [];
  }
  async setSubjectScheduleRequirement() {
    return requirement;
  }
  async generateSchedulePlan() {
    this.generateCalls += 1;
    if (this.failGenerate) throw new Error("network");
    return this.generation;
  }
  async listSchedulePlanPlacements() {
    return this.placements;
  }
  async moveSchedulePlanPlacement() {
    return true;
  }
  async removeSchedulePlanPlacement() {
    this.removePlacementCalls += 1;
    this.placements = this.placements.filter((row) => row.id !== placement.id);
    return true;
  }
  async validateSchedulePlan() {
    this.validateCalls += 1;
    return this.violations;
  }
  async publishSchedulePlan() {
    this.publishCalls += 1;
    if (this.failPublish) throw new Error("network");
    return this.publishOutcome;
  }
  async listPublishedScheduleViews() {
    return null;
  }
  async listSchedulePlans() {
    return [];
  }
  async currentSchedulePlan() {
    return this.currentPlan;
  }
}

function renderPlanner(repository: FakeRepository) {
  return render(
    <ModeProvider>
      <SchedulePlannerScreen
        schedulePlanningService={new SchedulePlanningApplicationService(repository)}
        onBack={() => undefined}
      />
    </ModeProvider>,
  );
}

async function settled() {
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Teacher Load Maker" })).toBeInTheDocument(),
  );
}

describe("SchedulePlannerScreen", () => {
  it("prepares the grid from the school's settings", async () => {
    const repository = new FakeRepository();
    renderPlanner(repository);
    await settled();

    expect((screen.getByLabelText("Day starts") as HTMLInputElement).value).toBe("07:30");
    expect((screen.getByLabelText("School days per week") as HTMLInputElement).value).toBe("5");
  });

  it("saves the settings only on an explicit submit", async () => {
    const repository = new FakeRepository();
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.clear(screen.getByLabelText("Period length (minutes)"));
    await user.type(screen.getByLabelText("Period length (minutes)"), "60");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(repository.settingsCalls).toBe(1));
  });

  it("shows the draft revision the generator staged", async () => {
    const repository = new FakeRepository();
    renderPlanner(repository);
    await settled();

    expect(screen.getByText(/Draft revision 3/)).toBeInTheDocument();
    expect(screen.getByText(/Generated 4 meetings/)).toBeInTheDocument();
  });

  it("reports a valid generation by its meeting count", async () => {
    const repository = new FakeRepository();
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Generate plan" }));

    await waitFor(() => expect(repository.generateCalls).toBe(1));
    expect(await screen.findByText(/1 meeting placed/)).toBeInTheDocument();
  });

  it("reports a proven-impossible generation with its proof", async () => {
    const repository = new FakeRepository();
    repository.generation = {
      planId: "plan-1",
      revision: 4,
      outcome: {
        outcome: "impossible",
        placements: [],
        proofs: [
          {
            teachingAssignmentId: "assignment-1",
            teacherName: "Teacher A",
            sectionName: "Mabini",
            subjectName: "Mathematics",
            requiredWeeklyMinutes: 3000,
            availableWeeklyMinutes: 1800,
          },
        ],
      },
    };
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Generate plan" }));

    expect(await screen.findByText(/Proven impossible/)).toBeInTheDocument();
    expect(
      screen.getByText(/3000 weekly minutes required against 1800 available/),
    ).toBeInTheDocument();
  });

  it("reports a stopped search as 'no solution yet'", async () => {
    const repository = new FakeRepository();
    repository.generation = {
      planId: "plan-1",
      revision: 5,
      outcome: {
        outcome: "stopped",
        placements: [],
        unplaced: [
          {
            teachingAssignmentId: "assignment-1",
            teacherName: "Teacher A",
            sectionName: "Mabini",
            subjectName: "Mathematics",
            requiredWeeklyMinutes: 300,
            stillNeededMinutes: 120,
          },
        ],
        stepsUsed: 100,
      },
    };
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Generate plan" }));

    expect(await screen.findByText(/Search stopped at 100 steps/)).toBeInTheDocument();
    expect(screen.getByText(/120 minutes still needed/)).toBeInTheDocument();
  });

  it("lists the draft's placements for repair", async () => {
    const repository = new FakeRepository();
    renderPlanner(repository);
    await settled();

    expect(screen.getByText("Teacher A")).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("07:30–08:20")).toBeInTheDocument();
  });

  it("removes a placement the generator put somewhere unworkable", async () => {
    const repository = new FakeRepository();
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(
      screen.getByRole("button", {
        name: "Remove Teacher A's Monday 07:30 placement",
      }),
    );

    await waitFor(() => expect(repository.removePlacementCalls).toBe(1));
    expect(screen.queryByText("Teacher A")).not.toBeInTheDocument();
  });

  it("runs the independent checker and reports a clean plan", async () => {
    const repository = new FakeRepository();
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Check this plan" }));

    await waitFor(() => expect(repository.validateCalls).toBe(1));
    expect(await screen.findByText("No violations found.")).toBeInTheDocument();
  });

  it("explains each violation the checker finds", async () => {
    const repository = new FakeRepository();
    repository.violations = [
      {
        kind: "teacherDailyOverload",
        teacherName: "Teacher A",
        weekday: 1,
        minutes: 420,
        limit: 360,
      },
      {
        kind: "sharedLearners",
        sectionName: "Mabini",
        conflictingSectionName: "Bonifacio",
        weekday: 2,
        startsAt: "08:20",
        endsAt: "09:10",
      },
    ];
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Check this plan" }));

    expect(await screen.findByText(/2 violations found/)).toBeInTheDocument();
    expect(
      screen.getByText(/teaches 420 minutes on Monday, over the 360-minute daily limit/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mabini and Bonifacio share a learner but are both scheduled on Tuesday/),
    ).toBeInTheDocument();
  });

  it("publishes and reports the live revision", async () => {
    const repository = new FakeRepository();
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Publish plan" }));

    await waitFor(() => expect(repository.publishCalls).toBe(1));
    expect(await screen.findByText(/Published as revision 3/)).toBeInTheDocument();
    expect(screen.getByText(/4 meetings are now live/)).toBeInTheDocument();
  });

  it("reports a stale plan instead of publishing it", async () => {
    const repository = new FakeRepository();
    repository.publishOutcome = {
      outcome: "stale",
      storedFingerprint: "aaa",
      currentFingerprint: "bbb",
    };
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Publish plan" }));

    expect(await screen.findByText(/This plan is stale/)).toBeInTheDocument();
  });

  it("reports a violating plan with the checker's findings", async () => {
    const repository = new FakeRepository();
    repository.publishOutcome = {
      outcome: "violations",
      violations: [
        {
          kind: "teacherWeeklyOverload",
          teacherName: "Teacher A",
          minutes: 2000,
          limit: 1800,
        },
      ],
    };
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Publish plan" }));

    expect(await screen.findByText(/Publication refused/)).toBeInTheDocument();
    expect(
      screen.getByText(/teaches 2000 minutes this week, over the 1800-minute weekly limit/),
    ).toBeInTheDocument();
  });

  it("says nothing went live when a generation fails", async () => {
    const repository = new FakeRepository();
    repository.failGenerate = true;
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Generate plan" }));

    expect(
      await screen.findByText("Could not generate a plan. Nothing was staged — try again."),
    ).toBeInTheDocument();
  });

  it("says nothing went live when a publication fails", async () => {
    const repository = new FakeRepository();
    repository.failPublish = true;
    const user = userEvent.setup();
    renderPlanner(repository);
    await settled();

    await user.click(screen.getByRole("button", { name: "Publish plan" }));

    expect(
      await screen.findByText("Could not publish this plan. Nothing went live — try again."),
    ).toBeInTheDocument();
  });

  it("keeps the planner accessible", async () => {
    const repository = new FakeRepository();
    const { container } = renderPlanner(repository);
    await settled();

    await expectNoAccessibilityViolations(container);
  });
});
