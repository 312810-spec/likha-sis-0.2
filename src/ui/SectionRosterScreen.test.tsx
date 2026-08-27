import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionApplicationService } from "../application/section-service";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
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

const MEMBERS: SectionRosterMember[] = [
  {
    learnerId: "l-bautista",
    givenName: "Ana",
    familyName: "Bautista",
    lrn: "123456789012",
    startsOn: "2025-06-02",
  },
  {
    learnerId: "l-cruz",
    givenName: "Ben",
    familyName: "Cruz",
    lrn: null,
    startsOn: "2025-08-15",
  },
];

class FakeSectionRepository implements SectionRepository {
  sections: Section[] = [SECTION];
  rosterResult: SectionRosterMember[] = MEMBERS;
  listError: Error | null = null;
  rosterError: Error | null = null;
  rosterCalls: Array<{ sectionId: string; asOfDate: string }> = [];

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
