import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SectionApplicationService } from "../application/section-service";
import { Sf1ImportApplicationService } from "../application/sf1-import-service";
import type { Learner } from "../domain/learner";
import type { FilePicker } from "../domain/ports/file-picker";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { Sf1ImportRepository } from "../domain/ports/sf1-import-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type {
  Sf1ImportHistoryEntry,
  Sf1ImportPreview,
  Sf1ImportSummary,
  Sf1RowCommitPlan,
} from "../domain/sf1-import";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { Sf1ImportScreen } from "./Sf1ImportScreen";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "s1",
  schoolYear: "2026-2027",
  gradeLevel: "1",
  name: "Sampaguita",
  createdAt: "now",
};

const EXISTING_LEARNER: Learner = {
  id: "learner-existing",
  schoolId: "s1",
  givenName: "Grace",
  familyName: "Torres",
  lrn: "111111111111",
  sex: "F",
  createdAt: "now",
};

function emptyPreview(): Sf1ImportPreview {
  return {
    rows: [],
    newRows: [],
    exactMatches: [],
    needsReview: [],
    errors: [],
    warnings: [],
    previousImport: null,
  };
}

class FakeSectionRepository implements SectionRepository {
  constructor(private sections: Section[] = [SECTION]) {}
  async list(): Promise<Section[]> {
    return this.sections;
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
}

class FakeFilePicker implements FilePicker {
  nextPath: string | null = "C:\\teacher\\sf1.xlsx";
  async pickSf1Workbook(): Promise<string | null> {
    return this.nextPath;
  }
}

class FakeSf1ImportRepository implements Sf1ImportRepository {
  previewCalls: string[] = [];
  commitCalls: Array<{
    sectionId: string;
    startsOn: string;
    plans: Sf1RowCommitPlan[];
    filePath: string;
  }> = [];
  listImportHistoryCalls: number[] = [];
  previewImpl: (filePath: string) => Promise<Sf1ImportPreview> = async () => emptyPreview();
  commitImpl: () => Promise<Sf1ImportSummary> = async () => ({
    rowsCommitted: 0,
    newLearnersCreated: 0,
    existingLearnersEnrolled: 0,
  });
  listImportHistoryImpl: () => Promise<Sf1ImportHistoryEntry[]> = async () => [];

  preview(filePath: string): Promise<Sf1ImportPreview> {
    this.previewCalls.push(filePath);
    return this.previewImpl(filePath);
  }

  commit(
    sectionId: string,
    startsOn: string,
    plans: Sf1RowCommitPlan[],
    filePath: string,
  ): Promise<Sf1ImportSummary> {
    this.commitCalls.push({ sectionId, startsOn, plans, filePath });
    return this.commitImpl();
  }

