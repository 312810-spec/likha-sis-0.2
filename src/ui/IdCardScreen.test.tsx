import { render, screen, within } from "@testing-library/react";
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
import { IdCardScreen } from "./IdCardScreen";
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
    lrn: "123456789012",
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
      <IdCardScreen
        sectionService={sectionService}
        schoolId="s1"
        schoolName="Mabini Elementary School"
      />
    </ModeProvider>,
  );
}

describe("IdCardScreen", () => {
  it("flags the photo-storage gap and the deferred QR rendering", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Student ID Card" });
    expect(screen.getByText(/Photo storage is not yet decided/i)).toBeInTheDocument();
    expect(screen.getByText(/not a QR code/i)).toBeInTheDocument();
  });

  it("generates a front/back card with a text token for a learner with an LRN", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Student ID Card" });
    await screen.findByRole("option", { name: "Ana Reyes" });

    await user.click(screen.getByRole("button", { name: /generate card/i }));

    const frontHeading = await screen.findByRole("heading", { name: "Front" });
    expect(screen.getByRole("heading", { name: "Back" })).toBeInTheDocument();
    const frontCard = frontHeading.closest<HTMLElement>(".id-card-face")!;
    expect(within(frontCard).getByText(/Ana Reyes/)).toBeInTheDocument();
    expect(within(frontCard).getByText(/LRN: 123456789012/)).toBeInTheDocument();
  });

  it("refuses to generate a card for a learner with no LRN on file", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Student ID Card" });
    await screen.findByRole("option", { name: "Ben Santos" });
    await user.selectOptions(screen.getByLabelText("Learner"), "l2");

    expect(screen.getByRole("button", { name: /generate card/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText(/no LRN on file/i)).toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("heading", { name: "Student ID Card" });
    await screen.findByRole("option", { name: "Ana Reyes" });
    await expectNoAccessibilityViolations(container);
  });
});
