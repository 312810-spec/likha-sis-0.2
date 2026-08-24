import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { GradingApplicationService } from "../application/grading-service";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { GradingRepository } from "../domain/ports/grading-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { GradingPeriodsScreen } from "./GradingPeriodsScreen";
import { ModeProvider } from "./theme/ModeContext";

const POLICY: GradingPolicy = {
  id: "p1",
  name: "DepEd Three-Term School Calendar",
  sourceCitation: "DepEd Order No. 9, s. 2026",
  isDefault: true,
  createdAt: "now",
};

const PERIODS: GradingPolicyPeriod[] = [
  { id: "pp1", policyId: "p1", sequence: 1, label: "1st Term" },
  { id: "pp2", policyId: "p1", sequence: 2, label: "2nd Term" },
];

class FakeGradingRepository implements GradingRepository {
  createCalls: Array<{
    schoolYear: string;
    policyPeriodId: string;
    startsOn: string;
    endsOn: string;
  }> = [];
  createResult: GradingPeriod | null = {
    id: "gp1",
    schoolId: "s1",
    schoolYear: "2026-2027",
    policyPeriodId: "pp1",
    label: "1st Term",
    startsOn: "2026-06-08",
    endsOn: "2026-09-15",
    createdAt: "now",
  };

  constructor(
    private policies: GradingPolicy[] = [POLICY],
    private policyPeriods: GradingPolicyPeriod[] = PERIODS,
    private existingPeriods: GradingPeriod[] = [],
  ) {}

  async listPolicies(): Promise<GradingPolicy[]> {
    return this.policies;
  }

  async listPolicyPeriods(): Promise<GradingPolicyPeriod[]> {
    return this.policyPeriods;
  }

  async listPeriodsBySchoolYear(): Promise<GradingPeriod[]> {
    return this.existingPeriods;
  }

  async createPeriod(
    schoolYear: string,
    policyPeriodId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<GradingPeriod | null> {
    this.createCalls.push({ schoolYear, policyPeriodId, startsOn, endsOn });
    return this.createResult;
  }
}

function renderScreen(repo: FakeGradingRepository = new FakeGradingRepository()) {
  const service = new GradingApplicationService(repo);
  const result = render(
    <ModeProvider>
      <GradingPeriodsScreen gradingService={service} />
    </ModeProvider>,
  );
  return { ...result, repo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("GradingPeriodsScreen", () => {
  it("shows the default policy's periods with the source citation", async () => {
    renderScreen();

    expect(await screen.findByText("1st Term")).toBeInTheDocument();
    expect(screen.getByText("2nd Term")).toBeInTheDocument();
    expect(screen.getByText(/DepEd Order No\. 9, s\. 2026/)).toBeInTheDocument();
  });

  it("saves a new grading period with the entered dates", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await screen.findByText("1st Term");

    const dateInputs = screen.getAllByDisplayValue("");
    // First date input pair belongs to the 1st Term row (start then end).
    await user.type(dateInputs.at(0)!, "2026-06-08");
    await user.type(dateInputs.at(1)!, "2026-09-15");
    await user.click(screen.getAllByRole("button", { name: "Save" }).at(0)!);

    await waitFor(() => expect(screen.getByText("1st Term saved.")).toBeInTheDocument());
    expect(repo.createCalls).toEqual([
      {
        schoolYear: expect.any(String),
        policyPeriodId: "pp1",
        startsOn: "2026-06-08",
        endsOn: "2026-09-15",
      },
    ]);
  });

  it("shows an already-saved period's dates as read-only, not an editable form", async () => {
    const repo = new FakeGradingRepository([POLICY], PERIODS, [
      {
        id: "gp1",
        schoolId: "s1",
        schoolYear: "2026-2027",
        policyPeriodId: "pp1",
        label: "1st Term",
        startsOn: "2026-06-08",
        endsOn: "2026-09-15",
        createdAt: "now",
      },
    ]);
    renderScreen(repo);

    await screen.findByText("1st Term");
    expect(await screen.findByText("2026-06-08")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    // Only the still-unsaved "2nd Term" row should have a Save button.
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Grading Periods" })).toHaveFocus(),
    );
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen();
    await screen.findByText("1st Term");

    expect(screen.getByText(/enter the actual start\/end date/i)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("1st Term");

    await expectNoAccessibilityViolations(container);
  });
});
