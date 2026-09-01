import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import { FormGenerationApplicationService } from "../application/form-generation-service";
import { SectionApplicationService } from "../application/section-service";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../domain/export";
import type { Sf1GenerationResult, Sf9GenerationResult } from "../domain/form-generation";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { FormGenerationRepository } from "../domain/ports/form-generation-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
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
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SectionRosterScreen } from "./SectionRosterScreen";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "s1",
  schoolYear: "2025-2026",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

const SECTION_B: Section = {
  id: "sec-2",
  schoolId: "s1",
  schoolYear: "2025-2026",
  gradeLevel: "7",
  name: "Rizal",
  createdAt: "now",
};

const MEMBERSHIP: SectionMembership = {
  id: "m-new",
  schoolId: "s1",
  sectionId: "sec-1",
  learnerId: "l-free",
  startsOn: "2025-09-01",
  endsOn: null,
  createdAt: "now",
};

const ENROLLABLE: EnrollmentCandidate[] = [
  {
    learnerId: "l-free",
    givenName: "Dina",
    familyName: "Adan",
    lrn: "999888777666",
    currentMembershipId: null,
    currentSectionId: null,
    currentSectionName: null,
    currentStartsOn: null,
  },
  {
    learnerId: "l-here",
    givenName: "Ella",
    familyName: "Bravo",
    lrn: null,
    currentMembershipId: "m-here",
    currentSectionId: "sec-1",
    currentSectionName: "Mabini",
    currentStartsOn: "2025-06-02",
  },
  {
    learnerId: "l-elsewhere",
    givenName: "Fe",
    familyName: "Castro",
    lrn: null,
    currentMembershipId: "m-else",
    currentSectionId: "sec-2",
    currentSectionName: "Rizal",
    currentStartsOn: "2025-06-02",
  },
];

const MEMBERS: SectionRosterMember[] = [
  {
    membershipId: "m-bautista",
    learnerId: "l-bautista",
    givenName: "Ana",
    familyName: "Bautista",
    lrn: "123456789012",
    startsOn: "2025-06-02",
  },
  {
    membershipId: "m-cruz",
    learnerId: "l-cruz",
    givenName: "Ben",
    familyName: "Cruz",
    lrn: null,
    startsOn: "2025-08-15",
  },
];

// "Today" is pinned to 2026-08-27 by the `beforeEach` below. Only a member
// whose placement started today is offered the "Correct today's placement"
// action -- a separate fixture so the many pre-existing roster-shape
// assertions above are not disturbed.
const MEMBERS_WITH_TODAY_PLACEMENT: SectionRosterMember[] = [
  ...MEMBERS,
  {
    membershipId: "m-dris",
    learnerId: "l-dris",
    givenName: "Eli",
    familyName: "Dris",
    lrn: null,
    startsOn: "2026-08-27",
  },
];

class FakeSectionRepository implements SectionRepository {
  sections: Section[] = [SECTION, SECTION_B];
  rosterResult: SectionRosterMember[] = MEMBERS;
  listError: Error | null = null;
  rosterError: Error | null = null;
  rosterCalls: Array<{ sectionId: string; asOfDate: string }> = [];
  transferResult: TransferResult = { kind: "membershipNotFound" };
  endResult: EndEnrollmentResult = { kind: "notFound" };
  transferCalls: Array<{
    learnerId: string;
    fromMembershipId: string;
    toSectionId: string;
    effectiveOn: string;
  }> = [];
  endCalls: Array<{ learnerId: string; membershipId: string; effectiveOn: string }> = [];
  transferError: Error | null = null;
  endError: Error | null = null;
  enrollableResult: EnrollmentCandidate[] = [];
  enrollableError: Error | null = null;
  enrollableCalls = 0;
  enrollMembershipResult: EnrollMembershipResult = { kind: "enrolled", membership: MEMBERSHIP };
  enrollMembershipError: Error | null = null;
  enrollMembershipCalls: Array<{ learnerId: string; sectionId: string; startsOn: string }> = [];
  correctResult: CorrectPlacementResult = { kind: "notFound" };
  correctError: Error | null = null;
  correctCalls: Array<{
    learnerId: string;
    membershipId: string;
    toSectionId: string;
    asOfDate: string;
  }> = [];

  async list(): Promise<Section[]> {
    if (this.listError) throw this.listError;
    return this.sections;
  }
  async create(): Promise<Section> {
    throw new Error("not used");
  }
  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used");
  }
  async roster(sectionId: string, asOfDate: string): Promise<SectionRosterMember[]> {
    this.rosterCalls.push({ sectionId, asOfDate });
    if (this.rosterError) throw this.rosterError;
    return this.rosterResult;
  }
  async transferMembership(input: {
    learnerId: string;
    fromMembershipId: string;
    toSectionId: string;
    effectiveOn: string;
  }): Promise<TransferResult> {
    this.transferCalls.push(input);
    if (this.transferError) throw this.transferError;
    return this.transferResult;
  }
  async endMembership(input: {
    learnerId: string;
    membershipId: string;
    effectiveOn: string;
  }): Promise<EndEnrollmentResult> {
    this.endCalls.push(input);
    if (this.endError) throw this.endError;
    return this.endResult;
  }
  async listEnrollableLearners(): Promise<EnrollmentCandidate[]> {
    this.enrollableCalls += 1;
    if (this.enrollableError) throw this.enrollableError;
    return this.enrollableResult;
  }
  async enrollMembership(input: {
    learnerId: string;
    sectionId: string;
    startsOn: string;
  }): Promise<EnrollMembershipResult> {
    this.enrollMembershipCalls.push(input);
    if (this.enrollMembershipError) throw this.enrollMembershipError;
    return this.enrollMembershipResult;
  }
  async correctSameDayPlacement(input: {
    learnerId: string;
    membershipId: string;
    toSectionId: string;
    asOfDate: string;
  }): Promise<CorrectPlacementResult> {
    this.correctCalls.push(input);
    if (this.correctError) throw this.correctError;
    return this.correctResult;
  }
}