  listImportHistory(limit: number): Promise<Sf1ImportHistoryEntry[]> {
    this.listImportHistoryCalls.push(limit);
    return this.listImportHistoryImpl();
  }
}

function renderScreen(options?: { sections?: Section[] }) {
  const sectionRepo = new FakeSectionRepository(options?.sections ?? [SECTION]);
  const sectionService = new SectionApplicationService(sectionRepo);
  const importRepo = new FakeSf1ImportRepository();
  const filePicker = new FakeFilePicker();
  const sf1ImportService = new Sf1ImportApplicationService(importRepo, filePicker);
  const result = render(
    <ModeProvider>
      <Sf1ImportScreen sf1ImportService={sf1ImportService} sectionService={sectionService} />
    </ModeProvider>,
  );
  return { ...result, importRepo, filePicker };
}

async function chooseSectionAndFile(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));
  await user.selectOptions(screen.getByLabelText(/which section is this sf1 for/i), "sec-1");
  await user.click(screen.getByRole("button", { name: /choose excel file/i }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Sf1ImportScreen", () => {
  it("supports a .xlsx workbook path end-to-end to preview", async () => {
    const user = userEvent.setup();
    const { importRepo, filePicker } = renderScreen();
    filePicker.nextPath = "C:\\teacher\\sf1.xlsx";
    importRepo.previewImpl = async () => emptyPreview();

    await chooseSectionAndFile(user);

    await waitFor(() => expect(importRepo.previewCalls).toEqual(["C:\\teacher\\sf1.xlsx"]));
  });

  it("supports a legacy .xls workbook path end-to-end to preview", async () => {
    const user = userEvent.setup();
    const { importRepo, filePicker } = renderScreen();
    filePicker.nextPath = "C:\\teacher\\sf1.xls";
    importRepo.previewImpl = async () => emptyPreview();

    await chooseSectionAndFile(user);

    await waitFor(() => expect(importRepo.previewCalls).toEqual(["C:\\teacher\\sf1.xls"]));
  });

  it("shows a reading/parsing state before the preview resolves", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    let resolvePreview: (value: Sf1ImportPreview) => void = () => {};
    importRepo.previewImpl = () => new Promise((resolve) => (resolvePreview = resolve));

    await chooseSectionAndFile(user);

    expect(screen.getByRole("status")).toHaveTextContent(/reading/i);

    resolvePreview(emptyPreview());
    await waitFor(() => expect(screen.getByText(/import preview/i)).toBeInTheDocument());
  });

  it("shows new/existing/needs-review/error counts after a successful preview", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      rows: [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
        {
          rowNumber: 5,
          givenName: null,
          familyName: "Broken",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      newRows: [4],
      exactMatches: [],
      needsReview: [],
      errors: [
        { rowNumber: 5, field: "given_name", severity: "error", message: "given name is missing" },
      ],
      warnings: [],
      previousImport: null,
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/import preview/i));

    const newItem = screen.getByText("New").closest(".sf1-summary-item") as HTMLElement;
    expect(within(newItem).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/row 5 — given name is missing/i)).toBeInTheDocument();
  });

  it("renders a side-by-side comparison for a suspected duplicate", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: "2015-07-07",
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason:
            "name matches an existing learner in this school; this row has no LRN to confirm identity",
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    expect(screen.getByText(/name matches an existing learner/i)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Torres")).toHaveLength(2); // SF1 side and LIKHA side agree
    expect(within(table).getAllByText("Not stored in LIKHA")).toHaveLength(2); // value cell + comparison chip agree
  });

  it("recording a useExisting decision removes the row from unresolved and permits import", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    expect(screen.getByRole("button", { name: /import learners/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /this is the same learner/i }));

    expect(screen.getByText(/all duplicates reviewed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import learners/i })).toBeEnabled();
  });

  it("recording a createSeparate decision resolves the row without using the existing learner", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    await user.click(screen.getByRole("button", { name: /these are different learners/i }));

    expect(screen.getByRole("button", { name: /import learners/i })).toBeEnabled();
    expect(screen.getByText(/different learner/i)).toBeInTheDocument();
  });

  it("a warning does not disable the import button", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      newRows: [4],
      warnings: [
        {
          rowNumber: 4,
          field: "lrn",
          severity: "warning",
          message: "no LRN was given for this row",
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/import preview/i));

    expect(screen.getByText(/no lrn was given/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import learners/i })).toBeEnabled();
  });

  it("shows a committing state, then a success summary using only backend-reported numbers", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      newRows: [4],
    });
    let resolveCommit: (value: Sf1ImportSummary) => void = () => {};
    importRepo.commitImpl = () => new Promise((resolve) => (resolveCommit = resolve));

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByRole("button", { name: /import learners/i }));
    await user.click(screen.getByRole("button", { name: /import learners/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/importing learners/i);

    resolveCommit({ rowsCommitted: 1, newLearnersCreated: 1, existingLearnersEnrolled: 0 });

    await waitFor(() => expect(screen.getByText(/sf1 import complete/i)).toBeInTheDocument());
    expect(screen.getByText(/1 learners added/i)).toBeInTheDocument();
  });

  it("only calls commit once even if the import action is triggered twice quickly", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      newRows: [4],
    });
    let resolveCommit: (value: Sf1ImportSummary) => void = () => {};
    importRepo.commitImpl = () => new Promise((resolve) => (resolveCommit = resolve));

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByRole("button", { name: /import learners/i }));
    const importButton = screen.getByRole("button", { name: /import learners/i });
    await user.click(importButton);
    // The button is replaced by a loading state after the first click, so
    // a second click has nothing left to hit -- structurally prevented,
    // not merely debounced.
    expect(screen.queryByRole("button", { name: /import learners/i })).not.toBeInTheDocument();

    resolveCommit({ rowsCommitted: 1, newLearnersCreated: 1, existingLearnersEnrolled: 0 });
    await waitFor(() => screen.getByText(/sf1 import complete/i));

    expect(importRepo.commitCalls).toHaveLength(1);
  });

  it("a failed commit shows a no-partial-import message and allows retry without losing decisions", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });
    importRepo.commitImpl = async () => {
      throw new Error("transaction failed");
    };

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));
    await user.click(screen.getByRole("button", { name: /this is the same learner/i }));
    await user.click(screen.getByRole("button", { name: /import learners/i }));

    await waitFor(() =>
      expect(screen.getByText(/no partial learner import was saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));

    // Back on the preview screen, the earlier decision is still recorded
    // -- the teacher does not have to re-review row 10.
    await waitFor(() => screen.getByText(/all duplicates reviewed/i));
  });

  it("shows a generic, safe message for an authorization failure -- never raw error text", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => {
      throw new Error("unauthorized");
    };

    await chooseSectionAndFile(user);

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(screen.queryByText(/unauthorized/i)).not.toBeInTheDocument();
  });

  it("never offers a merge action anywhere in the workflow", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    // "merge" only ever appears as a negation in the safety reassurance
    // copy ("LIKHA never merges...") -- there is no merge action/button
    // anywhere in the workflow.
    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAccessibleName(/merge/i);
    }
  });

  it("the safety reassurance is visible in Comfortable mode (the default), not just Guided", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    expect(screen.getByText(/nothing is saved until you decide/i)).toBeInTheDocument();
  });

  it("surfaces every candidate when more than one plausible match exists, and lets the teacher choose", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    const otherCandidate = { ...EXISTING_LEARNER, id: "learner-existing-2", lrn: "222222222222" };
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER, otherCandidate],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    expect(screen.getByText(/2 possible matches found/i)).toBeInTheDocument();
    const secondOption = screen.getByRole("button", { name: /grace torres \(lrn 222222222222\)/i });
    await user.click(secondOption);
    await user.click(screen.getByRole("button", { name: /this is the same learner/i }));

    expect(screen.getByText(/all duplicates reviewed/i)).toBeInTheDocument();
  });

  it("a file-read failure shows specific SF1-workbook guidance for a known import_error category", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => {
      throw new Error("import_error");
    };

    await chooseSectionAndFile(user);

    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not read this file as an sf1 workbook/i,
    );
  });

  it("Guided mode shows the extra 'why is LIKHA asking' explanation during duplicate review", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    expect(
      screen.getByText(/likha never merges or overwrites records automatically/i),
    ).toBeInTheDocument();
  });

  it("Efficient mode hides the extra explanatory hint text", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "efficient");
    renderScreen();

    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));

    expect(screen.queryByText(/excel workbook \(\.xls or \.xlsx\)/i)).not.toBeInTheDocument();
  });

  it("Comfortable mode (default) shows the standard file-type hint", async () => {
    renderScreen();

    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));

    expect(screen.getByText(/excel workbook \(\.xls or \.xlsx\)/i)).toBeInTheDocument();
  });

  it("the choose-file action is reachable by keyboard once a section is selected", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));
    // The button is disabled (and so out of tab order, per HTML semantics)
    // until a section is chosen -- selecting one first is the realistic
    // keyboard path, not an artificial workaround.
    await user.selectOptions(screen.getByLabelText(/which section is this sf1 for/i), "sec-1");

    let guard = 0;
    while (document.activeElement?.tagName !== "BUTTON" && guard < 10) {
      await user.tab();
      guard += 1;
    }
    expect(document.activeElement).toHaveAccessibleName(/choose excel file/i);
  });

  it("has no detectable accessibility violations on the setup screen", async () => {
    const { container } = renderScreen();
    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations on the duplicate-review screen", async () => {
    const user = userEvent.setup();
    const { importRepo, container } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 10,
          givenName: "Grace",
          familyName: "Torres",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: "F",
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      needsReview: [
        {
          rowNumber: 10,
          kind: "suspected_duplicate",
          candidates: [EXISTING_LEARNER],
          reason: null,
        },
      ],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/review duplicates/i));

    await expectNoAccessibilityViolations(container);
  });

  // -- Wave 2E: operational hardening --------------------------------

  it("commit is called with the same file path the preview was read from", async () => {
    const user = userEvent.setup();
    const { importRepo, filePicker } = renderScreen();
    filePicker.nextPath = "C:\\teacher\\sf1.xlsx";
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      newRows: [4],
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByRole("button", { name: /import learners/i }));
    await user.click(screen.getByRole("button", { name: /import learners/i }));

    await waitFor(() => expect(importRepo.commitCalls).toHaveLength(1));
    expect(importRepo.commitCalls[0]?.filePath).toBe("C:\\teacher\\sf1.xlsx");
  });

  it("shows an advisory notice when this exact file was imported before, without blocking anything", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => ({
      ...emptyPreview(),
      rows: [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          lrnWasPresentButInvalid: false,
          sex: null,
          sexWasPresentButUnrecognized: false,
          birthdate: null,
          remarks: null,
        },
      ],
      newRows: [4],
      previousImport: {
        id: "hist-1",
        schoolId: "s1",
        sectionId: "sec-1",
        userId: "u1",
        username: "ana.cruz",
        sourceFilename: "sf1.xlsx",
        sourceFingerprint: "abc",
        rowsCommitted: 3,
        newLearnersCreated: 3,
        existingLearnersEnrolled: 0,
        createdAt: "2026-08-20T10:00:00.000Z",
      },
    });

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/import preview/i));

    expect(screen.getByText(/imported this exact file before/i)).toBeInTheDocument();
    expect(screen.getByText(/ana\.cruz/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import learners/i })).not.toBeDisabled();
  });

  it("shows no previous-import notice for a file never imported before", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.previewImpl = async () => emptyPreview();

    await chooseSectionAndFile(user);
    await waitFor(() => screen.getByText(/import preview/i));

    expect(screen.queryByText(/imported this exact file before/i)).not.toBeInTheDocument();
  });

  it("lets a teacher view past imports without leaving the setup screen", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.listImportHistoryImpl = async () => [
      {
        id: "hist-1",
        schoolId: "s1",
        sectionId: "sec-1",
        userId: "u1",
        username: "ana.cruz",
        sourceFilename: "sf1_grade1.xlsx",
        sourceFingerprint: "abc",
        rowsCommitted: 5,
        newLearnersCreated: 5,
        existingLearnersEnrolled: 0,
        createdAt: "2026-08-20T10:00:00.000Z",
      },
    ];

    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));
    await user.click(screen.getByRole("button", { name: /view past imports/i }));

    await waitFor(() => expect(screen.getByText("sf1_grade1.xlsx")).toBeInTheDocument());
    expect(screen.getByText(/ana\.cruz/)).toBeInTheDocument();
    expect(importRepo.listImportHistoryCalls).toEqual([20]);
  });

  it("shows an empty state when no imports have been recorded yet", async () => {
    const user = userEvent.setup();
    renderScreen();

    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));
    await user.click(screen.getByRole("button", { name: /view past imports/i }));

    await waitFor(() =>
      expect(screen.getByText(/no sf1 imports have been recorded/i)).toBeInTheDocument(),
    );
  });

  it("never shows raw SF1 row content in the import history list", async () => {
    const user = userEvent.setup();
    const { importRepo } = renderScreen();
    importRepo.listImportHistoryImpl = async () => [
      {
        id: "hist-1",
        schoolId: "s1",
        sectionId: "sec-1",
        userId: "u1",
        username: "ana.cruz",
        sourceFilename: "sf1_grade1.xlsx",
        sourceFingerprint: "abc",
        rowsCommitted: 5,
        newLearnersCreated: 5,
        existingLearnersEnrolled: 0,
        createdAt: "2026-08-20T10:00:00.000Z",
      },
    ];

    await waitFor(() => screen.getByLabelText(/which section is this sf1 for/i));
    await user.click(screen.getByRole("button", { name: /view past imports/i }));

    await waitFor(() => expect(screen.getByText("sf1_grade1.xlsx")).toBeInTheDocument());
    // The history entry's own fingerprint (a hex digest, not learner data)
    // is never rendered, and there is no learner name/LRN anywhere in this
    // list -- only the filename, actor, timestamp, and counts.
    expect(screen.queryByText(/abc/)).not.toBeInTheDocument();
  });
});
