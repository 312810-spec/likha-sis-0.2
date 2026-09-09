import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SectionApplicationService } from "../application/section-service";
import type {
  CorrectPlacementResult,
  EndEnrollmentResult,
  EnrollMembershipResult,
  EnrollmentCandidate,
  Section,
  SectionMembership,
  SectionRosterMember,
  TransferResult,
} from "../domain/section";
import type { SectionRepository } from "../domain/ports/section-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { SeatingChartScreen } from "./SeatingChartScreen";
import { ModeProvider } from "./theme/ModeContext";

const SECTION: Section = {
  id: "sec1",
  schoolId: "s1",
  schoolYear: "2026-2027",
  gradeLevel: "Grade 7",
  name: "Rizal",
  createdAt: "now",
};

const ROSTER: SectionRosterMember[] = [
  {
    membershipId: "m1",
    learnerId: "l1",
    givenName: "Ana",
    familyName: "Reyes",
    lrn: null,
    startsOn: "2026-06-08",
  },
  {
    membershipId: "m2",
    learnerId: "l2",
    givenName: "Ben",
    familyName: "Santos",
    lrn: null,
    startsOn: "2026-06-08",
  },
];

class FakeSectionRepository implements SectionRepository {
  async list(): Promise<Section[]> {
    return [SECTION];
  }
  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }
  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }
  async roster(): Promise<SectionRosterMember[]> {
    return ROSTER;
  }
  async transferMembership(): Promise<TransferResult> {
    throw new Error("not used in this test");
  }
  async endMembership(): Promise<EndEnrollmentResult> {
    throw new Error("not used in this test");
  }
  async listEnrollableLearners(): Promise<EnrollmentCandidate[]> {
    throw new Error("not used in this test");
  }
  async enrollMembership(): Promise<EnrollMembershipResult> {
    throw new Error("not used in this test");
  }
  async correctSameDayPlacement(): Promise<CorrectPlacementResult> {
    throw new Error("not used in this test");
  }
}

function renderScreen() {
  const sectionService = new SectionApplicationService(new FakeSectionRepository());
  return render(
    <ModeProvider>
      <SeatingChartScreen sectionService={sectionService} />
    </ModeProvider>,
  );
}

describe("SeatingChartScreen", () => {
  it("says the chart is session-local, not saved", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Seating Chart" });
    expect(screen.getByText(/session-local/i)).toBeInTheDocument();
  });

  it("places a selected learner into a clicked seat, then clears it on a second click", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Seating Chart" });
    await screen.findByText("Ana Reyes");

    await user.click(screen.getByRole("button", { name: "Ana Reyes" }));
    const [firstSeat] = screen.getAllByRole("gridcell");
    await user.click(firstSeat!);

    expect(await screen.findByRole("gridcell", { name: "Ana Reyes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ana Reyes" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("gridcell", { name: "Ana Reyes" }));
    expect(await screen.findByRole("button", { name: "Ana Reyes" })).toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("heading", { name: "Seating Chart" });
    await screen.findByText("Ana Reyes");
    await expectNoAccessibilityViolations(container);
  });
});
