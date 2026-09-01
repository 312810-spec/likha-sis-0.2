import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerApplicationService } from "../application/learner-service";
import { SectionApplicationService } from "../application/section-service";
import { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type {
  SectionAdvisory,
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
} from "../domain/section-advisory";
import type { SchoolMember } from "../domain/school-member";
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

const TEACHER_MEMBER: SchoolMember = {
  id: "teacher-1",
  username: "teacher.maria",
  displayName: "Maria Santos",
  roles: ["teacher"],
};

const HEAD_MEMBER: SchoolMember = {
  id: "head-1",
  username: "head.juan",
  displayName: "Juan Dela Cruz",
  roles: ["school_head"],
};

class FakeLearnerRepository implements LearnerRepository {
  constructor(private learners: Learner[] = [LEARNER]) {}

  async list(): Promise<Learner[]> {
    return this.learners;
  }

  async create(): Promise<Learner> {
    throw new Error("not used in this test");
  }

  async createWithDuplicateCheck(): Promise<CreateLearnerResult> {
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

  async transferMembership(): Promise<never> {
    throw new Error("not used in this test");
  }

  async endMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async listEnrollableLearners(): Promise<never> {
    throw new Error("not used in this test");
  }
  async enrollMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async correctSameDayPlacement(): Promise<never> {
    throw new Error("not used in this test");
  }

  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  constructor(private members: SchoolMember[] = [TEACHER_MEMBER, HEAD_MEMBER]) {}

  async listMembers(): Promise<SchoolMember[]> {
    return this.members;
  }
}

class FakeSectionAdvisoryRepository implements SectionAdvisoryRepository {
  advisories: Record<string, SectionAdvisory | null> = {};
  assignCalls: Array<{ sectionId: string; teacherUserId: string; startsOn: string }> = [];
  endCalls: Array<{ sectionId: string; advisoryId: string; endsOn: string }> = [];

  constructor(initialAdvisories: Record<string, SectionAdvisory | null> = {}) {
    this.advisories = { ...initialAdvisories };
  }

  async getCurrentAdviser(sectionId: string): Promise<SectionAdvisory | null> {
    return this.advisories[sectionId] ?? null;
  }

  async assignAdviser(
    sectionId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignAdviserOutcome> {
    this.assignCalls.push({ sectionId, teacherUserId, startsOn });
    if (this.advisories[sectionId]) {
      return { kind: "alreadyHasAnActiveAdviser" };
    }
    const advisory: SectionAdvisory = {
      id: "adv-1",
      schoolId: "s1",
      sectionId,
      teacherUserId,
      startsOn,
      endsOn: null,
      createdAt: "now",
    };
    this.advisories[sectionId] = advisory;
    return { kind: "assigned", advisory };
  }

  async endAdviser(
    sectionId: string,
    advisoryId: string,
    endsOn: string,
  ): Promise<EndAdvisoryOutcome> {
    this.endCalls.push({ sectionId, advisoryId, endsOn });
    const current = this.advisories[sectionId];
    if (!current || current.id !== advisoryId) {
      return { kind: "notFound" };
    }
    const ended: SectionAdvisory = { ...current, endsOn };
    this.advisories[sectionId] = null;
    return { kind: "ended", advisory: ended };
  }
}

function renderScreen(
  sections: Section[] = [],
  initialAdvisories: Record<string, SectionAdvisory | null> = {},
) {
  const sectionRepo = new FakeSectionRepository(sections);
  const sectionService = new SectionApplicationService(sectionRepo);
  const learnerService = new LearnerApplicationService(new FakeLearnerRepository());
  const advisoryRepo = new FakeSectionAdvisoryRepository(initialAdvisories);
  const sectionAdvisoryService = new SectionAdvisoryApplicationService(advisoryRepo);
  const memberService = new SchoolMemberApplicationService(new FakeSchoolMemberRepository());

  const openRosterCalls: string[] = [];
  const manageAssignmentsCalls: Array<[string, string]> = [];
  const result = render(
    <ModeProvider>
      <SectionsScreen
        sectionService={sectionService}
        learnerService={learnerService}
        sectionAdvisoryService={sectionAdvisoryService}
        schoolMemberService={memberService}
        onOpenRoster={(sectionId) => openRosterCalls.push(sectionId)}
        onManageAssignments={(sectionId, sectionName) =>
          manageAssignmentsCalls.push([sectionId, sectionName])
        }
      />
    </ModeProvider>,
  );
  return {
    ...result,
    sectionRepo,
    advisoryRepo,
    openRosterCalls,
    manageAssignmentsCalls,
  };
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

  it("opens the roster for a section via its Open roster button", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { openRosterCalls } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.click(screen.getByRole("button", { name: "Open roster for Mabini" }));

    expect(openRosterCalls).toEqual(["sec-1"]);
  });

  it("opens teaching assignments for a section via its Manage assignments button", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { manageAssignmentsCalls } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.click(
      screen.getByRole("button", { name: "Manage teaching assignments for Mabini" }),
    );

    expect(manageAssignmentsCalls).toEqual([["sec-1", "Mabini"]]);
  });

  it("displays No adviser assigned when section has no active adviser", async () => {
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    renderScreen([section]);

    expect(await screen.findByText(/No adviser assigned/)).toBeInTheDocument();
  });

  it("displays current adviser name and start date when section has an active adviser", async () => {
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const advisory: SectionAdvisory = {
      id: "adv-1",
      schoolId: "s1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "now",
    };
    renderScreen([section], { "sec-1": advisory });

    expect(await screen.findByText(/Maria Santos \(since 2026-06-01\)/)).toBeInTheDocument();
  });

  it("assigns an adviser to a section with no active adviser", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { advisoryRepo } = renderScreen([section]);
    await screen.findByText(/No adviser assigned/);

    await user.click(screen.getByRole("button", { name: "Manage adviser for Mabini" }));

    expect(screen.getByRole("heading", { name: "Manage adviser for Mabini" })).toBeInTheDocument();
    // Teacher dropdown contains Maria Santos (teacher role) but not Juan Dela Cruz (school_head only)
    expect(screen.getByRole("option", { name: "Maria Santos" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Juan Dela Cruz" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Select teacher"), "teacher-1");
    await user.click(screen.getByRole("button", { name: "Assign adviser" }));

    await waitFor(() =>
      expect(screen.getByText("Maria Santos is now the adviser of Mabini.")).toBeInTheDocument(),
    );
    expect(advisoryRepo.assignCalls).toEqual([
      { sectionId: "sec-1", teacherUserId: "teacher-1", startsOn: expect.any(String) },
    ]);
    expect(screen.getByText(/Maria Santos \(since/)).toBeInTheDocument();
  });

  it("ends an active advisory for a section", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const advisory: SectionAdvisory = {
      id: "adv-1",
      schoolId: "s1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "now",
    };
    const { advisoryRepo } = renderScreen([section], { "sec-1": advisory });
    await screen.findByText(/Maria Santos \(since 2026-06-01\)/);

    await user.click(screen.getByRole("button", { name: "Manage adviser for Mabini" }));

    expect(screen.getByText(/Current adviser:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End advisory" }));

    await waitFor(() => expect(screen.getByText("Ended advisory for Mabini.")).toBeInTheDocument());
    expect(advisoryRepo.endCalls).toEqual([
      { sectionId: "sec-1", advisoryId: "adv-1", endsOn: expect.any(String) },
    ]);
    expect(screen.getByText(/No adviser assigned/)).toBeInTheDocument();
  });

  it("handles permission or backend error gracefully when assigning", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { advisoryRepo } = renderScreen([section]);
    vi.spyOn(advisoryRepo, "assignAdviser").mockRejectedValueOnce(new Error("Unauthorized"));
    await screen.findByText(/No adviser assigned/);

    await user.click(screen.getByRole("button", { name: "Manage adviser for Mabini" }));
    await user.selectOptions(screen.getByLabelText("Select teacher"), "teacher-1");
    await user.click(screen.getByRole("button", { name: "Assign adviser" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not assign adviser — check that you have permission to manage section advisories.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sections" })).toHaveFocus());
  });

  it("has no detectable accessibility violations in populated and open panel states", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const advisory: SectionAdvisory = {
      id: "adv-1",
      schoolId: "s1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "now",
    };
    const { container } = renderScreen([section], { "sec-1": advisory });
    await screen.findByText(/Maria Santos \(since 2026-06-01\)/);

    await expectNoAccessibilityViolations(container);

    await user.click(screen.getByRole("button", { name: "Manage adviser for Mabini" }));
    expect(screen.getByRole("heading", { name: "Manage adviser for Mabini" })).toBeInTheDocument();

    await expectNoAccessibilityViolations(container);
  });
});
