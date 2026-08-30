import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import { LearnerApplicationService } from "../application/learner-service";
import { LearnerPhotoApplicationService } from "../application/learner-photo-service";
import { SectionApplicationService } from "../application/section-service";
import type { LearnerRosterExportResult } from "../domain/export";
import type { Learner } from "../domain/learner";
import type { LearnerPhoto } from "../domain/learner-photo";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { LearnerPhotoRepository } from "../domain/ports/learner-photo-repository";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type {
  LearnerEnrollmentHistoryEntry,
  Section,
  SectionMembership,
  SectionRosterMember,
} from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LearnerListScreen } from "./LearnerListScreen";

class FakeLearnerRepository implements LearnerRepository {
  createCalls: Array<{ givenName: string; familyName: string; lrn?: string; sex?: "M" | "F" }> = [];

  constructor(public learners: Learner[] = []) {}

  async list(): Promise<Learner[]> {
    return [...this.learners];
  }

  async create(
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner> {
    this.createCalls.push({ givenName, familyName, lrn, sex });
    const learner: Learner = {
      id: `l${this.learners.length + 1}`,
      schoolId: "s1",
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
      createdAt: "now",
    };
    this.learners.push(learner);
    return learner;
  }

  async updateProfile(
    learnerId: string,
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner | null> {
    const existing = this.learners.find((l) => l.id === learnerId);
    if (!existing) return null;
    existing.givenName = givenName;
    existing.familyName = familyName;
    existing.lrn = lrn ?? null;
    existing.sex = sex ?? null;
    return existing;
  }
}

class FakeExportRepository implements ExportRepository {
  exportLearnerRosterCalls = 0;
  resultToReturn: LearnerRosterExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\LearnerRoster_Rizal_Elementary.csv",
    disclosure: {
      populatedFields: [],
      omittedFields: [{ field: "Birthdate", reason: "not collected" }],
    },
  };

  async exportSectionMonthlySf2(): Promise<import("../domain/export").Sf2ExportResult | null> {
    throw new Error("not used in this test");
  }
  async exportClassRecordReportCard(): Promise<
    import("../domain/export").ReportCardExportResult | null
  > {
    throw new Error("not used in this test");
  }
  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    this.exportLearnerRosterCalls += 1;
    return this.resultToReturn;
  }
}

class FakeLearnerPhotoRepository implements LearnerPhotoRepository {
  photo: LearnerPhoto | null = null;

  async get(): Promise<LearnerPhoto | null> {
    return this.photo;
  }

  async set(): Promise<boolean> {
    return true;
  }

  async clear(): Promise<boolean> {
    return true;
  }
}

class FakeSectionRepository implements SectionRepository {
  historyToReturn: LearnerEnrollmentHistoryEntry[] | null = [];

  async list(): Promise<Section[]> {
    return [];
  }
  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }
  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }
  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
  async learnerEnrollmentHistory(): Promise<LearnerEnrollmentHistoryEntry[] | null> {
    return this.historyToReturn;
  }
}

