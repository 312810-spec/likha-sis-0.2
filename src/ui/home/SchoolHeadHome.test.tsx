import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearnerApplicationService } from "../../application/learner-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { Sf1ImportApplicationService } from "../../application/sf1-import-service";
import type { Section } from "../../domain/section";
import type { Sf1ImportHistoryEntry } from "../../domain/sf1-import";
import { expectNoAccessibilityViolations } from "../../test/a11y";
import { SchoolHeadHome } from "./SchoolHeadHome";

function makeSection(id: string, schoolYear: string): Section {
  return {
    id,
    schoolId: "school-1",
    schoolYear,
    gradeLevel: "7",
    name: `Section ${id}`,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeHistory(overrides: Partial<Sf1ImportHistoryEntry> = {}): Sf1ImportHistoryEntry {
  return {
    id: "import-1",
    schoolId: "school-1",
    sectionId: "section-a",
    userId: "user-1",
    username: "teacher1",
    sourceFilename: "SF1-Mabini.xlsx",
    sourceFingerprint: "fingerprint",
    rowsCommitted: 30,
    newLearnersCreated: 20,
    existingLearnersEnrolled: 10,
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

interface RenderOptions {
  sections?: Section[];
  learnerCount?: number;
  history?: Sf1ImportHistoryEntry[];
}

function renderHome(
  options: RenderOptions = {},
  callbacks: { onManageSections?: () => void; onOpenSf1Import?: () => void } = {},
) {
  const sections = options.sections ?? [
    makeSection("a", "2026-2027"),
    makeSection("b", "2026-2027"),
    makeSection("c", "2026-2027"),
  ];
  const learners = Array.from({ length: options.learnerCount ?? 40 }, (_, index) => ({
    id: `learner-${index}`,
  }));
  const history = options.history ?? [];

  const sectionService = {
    listSections: vi.fn(() => Promise.resolve(sections)),
  } as unknown as SectionApplicationService;
  const learnerService = {
    listLearners: vi.fn(() => Promise.resolve(learners)),
  } as unknown as LearnerApplicationService;
  const sf1ImportService = {
    listImportHistory: vi.fn(() => Promise.resolve(history)),
  } as unknown as Sf1ImportApplicationService;

  const onManageSections = callbacks.onManageSections ?? vi.fn();
  const onOpenSf1Import = callbacks.onOpenSf1Import ?? vi.fn();

  const utils = render(
    <SchoolHeadHome
      schoolName="Mabini Elementary School"
      sectionService={sectionService}
      learnerService={learnerService}
      sf1ImportService={sf1ImportService}
      onManageSections={onManageSections}
      onOpenSf1Import={onOpenSf1Import}
    />,
  );

  return { ...utils, onManageSections, onOpenSf1Import };
}

describe("SchoolHeadHome", () => {
  it("shows Loading first, then the section and learner counts", async () => {
    renderHome();

    expect(screen.getByText("Loading school overview…")).toBeInTheDocument();

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.getByText("Learners")).toBeInTheDocument();
  });

  it("shows the shared school year when every section matches", async () => {
    renderHome();

    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
  });

  it("shows an em dash for school year when sections disagree", async () => {
    renderHome({
      sections: [makeSection("a", "2026-2027"), makeSection("b", "2025-2026")],
    });

    await screen.findByText("Sections");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em dash for school year when there are no sections", async () => {
    renderHome({ sections: [] });

    await screen.findByText("Sections");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders both card titles", async () => {
    renderHome();

    expect(await screen.findByText("Recent SF1 imports")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
  });

  it("wires the navigation buttons to their callbacks", async () => {
    const user = userEvent.setup();
    const onManageSections = vi.fn();
    const onOpenSf1Import = vi.fn();
    renderHome({}, { onManageSections, onOpenSf1Import });

    await screen.findByText("Manage");

    await user.click(screen.getByRole("button", { name: "Manage sections" }));
    expect(onManageSections).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "SF1 import" }));
    expect(onOpenSf1Import).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state when there are no imports", async () => {
    renderHome({ history: [] });

    expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
  });

  it("lists recent import filenames when history exists", async () => {
    renderHome({
      history: [makeHistory({ id: "import-9", sourceFilename: "SF1-Rizal.xlsx" })],
    });

    expect(await screen.findByText(/SF1-Rizal\.xlsx/)).toBeInTheDocument();
  });

  it("shows an error with a working Retry after a failed load", async () => {
    const user = userEvent.setup();
    const listSections = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([makeSection("a", "2026-2027")]);
    const sectionService = { listSections } as unknown as SectionApplicationService;
    const learnerService = {
      listLearners: vi.fn().mockResolvedValue([]),
    } as unknown as LearnerApplicationService;
    const sf1ImportService = {
      listImportHistory: vi.fn().mockResolvedValue([]),
    } as unknown as Sf1ImportApplicationService;

    render(
      <SchoolHeadHome
        schoolName="Mabini Elementary School"
        sectionService={sectionService}
        learnerService={learnerService}
        sf1ImportService={sf1ImportService}
        onManageSections={vi.fn()}
        onOpenSf1Import={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the school overview.",
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations once loaded", async () => {
    const { container } = renderHome({ history: [makeHistory()] });
    await screen.findByText("Recent SF1 imports");

    await expectNoAccessibilityViolations(container);
  });
});