class FakeFormGenerationRepository implements FormGenerationRepository {
  sf1Calls: Array<{ sectionId: string; asOfDate: string }> = [];
  sf9Calls: Array<{ sectionId: string; learnerId: string; asOfDate: string }> = [];
  sf1ToReturn: Sf1GenerationResult | null = null;
  sf9ToReturn: Sf9GenerationResult | null = null;
  sf1Error: Error | null = null;
  sf9Error: Error | null = null;

  async generateSf1(sectionId: string, asOfDate: string): Promise<Sf1GenerationResult | null> {
    this.sf1Calls.push({ sectionId, asOfDate });
    if (this.sf1Error) throw this.sf1Error;
    return this.sf1ToReturn;
  }

  async generateSf9(
    sectionId: string,
    learnerId: string,
    asOfDate: string,
  ): Promise<Sf9GenerationResult | null> {
    this.sf9Calls.push({ sectionId, learnerId, asOfDate });
    if (this.sf9Error) throw this.sf9Error;
    return this.sf9ToReturn;
  }
}

class FakeExportRepository implements ExportRepository {
  sf5Calls: Array<{ sectionId: string; schoolYear: string }> = [];
  sf5ToReturn: Sf5ExportResult | null = {
    filePath: "C:\\Documents\\LIKHA-SIS\\SF5_Mabini_2025-2026.csv",
    disclosure: {
      populatedFields: ["School Name", "Section Name", "School Year", "General Average"],
      omittedFields: [
        { field: "School Head Certification Signature", reason: "manual ink signature required" },
      ],
    },
  };
  sf5Error: Error | null = null;

  async exportSectionMonthlySf2(): Promise<Sf2ExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportSectionEosySf5(
    sectionId: string,
    schoolYear: string,
  ): Promise<Sf5ExportResult | null> {
    this.sf5Calls.push({ sectionId, schoolYear });
    if (this.sf5Error) throw this.sf5Error;
    return this.sf5ToReturn;
  }

  async exportSchoolEosySf6(): Promise<Sf6ExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportClassRecordReportCard(): Promise<ReportCardExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("not used in this test");
  }
}

function renderScreen(
  overrides: Partial<FakeSectionRepository> = {},
  sectionId = "sec-1",
  formOverrides: Partial<FakeFormGenerationRepository> = {},
  exportOverrides: Partial<FakeExportRepository> = {},
) {
  const repo = new FakeSectionRepository();
  Object.assign(repo, overrides);
  const service = new SectionApplicationService(repo);
  const formRepo = new FakeFormGenerationRepository();
  Object.assign(formRepo, formOverrides);
  const formGenerationService = new FormGenerationApplicationService(formRepo);
  const exportRepo = new FakeExportRepository();
  Object.assign(exportRepo, exportOverrides);
  const exportService = new ExportApplicationService(exportRepo);
  const onBack = vi.fn();
  const result = render(
    <ModeProvider>
      <SectionRosterScreen
        sectionService={service}
        formGenerationService={formGenerationService}
        exportService={exportService}
        sectionId={sectionId}
        onBack={onBack}
      />
    </ModeProvider>,
  );
  return { ...result, repo, formRepo, exportRepo, onBack };
}

const GUIDED_NOTE = /always your class as it stands today/;