function renderScreen(learners: Learner[] = []) {
  const repo = new FakeLearnerRepository(learners);
  const exportRepo = new FakeExportRepository();
  const photoRepo = new FakeLearnerPhotoRepository();
  const sectionRepo = new FakeSectionRepository();
  const result = render(
    <ModeProvider>
      <LearnerListScreen
        learnerService={new LearnerApplicationService(repo)}
        exportService={new ExportApplicationService(exportRepo)}
        learnerPhotoService={new LearnerPhotoApplicationService(photoRepo)}
        sectionService={new SectionApplicationService(sectionRepo)}
      />
    </ModeProvider>,
  );
  return { ...result, repo, exportRepo, photoRepo, sectionRepo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LearnerListScreen", () => {
  it("shows an empty state when there are no learners yet", async () => {
    renderScreen([]);

    expect(await screen.findByText("No learners enrolled yet.")).toBeInTheDocument();
  });

  it("lists existing learners", async () => {
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);

    expect(await screen.findByText("Ana Santos")).toBeInTheDocument();
  });

  it("filters the list by name as the search box is typed", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
      {
        id: "l2",
        schoolId: "s1",
        givenName: "Ben",
        familyName: "Reyes",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.type(screen.getByLabelText("Search learners"), "ben");

    expect(screen.getByText("Ben Reyes")).toBeInTheDocument();
    expect(screen.queryByText("Ana Santos")).not.toBeInTheDocument();
  });

  it("does not show the export button when there are no learners yet", async () => {
    renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    expect(
      screen.queryByRole("button", { name: "Export learner list (CSV)" }),
    ).not.toBeInTheDocument();
  });

  it("exports the learner roster and shows where it was saved", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Export learner list (CSV)" }));

    expect(exportRepo.exportLearnerRosterCalls).toBe(1);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "LearnerRoster_Rizal_Elementary.csv",
    );
    expect(screen.getByText("Birthdate")).toBeInTheDocument();
  });

  it("shows an error banner when the export fails to resolve a school", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    exportRepo.resultToReturn = null;
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Export learner list (CSV)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be found/i);
  });

  it("matches a search query against LRN as well as name", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: "123456789012",
        sex: null,
        createdAt: "now",
      },
      {
        id: "l2",
        schoolId: "s1",
        givenName: "Ben",
        familyName: "Reyes",
        lrn: "999999999999",
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.type(screen.getByLabelText("Search learners"), "123456789012");

    expect(screen.getByText("Ana Santos")).toBeInTheDocument();
    expect(screen.queryByText("Ben Reyes")).not.toBeInTheDocument();
  });

  it("shows a no-matches message distinct from the no-learners-yet message", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.type(screen.getByLabelText("Search learners"), "nonexistent");

    expect(screen.getByText(/no learners match/i)).toBeInTheDocument();
    expect(screen.queryByText("No learners enrolled yet.")).not.toBeInTheDocument();
  });

  it("search is case-insensitive", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.type(screen.getByLabelText("Search learners"), "SANTOS");

    expect(screen.getByText("Ana Santos")).toBeInTheDocument();
  });

  it("does not show a search box when there are no learners yet", async () => {
    renderScreen([]);

    await screen.findByText("No learners enrolled yet.");

    expect(screen.queryByLabelText("Search learners")).not.toBeInTheDocument();
  });

  it("disables the search box while an edit is in progress", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));

    expect(screen.getByLabelText("Search learners")).toBeDisabled();
  });

  it("edits an existing learner's LRN and Sex without a fresh enrollment", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));
    const editForm = screen.getByRole("form", { name: "Edit Ana Santos" });
    await user.type(within(editForm).getByLabelText("LRN (optional)"), "123456789012");
    await user.selectOptions(within(editForm).getByLabelText("Sex (optional)"), "F");
    await user.click(within(editForm).getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/— LRN 123456789012/)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ana Santos's profile was updated.",
    );
    expect(repo.learners[0]).toMatchObject({ lrn: "123456789012", sex: "F" });
  });

  it("cancel discards edits and leaves the learner unchanged", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));
    const editForm = screen.getByRole("form", { name: "Edit Ana Santos" });
    await user.type(within(editForm).getByLabelText("LRN (optional)"), "123456789012");
    await user.click(within(editForm).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form", { name: "Edit Ana Santos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/— LRN/)).not.toBeInTheDocument();
  });

  it("moves focus into the edit form when editing starts", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));

    const editForm = screen.getByRole("form", { name: "Edit Ana Santos" });
    await waitFor(() => expect(within(editForm).getByLabelText("Given name")).toHaveFocus());
  });

  it("disables editing another learner while one edit is already in progress", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
      {
        id: "l2",
        schoolId: "s1",
        givenName: "Ben",
        familyName: "Reyes",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));

    expect(screen.getByRole("button", { name: "Edit Ben Reyes" })).toBeDisabled();
  });

  it("enrolls a learner, adds them to the visible list, and confirms it", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    await user.type(screen.getByLabelText("Given name"), "Ben");
    await user.type(screen.getByLabelText("Family name"), "Reyes");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    expect(await screen.findByText("Ben Reyes")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Ben Reyes was enrolled.");
    expect(repo.createCalls).toEqual([
      { givenName: "Ben", familyName: "Reyes", lrn: undefined, sex: undefined },
    ]);
  });

  it("shows a validation message and does not call the repository for an empty name", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    await user.type(screen.getByLabelText("Given name"), "   ");
    await user.type(screen.getByLabelText("Family name"), "Reyes");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/given name must not be empty/i);
    expect(repo.createCalls).toEqual([]);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen([]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Learners" })).toHaveFocus());
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    expect(screen.getByText(/full legal given and family names/i)).toBeInTheDocument();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    expect(screen.queryByText(/full legal given and family names/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await waitFor(() => screen.getByText("Ana Santos"));

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while editing a learner", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));
    await screen.findByRole("form", { name: "Edit Ana Santos" });

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with enrollment history expanded", async () => {
    const user = userEvent.setup();
    const { container, sectionRepo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    sectionRepo.historyToReturn = [
      {
        membershipId: "mem-1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        schoolYear: "2025-2026",
        gradeLevel: "7",
        startsOn: "2025-08-01",
        endsOn: null,
      },
    ];
    await screen.findByText("Ana Santos");

    await user.click(
      screen.getByRole("button", { name: "Show enrollment history for Ana Santos" }),
    );
    await screen.findByText(/Mabini \(Grade 7, 2025-2026\)/);

    await expectNoAccessibilityViolations(container);
  });

  it("shows a learner's enrollment history when toggled", async () => {
    const user = userEvent.setup();
    const { sectionRepo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    sectionRepo.historyToReturn = [
      {
        membershipId: "mem-1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        schoolYear: "2025-2026",
        gradeLevel: "7",
        startsOn: "2025-08-01",
        endsOn: null,
      },
    ];
    await screen.findByText("Ana Santos");

    await user.click(
      screen.getByRole("button", { name: "Show enrollment history for Ana Santos" }),
    );

    expect(await screen.findByText(/Mabini \(Grade 7, 2025-2026\)/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Hide enrollment history for Ana Santos" }),
    );

    expect(screen.queryByText(/Mabini \(Grade 7, 2025-2026\)/)).not.toBeInTheDocument();
  });

  it("shows a no-history message for a learner with no enrollment history yet", async () => {
    const user = userEvent.setup();
    const { sectionRepo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    sectionRepo.historyToReturn = [];
    await screen.findByText("Ana Santos");

    await user.click(
      screen.getByRole("button", { name: "Show enrollment history for Ana Santos" }),
    );

    expect(await screen.findByText("No enrollment history yet.")).toBeInTheDocument();
  });
});
