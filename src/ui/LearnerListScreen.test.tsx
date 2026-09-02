import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import { EnrollmentHistoryApplicationService } from "../application/enrollment-history-service";
import { LearnerApplicationService } from "../application/learner-service";
import type { LearnerRosterExportResult } from "../domain/export";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import type { EnrollmentHistoryRepository } from "../domain/ports/enrollment-history-repository";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { Section, SectionMembership } from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LearnerListScreen } from "./LearnerListScreen";

/** Mirrors `learner::create_with_duplicate_check`'s real semantics
 * (exact LRN match -> hard, non-overridable conflict; any other
 * name/LRN overlap -> a review-required warning, overridable via
 * `confirmed`) against this fake's own in-memory `learners`, so UI
 * tests exercise the same three-way branch the real backend produces
 * rather than a repository double that always succeeds. */
class FakeLearnerRepository implements LearnerRepository {
  createCalls: Array<{ givenName: string; familyName: string; lrn?: string; sex?: "M" | "F" }> = [];
  createWithDuplicateCheckCalls: Array<{
    givenName: string;
    familyName: string;
    lrn?: string;
    sex?: "M" | "F";
    confirmed: boolean;
  }> = [];

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

  async createWithDuplicateCheck(
    givenName: string,
    familyName: string,
    lrn: string | undefined,
    sex: "M" | "F" | undefined,
    confirmed = false,
  ): Promise<CreateLearnerResult> {
    this.createWithDuplicateCheckCalls.push({ givenName, familyName, lrn, sex, confirmed });
    const trimmedGiven = givenName.trim().toLowerCase();
    const trimmedFamily = familyName.trim().toLowerCase();
    const candidates = this.learners.filter(
      (candidate) =>
        (lrn !== undefined && candidate.lrn === lrn) ||
        (candidate.givenName.trim().toLowerCase() === trimmedGiven &&
          candidate.familyName.trim().toLowerCase() === trimmedFamily),
    );
    if (lrn !== undefined) {
      const exact = candidates.find((candidate) => candidate.lrn === lrn);
      if (exact) {
        return { kind: "lrnConflict", existing: exact };
      }
    }
    if (candidates.length > 0 && !confirmed) {
      return { kind: "duplicateCandidates", candidates };
    }
    const learner = await this.create(givenName, familyName, lrn, sex);
    return { kind: "created", learner };
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
  async exportSchoolMonthlyAttendanceSf4(): Promise<
    import("../domain/export").Sf4ExportResult | null
  > {
    throw new Error("not used in this test");
  }
  async exportSectionEosySf5(): Promise<import("../domain/export").Sf5ExportResult | null> {
    throw new Error("not used in this test");
  }
  async exportSchoolEosySf6(): Promise<import("../domain/export").Sf6ExportResult | null> {
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

  revealCalls: string[] = [];
  revealShouldThrow = false;

  async revealExportedFile(filePath: string): Promise<void> {
    this.revealCalls.push(filePath);
    if (this.revealShouldThrow) throw new Error("could not open folder");
  }
}

class FakeEnrollmentHistoryRepository implements EnrollmentHistoryRepository {
  calls: string[] = [];
  failuresRemaining = 0;

  constructor(public entries: SectionMembership[] = []) {}

  async listByLearner(learnerId: string): Promise<SectionMembership[]> {
    this.calls.push(learnerId);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("offline");
    }
    return this.entries.filter((entry) => entry.learnerId === learnerId);
  }
}

const HISTORY_SECTIONS: Section[] = [
  {
    id: "sec-1",
    schoolId: "s1",
    schoolYear: "2025-2026",
    gradeLevel: "6",
    name: "Mabini",
    createdAt: "now",
  },
  {
    id: "sec-2",
    schoolId: "s1",
    schoolYear: "2026-2027",
    gradeLevel: "7",
    name: "Rizal",
    createdAt: "now",
  },
];

function renderScreen(learners: Learner[] = [], historyEntries: SectionMembership[] = []) {
  const repo = new FakeLearnerRepository(learners);
  const exportRepo = new FakeExportRepository();
  const historyRepo = new FakeEnrollmentHistoryRepository(historyEntries);
  const result = render(
    <ModeProvider>
      <LearnerListScreen
        learnerService={new LearnerApplicationService(repo)}
        exportService={new ExportApplicationService(exportRepo)}
        enrollmentHistoryService={
          new EnrollmentHistoryApplicationService(historyRepo, {
            list: async () => HISTORY_SECTIONS,
          })
        }
      />
    </ModeProvider>,
  );
  return { ...result, repo, exportRepo, historyRepo };
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

  it("opens the folder for the exported roster file when Open folder is clicked", async () => {
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
    await screen.findByRole("status");

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() =>
      expect(exportRepo.revealCalls).toEqual([
        "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\LearnerRoster_Rizal_Elementary.csv",
      ]),
    );
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

  it("shows retained past and current section placements in oldest-first order", async () => {
    const user = userEvent.setup();
    renderScreen(
      [
        {
          id: "l1",
          schoolId: "s1",
          givenName: "Ana",
          familyName: "Santos",
          lrn: null,
          sex: null,
          createdAt: "now",
        },
      ],
      [
        {
          id: "mem-1",
          schoolId: "s1",
          sectionId: "sec-1",
          learnerId: "l1",
          startsOn: "2025-06-02",
          endsOn: "2026-04-01",
          createdAt: "now",
        },
        {
          id: "mem-2",
          schoolId: "s1",
          sectionId: "sec-2",
          learnerId: "l1",
          startsOn: "2026-06-01",
          endsOn: null,
          createdAt: "now",
        },
      ],
    );
    await screen.findByText("Ana Santos");

    await user.click(
      screen.getByRole("button", { name: "View enrollment history for Ana Santos" }),
    );

    const history = await screen.findByRole("region", {
      name: "Enrollment history for Ana Santos",
    });
    expect(within(history).getByText(/Mabini · Grade 6/)).toBeInTheDocument();
    expect(within(history).getByText("School year 2025-2026")).toBeInTheDocument();
    expect(within(history).getByText("Started 2 Jun 2025 · Ended 1 Apr 2026")).toBeInTheDocument();
    expect(within(history).getByText(/Rizal · Grade 7/)).toBeInTheDocument();
    expect(within(history).getByText("Started 1 Jun 2026 · Current placement")).toBeInTheDocument();
  });

  it("shows a distinct empty history state", async () => {
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

    await user.click(
      screen.getByRole("button", { name: "View enrollment history for Ana Santos" }),
    );

    expect(
      await screen.findByText("No section placements have been recorded for this learner."),
    ).toBeInTheDocument();
  });

  it("offers a working retry when history loading fails", async () => {
    const user = userEvent.setup();
    const { historyRepo } = renderScreen([
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
    historyRepo.failuresRemaining = 1;
    await screen.findByText("Ana Santos");

    await user.click(
      screen.getByRole("button", { name: "View enrollment history for Ana Santos" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText("No section placements have been recorded for this learner."),
    ).toBeInTheDocument();
    expect(historyRepo.calls).toEqual(["l1", "l1"]);
  });

  it("shows the read-only history explanation only in Guided mode", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
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

    await user.click(
      screen.getByRole("button", { name: "View enrollment history for Ana Santos" }),
    );

    expect(
      await screen.findByText(/read-only record shows each section placement/i),
    ).toBeInTheDocument();
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

  it("warns about a duplicate candidate instead of creating immediately, and lets the teacher confirm creating a separate learner", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Grace",
        familyName: "Torres",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Grace Torres");

    await user.type(screen.getByLabelText("Given name"), "Grace");
    await user.type(screen.getByLabelText("Family name"), "Torres");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    const warning = await screen.findByRole("alert", { name: "Possible duplicate learner" });
    expect(warning).toHaveTextContent("Grace Torres");
    expect(warning).toHaveFocus();
    // Nothing was created yet, and the typed values are preserved.
    expect(repo.learners).toHaveLength(1);
    expect(screen.getByLabelText("Given name")).toHaveValue("Grace");
    expect(screen.getByLabelText("Family name")).toHaveValue("Torres");
    expect(screen.queryByRole("button", { name: "Enroll learner" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create separate learner" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Grace Torres was enrolled.");
    expect(repo.learners).toHaveLength(2);
    expect(
      screen.queryByRole("alert", { name: "Possible duplicate learner" }),
    ).not.toBeInTheDocument();
    // The form is cleared again after a successful confirmed create.
    expect(screen.getByLabelText("Given name")).toHaveValue("");
  });

  it("lets the teacher cancel a duplicate warning and keeps the form values to edit", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Grace",
        familyName: "Torres",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Grace Torres");

    await user.type(screen.getByLabelText("Given name"), "Grace");
    await user.type(screen.getByLabelText("Family name"), "Torres");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await screen.findByRole("alert", { name: "Possible duplicate learner" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("alert", { name: "Possible duplicate learner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Given name")).toHaveValue("Grace");
    expect(screen.getByRole("button", { name: "Enroll learner" })).toBeInTheDocument();
    expect(repo.learners).toHaveLength(1);
  });

  it("blocks an exact LRN conflict even after the teacher tries to confirm, and never creates a second record", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Grace",
        familyName: "Torres",
        lrn: "123456789012",
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Grace Torres");

    await user.type(screen.getByLabelText("Given name"), "Different");
    await user.type(screen.getByLabelText("Family name"), "Person");
    await user.type(screen.getByLabelText("LRN (optional)"), "123456789012");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    const conflict = await screen.findByRole("alert", { name: "LRN already in use" });
    expect(conflict).toHaveTextContent("Grace Torres");
    expect(conflict).toHaveFocus();
    // There is no "confirm anyway" affordance for a hard conflict.
    expect(
      screen.queryByRole("button", { name: "Create separate learner" }),
    ).not.toBeInTheDocument();
    expect(repo.learners).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Edit the form" }));

    expect(screen.queryByRole("alert", { name: "LRN already in use" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("LRN (optional)")).toHaveValue("123456789012");
  });

  it("re-checks at confirm time and still blocks a conflict that appeared after the warning was shown", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Grace",
        familyName: "Torres",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Grace Torres");

    await user.type(screen.getByLabelText("Given name"), "Grace");
    await user.type(screen.getByLabelText("Family name"), "Torres");
    await user.type(screen.getByLabelText("LRN (optional)"), "999999999999");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await screen.findByRole("alert", { name: "Possible duplicate learner" });

    // Simulates another write landing between the warning and the
    // teacher's confirmation -- someone else just claimed this LRN.
    repo.learners.push({
      id: "l2",
      schoolId: "s1",
      givenName: "Someone",
      familyName: "Else",
      lrn: "999999999999",
      sex: null,
      createdAt: "now",
    });

    await user.click(screen.getByRole("button", { name: "Create separate learner" }));

    expect(await screen.findByRole("alert", { name: "LRN already in use" })).toBeInTheDocument();
    // the stale duplicate warning must not create a learner
    expect(repo.learners).toHaveLength(2);
  });

  it("preserves the entered values and allows a clear retry when the duplicate check itself fails", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([]);
    await screen.findByText("No learners enrolled yet.");
    const originalCheck = repo.createWithDuplicateCheck.bind(repo);
    let calls = 0;
    repo.createWithDuplicateCheck = (...args) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("network error"));
      return originalCheck(...args);
    };

    await user.type(screen.getByLabelText("Given name"), "Ben");
    await user.type(screen.getByLabelText("Family name"), "Reyes");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not enroll this learner.");
    expect(repo.learners).toHaveLength(0);
    expect(screen.getByLabelText("Given name")).toHaveValue("Ben");
    expect(screen.getByLabelText("Family name")).toHaveValue("Reyes");

    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ben Reyes was enrolled.");
    expect(repo.learners).toHaveLength(1);
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

  it("has no detectable accessibility violations with enrollment history open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen(
      [
        {
          id: "l1",
          schoolId: "s1",
          givenName: "Ana",
          familyName: "Santos",
          lrn: null,
          sex: null,
          createdAt: "now",
        },
      ],
      [
        {
          id: "mem-1",
          schoolId: "s1",
          sectionId: "sec-1",
          learnerId: "l1",
          startsOn: "2025-06-02",
          endsOn: null,
          createdAt: "now",
        },
      ],
    );
    await screen.findByText("Ana Santos");

    await user.click(
      screen.getByRole("button", { name: "View enrollment history for Ana Santos" }),
    );
    await screen.findByText("Started 2 Jun 2025 · Current placement");

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with a duplicate-candidate warning open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Grace",
        familyName: "Torres",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Grace Torres");

    await user.type(screen.getByLabelText("Given name"), "Grace");
    await user.type(screen.getByLabelText("Family name"), "Torres");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await screen.findByRole("alert", { name: "Possible duplicate learner" });

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations with an LRN conflict warning open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Grace",
        familyName: "Torres",
        lrn: "123456789012",
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Grace Torres");

    await user.type(screen.getByLabelText("Given name"), "Different");
    await user.type(screen.getByLabelText("Family name"), "Person");
    await user.type(screen.getByLabelText("LRN (optional)"), "123456789012");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));
    await screen.findByRole("alert", { name: "LRN already in use" });

    await expectNoAccessibilityViolations(container);
  });
});