beforeEach(() => {
  window.localStorage.clear();
  // Pin "today" so tests that assert the default effective/start date (and
  // the date input's `max`) do not break when the wall clock rolls over.
  // Individual tests may still call `vi.useFakeTimers`/`setSystemTime`
  // themselves for a different instant.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-27T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SectionRosterScreen", () => {
  it("shows a loading state while the section is resolving", () => {
    renderScreen();
    expect(screen.getByText("Loading section…")).toBeInTheDocument();
  });

  it("renders the roster with each learner, LRN, and a friendly enrolment date, ordered as given", async () => {
    renderScreen();

    expect(await screen.findByText("Mabini — roster")).toBeInTheDocument();
    expect(screen.getByText("Grade 7 · 2025-2026")).toBeInTheDocument();
    expect(screen.getByText("2 learners enrolled")).toBeInTheDocument();

    // header row + 2 data rows
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("rowheader", { name: "Bautista, Ana" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Cruz, Ben" })).toBeInTheDocument();
    expect(screen.getByText("123456789012")).toBeInTheDocument();
    expect(screen.getByText("2 Jun 2025")).toBeInTheDocument();
    expect(screen.getByText("15 Aug 2025")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });

  it("passes today's date as the as-of date to the roster query", async () => {
    // Fake only Date so real setTimeout still drives findBy/waitFor.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-27T09:00:00"));
    try {
      const { repo } = renderScreen();
      await screen.findByText("Mabini — roster");
      expect(repo.rosterCalls).toEqual([{ sectionId: "sec-1", asOfDate: "2026-08-27" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces the roster result to assistive tech via a status region", async () => {
    renderScreen();
    await screen.findByText("2 learners enrolled");
    expect(
      screen.getByText(/2 learners enrolled as of/, { selector: "[role='status']" }),
    ).toBeInTheDocument();
  });

  it("shows a normal, non-error empty state for a section with no current members", async () => {
    renderScreen({ rosterResult: [] });

    expect(await screen.findByText(/No learners are enrolled in Mabini/)).toBeInTheDocument();
    // The empty state points at the "Enroll learner" control, which stays
    // available above the (empty) table.
    expect(screen.getByRole("button", { name: "Enroll learner" })).toBeInTheDocument();
  });

  it("shows a recovery state when the section id no longer resolves", async () => {
    const { onBack } = renderScreen({}, "sec-gone");

    expect(await screen.findByText(/This section could not be found/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Back to sections" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("retries a failed section load", async () => {
    const repo = new FakeSectionRepository();
    repo.listError = new Error("offline");
    const service = new SectionApplicationService(repo);
    const formGenerationService = new FormGenerationApplicationService(
      new FakeFormGenerationRepository(),
    );
    render(
      <ModeProvider>
        <SectionRosterScreen
          sectionService={service}
          formGenerationService={formGenerationService}
          sectionId="sec-1"
          onBack={vi.fn()}
        />
      </ModeProvider>,
    );

    expect(await screen.findByText(/Could not load this section/)).toBeInTheDocument();
    repo.listError = null;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Mabini — roster")).toBeInTheDocument();
  });

  it("shows a retryable error when the roster query fails, without losing other navigation", async () => {
    const { repo } = renderScreen({ rosterError: new Error("db down") });

    expect(
      await screen.findByText(/Could not load the roster for this section/),
    ).toBeInTheDocument();

    // Recover: clear the error, retry.
    repo.rosterError = null;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("2 learners enrolled")).toBeInTheDocument();
  });

  it("returns to sections via the Back link", async () => {
    const { onBack } = renderScreen();
    await screen.findByText("Mabini — roster");
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to sections" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows the purpose line in every mode and the fuller note only in Guided", async () => {
    for (const mode of ["efficient", "comfortable", "guided"] as const) {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const { unmount } = renderScreen();
      expect(await screen.findByText("Bautista, Ana")).toBeInTheDocument();
      expect(screen.getByText(/learners enrolled in this section as of/)).toBeInTheDocument();
      if (mode === "guided") {
        expect(screen.getByText(GUIDED_NOTE)).toBeInTheDocument();
      } else {
        expect(screen.queryByText(GUIDED_NOTE)).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it("associates the Guided note with the table via aria-describedby", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen();
    await screen.findByText("Bautista, Ana");
    expect(screen.getByRole("table")).toHaveAttribute(
      "aria-describedby",
      "section-roster-guided-note",
    );
  });

  it("uses an explicitly-roled semantic table so the narrow layout keeps its structure", async () => {
    renderScreen();
    await screen.findByText("Mabini — roster");

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Learner",
      "LRN",
      "Enrolled since",
      "Actions",
    ]);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
      "Bautista, Ana",
      "Cruz, Ben",
    ]);
    // The narrow (<=640px) layout is CSS-only (data-label + display:block);
    // jsdom does not evaluate @media, so this asserts the hooks it needs,
    // not the rendered mobile layout itself.
    expect(screen.getByText("2 Jun 2025").getAttribute("data-label")).toBe("Enrolled since");
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByRole("heading", { name: /roster/ })).toHaveFocus());
  });

  it("puts the Back link first in tab order so it is reachable by keyboard", async () => {
    renderScreen();
    await screen.findByText("Mabini — roster");
    const user = userEvent.setup();
    // Focus lands on the heading on mount; from the top of the document
    // the first Tab must reach the Back control.
    (document.activeElement as HTMLElement | null)?.blur();
    await user.tab();
    expect(screen.getByRole("button", { name: "Back to sections" })).toHaveFocus();
  });

  // --- Wave 2P: transfer + end enrollment from a roster row ---

  it("transfers a learner to another section and refreshes the roster", async () => {
    const { repo } = renderScreen({
      transferResult: {
        kind: "transferred",
        membership: {
          id: "m-new",
          schoolId: "s1",
          sectionId: "sec-2",
          learnerId: "l-bautista",
          startsOn: "2026-08-27",
          endsOn: null,
          createdAt: "now",
        },
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(await screen.findByText(/Bautista, Ana was transferred to Rizal/)).toBeInTheDocument();
    expect(repo.transferCalls).toEqual([
      {
        learnerId: "l-bautista",
        fromMembershipId: "m-bautista",
        toSectionId: "sec-2",
        effectiveOn: "2026-08-27",
      },
    ]);
    // roster re-fetched after the change (first load + refresh)
    expect(repo.rosterCalls).toHaveLength(2);
    // panel closed
    expect(screen.queryByRole("button", { name: "Confirm transfer" })).not.toBeInTheDocument();
  });

  it("ends a learner's enrollment and refreshes the roster", async () => {
    const { repo } = renderScreen({
      endResult: {
        kind: "ended",
        membership: {
          id: "m-bautista",
          schoolId: "s1",
          sectionId: "sec-1",
          learnerId: "l-bautista",
          startsOn: "2025-06-02",
          endsOn: "2026-08-27",
          createdAt: "now",
        },
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /End enrollment for Bautista, Ana/ }));
    await user.click(screen.getByRole("button", { name: "Confirm end of enrollment" }));

    expect(
      await screen.findByText(/Bautista, Ana's enrollment in Mabini was ended/),
    ).toBeInTheDocument();
    expect(repo.endCalls).toEqual([
      { learnerId: "l-bautista", membershipId: "m-bautista", effectiveOn: "2026-08-27" },
    ]);
    expect(repo.rosterCalls).toHaveLength(2);
  });

  it("cancels an action without calling the repository and restores focus to the trigger", async () => {
    const { repo } = renderScreen();
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    const trigger = screen.getByRole("button", { name: /Transfer Bautista, Ana/ });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Confirm transfer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Confirm transfer" })).not.toBeInTheDocument();
    expect(repo.transferCalls).toEqual([]);
    expect(trigger).toHaveFocus();
  });

  it("only lets one action panel be open at a time", async () => {
    renderScreen();
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));

    // Every other row action is disabled while a panel is open.
    expect(screen.getByRole("button", { name: /End enrollment for Bautista, Ana/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Transfer Cruz, Ben/ })).toBeDisabled();
  });

  it("moves focus into the panel when it opens", async () => {
    renderScreen();
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));

    await waitFor(() =>
      expect(screen.getByText("Transfer Bautista, Ana", { selector: "p" })).toHaveFocus(),
    );
  });

  it("shows a stale-conflict recovery when the membership already changed, then refreshes", async () => {
    const { repo } = renderScreen({ transferResult: { kind: "notCurrent" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(
      await screen.findByText(/enrollment changed since you opened this roster/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh roster" }));

    expect(repo.rosterCalls).toHaveLength(2);
    expect(screen.queryByText(/enrollment changed since you opened/)).not.toBeInTheDocument();
  });

  it("shows an inline, fixable error when the destination is the learner's current section", async () => {
    renderScreen({ transferResult: { kind: "sameSection" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(await screen.findByText(/already in/)).toBeInTheDocument();
    // Panel stays open so the teacher can pick a different section.
    expect(screen.getByRole("button", { name: "Confirm transfer" })).toBeInTheDocument();
  });

  it("explains an effective date that precedes the learner's start date", async () => {
    renderScreen({ transferResult: { kind: "invalidEffectiveDate" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(
      await screen.findByText(/cannot be before this learner joined the section/),
    ).toBeInTheDocument();
  });

  it("points a same-day zero-length transfer at the correction action instead", async () => {
    renderScreen({
      rosterResult: MEMBERS_WITH_TODAY_PLACEMENT,
      transferResult: { kind: "zeroLengthInterval" },
    });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Dris, Eli/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(
      await screen.findByText(/Correct today's placement/, { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("tells the teacher to create another section when there is nowhere to transfer to", async () => {
    renderScreen({ sections: [SECTION] });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));

    expect(screen.getByText(/no other section to move this learner to/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm transfer" })).toBeDisabled();
  });

  it("surfaces a thrown command error inside the panel without losing the entry", async () => {
    renderScreen({ endError: new Error("device offline") });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /End enrollment for Bautista, Ana/ }));
    await user.click(screen.getByRole("button", { name: "Confirm end of enrollment" }));

    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm end of enrollment" })).toBeInTheDocument();
  });

  it("offers the same action controls in every teacher mode", async () => {
    for (const mode of ["efficient", "comfortable", "guided"] as const) {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const { unmount } = renderScreen();
      await screen.findByText("Bautista, Ana");
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
      expect(screen.getByLabelText("Move to section")).toBeInTheDocument();
      expect(screen.getByLabelText("Effective date")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm transfer" })).toBeInTheDocument();
      unmount();
    }
  });

  it("caps the effective date at today so a change cannot be silently future-dated", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-27T09:00:00"));
    try {
      renderScreen();
      await screen.findByText("Bautista, Ana");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));

      const input = screen.getByLabelText("Effective date");
      expect(input).toHaveAttribute("max", "2026-08-27");
      expect(input).toHaveValue("2026-08-27");
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the learner the same way in the panel heading and the success banner", async () => {
    const { repo } = renderScreen({
      endResult: {
        kind: "ended",
        membership: {
          id: "m-bautista",
          schoolId: "s1",
          sectionId: "sec-1",
          learnerId: "l-bautista",
          startsOn: "2025-06-02",
          endsOn: "2026-08-27",
          createdAt: "now",
        },
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /End enrollment for Bautista, Ana/ }));
    // Panel heading uses "Family, Given".
    expect(
      screen.getByText("End Bautista, Ana's enrollment", { selector: "p" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm end of enrollment" }));
    // Success banner uses the same order.
    expect(
      await screen.findByText(/Bautista, Ana's enrollment in Mabini was ended/),
    ).toBeInTheDocument();
    expect(repo.endCalls).toHaveLength(1);
  });

  it("moves focus to the panel heading when a submit outcome is an error", async () => {
    renderScreen({ transferResult: { kind: "invalidEffectiveDate" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    await screen.findByText(/cannot be before this learner joined the section/);
    await waitFor(() =>
      expect(screen.getByText("Transfer Bautista, Ana", { selector: "p" })).toHaveFocus(),
    );
    // The field is marked invalid for assistive tech.
    expect(screen.getByLabelText("Effective date")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the class list visible while it refreshes after a confirmed action", async () => {
    renderScreen({
      endResult: {
        kind: "ended",
        membership: {
          id: "m-bautista",
          schoolId: "s1",
          sectionId: "sec-1",
          learnerId: "l-bautista",
          startsOn: "2025-06-02",
          endsOn: "2026-08-27",
          createdAt: "now",
        },
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /End enrollment for Bautista, Ana/ }));
    await user.click(screen.getByRole("button", { name: "Confirm end of enrollment" }));

    await screen.findByText(/enrollment in Mabini was ended/);
    // The roster table never blanked to a "Loading roster…" placeholder.
    expect(screen.queryByText("Loading roster…")).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Cruz, Ben" })).toBeInTheDocument();
  });

  it("routes a vanished destination section to the same refresh recovery as a stale membership", async () => {
    const { repo } = renderScreen({ transferResult: { kind: "destinationNotFound" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(
      await screen.findByText(/enrollment changed since you opened this roster/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh roster" }));
    expect(repo.rosterCalls).toHaveLength(2);
  });

  // --- Wave 2Q: enroll an existing learner from the roster ---

  it("opens the enroll panel, lists eligible learners, and enrolls one with a refresh", async () => {
    const { repo } = renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    expect(await screen.findByText("Enroll a learner in Mabini")).toBeInTheDocument();
    expect(repo.enrollableCalls).toBe(1);

    await user.selectOptions(screen.getByLabelText("Learner"), "l-free");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    expect(
      await screen.findByText(/Adan, Dina was enrolled in Mabini, effective 27 Aug 2026/),
    ).toBeInTheDocument();
    expect(repo.enrollMembershipCalls).toEqual([
      { learnerId: "l-free", sectionId: "sec-1", startsOn: "2026-08-27" },
    ]);
    // roster re-fetched (first load + refresh) and the panel closed
    expect(repo.rosterCalls).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Confirm enrollment" })).not.toBeInTheDocument();
    // focus returns to the page heading after success
    expect(screen.getByRole("heading", { name: "Mabini — roster" })).toHaveFocus();
  });

  it("filters the eligible-learner list by name or LRN", async () => {
    renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.type(screen.getByLabelText("Find a learner"), "castro");

    const select = screen.getByLabelText("Learner");
    expect(within(select).getByRole("option", { name: /Castro, Fe/ })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: /Adan, Dina/ })).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no learners in the school", async () => {
    renderScreen({ enrollableResult: [] });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    expect(await screen.findByText(/no learners in this school yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm enrollment" })).toBeDisabled();
  });

  it("blocks confirm and explains a transfer is needed for a learner enrolled elsewhere", async () => {
    const { repo } = renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.selectOptions(screen.getByLabelText("Learner"), "l-elsewhere");

    expect(screen.getByText(/Moving them here is a transfer/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm enrollment" })).toBeDisabled();
    expect(repo.enrollMembershipCalls).toHaveLength(0);
  });

  it("blocks confirm for a learner already in this section", async () => {
    renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.selectOptions(screen.getByLabelText("Learner"), "l-here");

    expect(screen.getByText(/already enrolled in this section/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm enrollment" })).toBeDisabled();
  });

  it("surfaces an overlapping-membership outcome as a fixable date error", async () => {
    renderScreen({
      enrollableResult: ENROLLABLE,
      enrollMembershipResult: { kind: "overlappingMembership" },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.selectOptions(screen.getByLabelText("Learner"), "l-free");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/overlaps this start date/i);
    // panel stays open with the entry intact
    expect(screen.getByLabelText("Learner")).toHaveValue("l-free");
  });

  it("names the dependent-record category on a backdated-start conflict", async () => {
    renderScreen({
      enrollableResult: ENROLLABLE,
      enrollMembershipResult: { kind: "dependentRecordConflict", record: "attendance" },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.selectOptions(screen.getByLabelText("Learner"), "l-free");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/attendance records/i);
  });

  it("treats a learnerNotFound outcome as a stale list and refetches candidates", async () => {
    const { repo } = renderScreen({
      enrollableResult: ENROLLABLE,
      enrollMembershipResult: { kind: "learnerNotFound" },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.selectOptions(screen.getByLabelText("Learner"), "l-free");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/out of date/i);
    expect(repo.enrollableCalls).toBe(2);
  });

  it("surfaces a thrown enroll error inside the panel without losing the entry", async () => {
    renderScreen({
      enrollableResult: ENROLLABLE,
      enrollMembershipError: new Error("device offline"),
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.selectOptions(screen.getByLabelText("Learner"), "l-free");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be enrolled/i);
    expect(screen.getByLabelText("Learner")).toHaveValue("l-free");
  });

  it("cancelling the enroll panel restores focus to the Enroll learner button", async () => {
    renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Enroll learner" })).toHaveFocus();
  });

  it("caps the enroll start date at today", async () => {
    renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    const input = screen.getByLabelText("Start date");
    expect(input).toHaveAttribute("max", "2026-08-27");
    expect(input).toHaveValue("2026-08-27");
  });

  it("offers the enroll workflow in every teacher mode", async () => {
    for (const mode of ["efficient", "comfortable", "guided"] as const) {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const { unmount } = renderScreen({ enrollableResult: ENROLLABLE });
      await screen.findByText("Bautista, Ana");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Enroll learner" }));
      expect(screen.getByRole("button", { name: "Confirm enrollment" })).toBeInTheDocument();
      expect(screen.getByLabelText("Learner")).toBeInTheDocument();
      expect(screen.getByLabelText("Start date")).toBeInTheDocument();
      unmount();
    }
  });

  // --- Wave 2S: correct today's placement ---

  it("only offers the correction action for a placement that started today", async () => {
    renderScreen();
    await screen.findByText("Bautista, Ana");

    // Bautista (2025-06-02) and Cruz (2025-08-15) did not start today.
    expect(
      screen.queryByRole("button", { name: /Correct today's placement/ }),
    ).not.toBeInTheDocument();
  });

  it("offers the correction action only for the row that started today", async () => {
    renderScreen({ rosterResult: MEMBERS_WITH_TODAY_PLACEMENT });
    await screen.findByText("Dris, Eli");

    expect(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Correct today's placement for Bautista, Ana/ }),
    ).not.toBeInTheDocument();
  });

  it("corrects a today's placement to another section and refreshes the roster", async () => {
    const { repo } = renderScreen({
      rosterResult: MEMBERS_WITH_TODAY_PLACEMENT,
      correctResult: {
        kind: "corrected",
        membership: {
          id: "m-dris",
          schoolId: "s1",
          sectionId: "sec-2",
          learnerId: "l-dris",
          startsOn: "2026-08-27",
          endsOn: null,
          createdAt: "now",
        },
      },
    });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    );
    // No effective-date field for a correction -- it is always today.
    expect(screen.queryByLabelText("Effective date")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Correct to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));

    expect(
      await screen.findByText(/Dris, Eli's placement today was corrected to Rizal/),
    ).toBeInTheDocument();
    expect(repo.correctCalls).toEqual([
      {
        learnerId: "l-dris",
        membershipId: "m-dris",
        toSectionId: "sec-2",
        asOfDate: "2026-08-27",
      },
    ]);
    expect(repo.rosterCalls).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Confirm correction" })).not.toBeInTheDocument();
  });

  it("shows a stale-conflict recovery when the placement was already corrected, then refreshes", async () => {
    const { repo } = renderScreen({
      rosterResult: MEMBERS_WITH_TODAY_PLACEMENT,
      correctResult: { kind: "alreadyCorrected" },
    });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    );
    await user.selectOptions(screen.getByLabelText("Correct to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));

    expect(
      await screen.findByText(/enrollment changed since you opened this roster/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh roster" }));

    expect(repo.rosterCalls).toHaveLength(2);
  });

  it("treats a not-entered-today outcome as a stale conflict", async () => {
    renderScreen({
      rosterResult: MEMBERS_WITH_TODAY_PLACEMENT,
      correctResult: { kind: "notEnteredToday" },
    });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    );
    await user.selectOptions(screen.getByLabelText("Correct to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));

    expect(
      await screen.findByText(/enrollment changed since you opened this roster/),
    ).toBeInTheDocument();
  });

  it("names the dependent-record category on a correction conflict, without an effective date to change", async () => {
    renderScreen({
      rosterResult: MEMBERS_WITH_TODAY_PLACEMENT,
      correctResult: { kind: "dependentRecordConflict", record: "attendance" },
    });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    );
    await user.selectOptions(screen.getByLabelText("Correct to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));

    expect(await screen.findByText(/attendance records/)).toBeInTheDocument();
    // Panel stays open so the teacher can see the message; there is no
    // later date to pick, unlike a backdated transfer/end conflict.
    expect(screen.getByRole("button", { name: "Confirm correction" })).toBeInTheDocument();
  });

  it("cancelling the correction panel restores focus to its trigger", async () => {
    renderScreen({ rosterResult: MEMBERS_WITH_TODAY_PLACEMENT });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    const trigger = screen.getByRole("button", {
      name: "Correct today's placement for Dris, Eli",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(trigger).toHaveFocus();
  });

  it("moves focus to the correction panel heading when it opens", async () => {
    renderScreen({ rosterResult: MEMBERS_WITH_TODAY_PLACEMENT });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Correct Dris, Eli's placement today", { selector: "p" }),
      ).toHaveFocus(),
    );
  });

  it("offers the correction workflow identically in every teacher mode", async () => {
    for (const mode of ["efficient", "comfortable", "guided"] as const) {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const { unmount } = renderScreen({ rosterResult: MEMBERS_WITH_TODAY_PLACEMENT });
      await screen.findByText("Dris, Eli");
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
      );
      expect(screen.getByLabelText("Correct to section")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm correction" })).toBeInTheDocument();
      unmount();
    }
  });

  it("has no detectable accessibility violations with the correction panel open", async () => {
    const { container } = renderScreen({ rosterResult: MEMBERS_WITH_TODAY_PLACEMENT });
    await screen.findByText("Dris, Eli");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }));
    await screen.findByRole("button", { name: "Confirm correction" });
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations in the correction dependent-record-conflict state", async () => {
    const { container } = renderScreen({
      rosterResult: MEMBERS_WITH_TODAY_PLACEMENT,
      correctResult: { kind: "dependentRecordConflict", record: "grades" },
    });
    await screen.findByText("Dris, Eli");
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }),
    );
    await user.selectOptions(screen.getByLabelText("Correct to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));
    await screen.findByText(/grades/);
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with an open correction panel in Guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    const { container } = renderScreen({ rosterResult: MEMBERS_WITH_TODAY_PLACEMENT });
    await screen.findByText("Dris, Eli");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Correct today's placement for Dris, Eli" }));
    await screen.findByRole("button", { name: "Confirm correction" });
    await expectNoAccessibilityViolations(container);
  });

  // --- Wave 2T: official-form generation (SF1/SF9) ---

  it("shows the synthetic-template fidelity notice whenever the roster is ready", async () => {
    renderScreen();
    await screen.findByText("Bautista, Ana");

    expect(
      screen.getByText(/neither has been verified against an official DepEd source/),
    ).toBeInTheDocument();
  });

  it("generates an SF1 workbook for the whole section", async () => {
    const { formRepo } = renderScreen(undefined, "sec-1", {
      sf1ToReturn: {
        outputPath: "C:\\Documents\\LIKHA-SIS\\SF1_Mabini.xlsx",
        learnerCount: 2,
        templateFormType: "SF1",
        templateVersion: "synthetic-v1",
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Generate SF1 (School Register)" }));

    expect(
      await screen.findByText("C:\\Documents\\LIKHA-SIS\\SF1_Mabini.xlsx"),
    ).toBeInTheDocument();
    expect(screen.getByText(/\(2 learners\)/)).toBeInTheDocument();
    expect(formRepo.sf1Calls).toEqual([{ sectionId: "sec-1", asOfDate: "2026-08-27" }]);
  });

  it("shows a recovery message when SF1 generation reports the section as gone", async () => {
    renderScreen(undefined, "sec-1", { sf1ToReturn: null });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Generate SF1 (School Register)" }));

    expect(await screen.findByText(/could not be found/)).toBeInTheDocument();
  });

  it("surfaces a thrown SF1 generation error without crashing", async () => {
    renderScreen(undefined, "sec-1", { sf1Error: new Error("disk full") });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Generate SF1 (School Register)" }));

    expect(await screen.findByText(/could not be generated/)).toBeInTheDocument();
  });

  it("generates an SF9 report card for one learner", async () => {
    const { formRepo } = renderScreen(undefined, "sec-1", {
      sf9ToReturn: {
        outputPath: "C:\\Documents\\LIKHA-SIS\\SF9_Bautista.xlsx",
        subjectCount: 3,
        templateFormType: "SF9",
        templateVersion: "synthetic-v1",
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Generate SF9 report card for Bautista, Ana" }),
    );

    expect(await screen.findByText(/Report card for Bautista, Ana saved to/)).toBeInTheDocument();
    expect(screen.getByText(/3 subjects/)).toBeInTheDocument();
    expect(formRepo.sf9Calls).toEqual([
      { sectionId: "sec-1", learnerId: "l-bautista", asOfDate: "2026-08-27" },
    ]);
  });

  it("names the learner in an SF9 recovery message when the membership can no longer be confirmed", async () => {
    renderScreen(undefined, "sec-1", { sf9ToReturn: null });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Generate SF9 report card for Bautista, Ana" }),
    );

    expect(
      await screen.findByText(/Could not generate a report card for Bautista, Ana/),
    ).toBeInTheDocument();
  });

  it("generating one learner's SF9 does not disturb another learner's row", async () => {
    renderScreen(undefined, "sec-1", {
      sf9ToReturn: {
        outputPath: "C:\\Documents\\LIKHA-SIS\\SF9_Bautista.xlsx",
        subjectCount: 1,
        templateFormType: "SF9",
        templateVersion: "synthetic-v1",
      },
    });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Generate SF9 report card for Bautista, Ana" }),
    );

    expect(await screen.findByText(/Report card for Bautista, Ana saved to/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate SF9 report card for Cruz, Ben" }),
    ).toBeInTheDocument();
  });

  it("disables every other action while a form is generating, and re-enables after", async () => {
    let resolveSf1: () => void = () => {};
    const pending = new Promise<null>((resolve) => {
      resolveSf1 = () => resolve(null);
    });
    const { formRepo } = renderScreen();
    await screen.findByText("Bautista, Ana");
    formRepo.generateSf1 = () => pending;
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Generate SF1 (School Register)" }));

    expect(screen.getByRole("button", { name: /Transfer Bautista, Ana/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enroll learner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();

    resolveSf1();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Transfer Bautista, Ana/ })).toBeEnabled(),
    );
  });

  it("offers SF1/SF9 generation identically in every teacher mode", async () => {
    for (const mode of ["efficient", "comfortable", "guided"] as const) {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const { unmount } = renderScreen();
      await screen.findByText("Bautista, Ana");
      expect(
        screen.getByRole("button", { name: "Generate SF1 (School Register)" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Generate SF9 report card for Bautista, Ana" }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("has no detectable accessibility violations after generating an SF1 workbook", async () => {
    const { container } = renderScreen(undefined, "sec-1", {
      sf1ToReturn: {
        outputPath: "C:\\Documents\\LIKHA-SIS\\SF1_Mabini.xlsx",
        learnerCount: 2,
        templateFormType: "SF1",
        templateVersion: "synthetic-v1",
      },
    });
    await screen.findByText("Bautista, Ana");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Generate SF1 (School Register)" }));
    await screen.findByText(/Saved to/);
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with the enroll panel open", async () => {
    const { container } = renderScreen({ enrollableResult: ENROLLABLE });
    await screen.findByText("Bautista, Ana");
    await userEvent.setup().click(screen.getByRole("button", { name: "Enroll learner" }));
    await screen.findByText("Enroll a learner in Mabini");
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with an action panel open", async () => {
    const { container } = renderScreen();
    await screen.findByText("Bautista, Ana");
    await userEvent.setup().click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await screen.findByRole("button", { name: "Confirm transfer" });
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations in the inline-error panel state", async () => {
    const { container } = renderScreen({ transferResult: { kind: "sameSection" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));
    await screen.findByText(/already in/);
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations in the stale-conflict panel state", async () => {
    const { container } = renderScreen({ endResult: { kind: "notCurrent" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /End enrollment for Bautista, Ana/ }));
    await user.click(screen.getByRole("button", { name: "Confirm end of enrollment" }));
    await screen.findByText(/enrollment changed since you opened this roster/);
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with an open panel in Guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    const { container } = renderScreen();
    await screen.findByText("Bautista, Ana");
    await userEvent.setup().click(screen.getByRole("button", { name: /Transfer Bautista, Ana/ }));
    await screen.findByRole("button", { name: "Confirm transfer" });
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with a populated roster", async () => {
    const { container } = renderScreen();
    await screen.findByText("Mabini — roster");
    await expectNoAccessibilityViolations(container);
  });

  it("generates an SF5 promotion report and renders output path and disclosures", async () => {
    const { exportRepo } = renderScreen();
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Export SF5 (Promotion & Level of Proficiency)" }),
    );

    expect(exportRepo.sf5Calls).toEqual([{ sectionId: "sec-1", schoolYear: "2025-2026" }]);
    expect(await screen.findByText(/Saved to/)).toBeInTheDocument();
    expect(
      screen.getByText("C:\\Documents\\LIKHA-SIS\\SF5_Mabini_2025-2026.csv"),
    ).toBeInTheDocument();
    expect(screen.getByText("School Head Certification Signature")).toBeInTheDocument();
  });

  it("displays an error alert when SF5 export fails", async () => {
    const { exportRepo } = renderScreen();
    await screen.findByText("Bautista, Ana");
    exportRepo.sf5Error = new Error("unauthorized");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Export SF5 (Promotion & Level of Proficiency)" }),
    );

    expect(
      await screen.findByText(
        /Could not export SF5 — you may not have permission to export this section/,
      ),
    ).toBeInTheDocument();
  });

  it("displays an error alert when section is not found for SF5 export", async () => {
    const { exportRepo } = renderScreen();
    await screen.findByText("Bautista, Ana");
    exportRepo.sf5ToReturn = null;
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Export SF5 (Promotion & Level of Proficiency)" }),
    );

    expect(await screen.findByText(/This section could not be found/)).toBeInTheDocument();
  });

  it("disables other actions while SF5 is exporting, and re-enables after", async () => {
    let resolveSf5: (val: Sf5ExportResult | null) => void = () => {};
    const pending = new Promise<Sf5ExportResult | null>((resolve) => {
      resolveSf5 = resolve;
    });
    const { exportRepo } = renderScreen();
    await screen.findByText("Bautista, Ana");
    exportRepo.exportSectionEosySf5 = () => pending;
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Export SF5 (Promotion & Level of Proficiency)" }),
    );

    expect(screen.getByRole("button", { name: /Transfer Bautista, Ana/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enroll learner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exporting SF5…" })).toBeDisabled();

    resolveSf5(exportRepo.sf5ToReturn);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Transfer Bautista, Ana/ })).toBeEnabled(),
    );
  });

  it("shows Guided mode hint for SF5 promotion report", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen();
    await screen.findByText("Bautista, Ana");

    expect(
      screen.getByText(
        /SF5 \(Report on Promotion and Level of Proficiency\) computes final subject ratings/,
      ),
    ).toBeInTheDocument();
  });

  it("has no detectable accessibility violations after exporting an SF5 report", async () => {
    const { container } = renderScreen();
    await screen.findByText("Bautista, Ana");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Export SF5 (Promotion & Level of Proficiency)" }));
    await screen.findByText(/Saved to/);
    await expectNoAccessibilityViolations(container);
  });
});
