import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionApplicationService } from "../application/section-service";
import type { SectionRepository } from "../domain/ports/section-repository";
import type {
  EndEnrollmentResult,
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
}

function renderScreen(overrides: Partial<FakeSectionRepository> = {}, sectionId = "sec-1") {
  const repo = new FakeSectionRepository();
  Object.assign(repo, overrides);
  const service = new SectionApplicationService(repo);
  const onBack = vi.fn();
  const result = render(
    <ModeProvider>
      <SectionRosterScreen sectionService={service} sectionId={sectionId} onBack={onBack} />
    </ModeProvider>,
  );
  return { ...result, repo, onBack };
}

const GUIDED_NOTE = /always your class as it stands today/;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
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
    const { onBack } = renderScreen({ rosterResult: [] });

    expect(await screen.findByText(/No learners are enrolled in Mabini/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Go to Sections to enroll a learner/ }));
    expect(onBack).toHaveBeenCalled();
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
    render(
      <ModeProvider>
        <SectionRosterScreen sectionService={service} sectionId="sec-1" onBack={vi.fn()} />
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

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));
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

    await user.click(screen.getByRole("button", { name: /End enrollment for Ana Bautista/ }));
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

    const trigger = screen.getByRole("button", { name: /Transfer Ana Bautista/ });
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

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));

    // Every other row action is disabled while a panel is open.
    expect(screen.getByRole("button", { name: /End enrollment for Ana Bautista/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Transfer Ben Cruz/ })).toBeDisabled();
  });

  it("moves focus into the panel when it opens", async () => {
    renderScreen();
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));

    await waitFor(() =>
      expect(screen.getByText("Transfer Ana Bautista", { selector: "p" })).toHaveFocus(),
    );
  });

  it("shows a stale-conflict recovery when the membership already changed, then refreshes", async () => {
    const { repo } = renderScreen({ transferResult: { kind: "notCurrent" } });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));
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

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));
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

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));
    await user.selectOptions(screen.getByLabelText("Move to section"), "sec-2");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));

    expect(
      await screen.findByText(/cannot be before this learner joined the section/),
    ).toBeInTheDocument();
  });

  it("tells the teacher to create another section when there is nowhere to transfer to", async () => {
    renderScreen({ sections: [SECTION] });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));

    expect(screen.getByText(/no other section to move this learner to/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm transfer" })).toBeDisabled();
  });

  it("surfaces a thrown command error inside the panel without losing the entry", async () => {
    renderScreen({ endError: new Error("device offline") });
    await screen.findByText("Bautista, Ana");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /End enrollment for Ana Bautista/ }));
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

      await user.click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));
      expect(screen.getByLabelText("Move to section")).toBeInTheDocument();
      expect(screen.getByLabelText("Effective date")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm transfer" })).toBeInTheDocument();
      unmount();
    }
  });

  it("has no detectable accessibility violations with an action panel open", async () => {
    const { container } = renderScreen();
    await screen.findByText("Bautista, Ana");
    await userEvent.setup().click(screen.getByRole("button", { name: /Transfer Ana Bautista/ }));
    await screen.findByRole("button", { name: "Confirm transfer" });
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with a populated roster", async () => {
    const { container } = renderScreen();
    await screen.findByText("Mabini — roster");
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations in the empty state", async () => {
    const { container } = renderScreen({ rosterResult: [] });
    await screen.findByText(/No learners are enrolled in Mabini/);
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations in the section-not-found state", async () => {
    const { container } = renderScreen({}, "sec-gone");
    await screen.findByText(/This section could not be found/);
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations in the roster-error state", async () => {
    const { container } = renderScreen({ rosterError: new Error("db down") });
    await screen.findByText(/Could not load the roster/);
    await expectNoAccessibilityViolations(container);
  });
});
