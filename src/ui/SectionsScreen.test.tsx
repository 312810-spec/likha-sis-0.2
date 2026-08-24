import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LearnerApplicationService } from "../application/learner-service";
import { SectionApplicationService } from "../application/section-service";
import type { Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SectionsScreen } from "./SectionsScreen";

const LEARNER: Learner = {
  id: "l1",
  schoolId: "s1",
  givenName: "Ana",
  familyName: "Santos",
  lrn: null,
  sex: null,
  createdAt: "now",
};

class FakeLearnerRepository implements LearnerRepository {
  constructor(private learners: Learner[] = [LEARNER]) {}

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
  createCalls: Array<{ schoolYear: string; gradeLevel: string; name: string }> = [];
  enrollCalls: Array<{ sectionId: string; learnerId: string; startsOn: string }> = [];

  constructor(private sections: Section[] = []) {}

  async list(): Promise<Section[]> {
    return this.sections;
  }

  async create(schoolYear: string, gradeLevel: string, name: string): Promise<Section> {
    this.createCalls.push({ schoolYear, gradeLevel, name });
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear,
      gradeLevel,
      name,
      createdAt: "now",
    };
    this.sections = [...this.sections, section];
    return section;
  }

  async enroll(
    sectionId: string,
    learnerId: string,
    startsOn: string,
  ): Promise<SectionMembership | null> {
    this.enrollCalls.push({ sectionId, learnerId, startsOn });
    return {
      id: "mem-1",
      schoolId: "s1",
      sectionId,
      learnerId,
      startsOn,
      endsOn: null,
      createdAt: "now",
    };
  }

  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

function renderScreen(sections: Section[] = []) {
  const sectionRepo = new FakeSectionRepository(sections);
  const sectionService = new SectionApplicationService(sectionRepo);
  const learnerService = new LearnerApplicationService(new FakeLearnerRepository());
  const result = render(
    <ModeProvider>
      <SectionsScreen sectionService={sectionService} learnerService={learnerService} />
    </ModeProvider>,
  );
  return { ...result, sectionRepo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("SectionsScreen", () => {
  it("shows an empty state when there are no sections yet", async () => {
    renderScreen();

    expect(await screen.findByText("No sections created yet.")).toBeInTheDocument();
  });

  it("creates a section and shows it in the list", async () => {
    const user = userEvent.setup();
    const { sectionRepo } = renderScreen();
    await screen.findByText("No sections created yet.");

    await user.type(screen.getByLabelText("School year"), "2025-2026");
    await user.type(screen.getByLabelText("Grade level"), "7");
    await user.type(screen.getByLabelText("Section name"), "Mabini");
    await user.click(screen.getByRole("button", { name: "Create section" }));

    await waitFor(() =>
      expect(screen.getByText(/Mabini — Grade 7 \(2025-2026\)/)).toBeInTheDocument(),
    );
    expect(sectionRepo.createCalls).toEqual([
      { schoolYear: "2025-2026", gradeLevel: "7", name: "Mabini" },
    ]);
  });

  it("enrolls a learner into an existing section", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { sectionRepo } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.selectOptions(screen.getByLabelText("Section"), "sec-1");
    await user.selectOptions(screen.getByLabelText("Learner"), "l1");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    await waitFor(() => expect(screen.getByText("Learner enrolled.")).toBeInTheDocument());
    expect(sectionRepo.enrollCalls).toEqual([
      { sectionId: "sec-1", learnerId: "l1", startsOn: expect.any(String) },
    ]);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sections" })).toHaveFocus());
  });

  it("has no detectable accessibility violations", async () => {
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { container } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await expectNoAccessibilityViolations(container);
  });
});
