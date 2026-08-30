import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LearnerImportApplicationService } from "../application/learner-import-service";
import type {
  LearnerImportBatchResult,
  LearnerImportDecision,
  LearnerImportLogEntry,
  LearnerImportPreviewRow,
} from "../domain/learner-import";
import type { LearnerImportRepository } from "../domain/ports/learner-import-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LearnerImportScreen } from "./LearnerImportScreen";

class FakeLearnerImportRepository implements LearnerImportRepository {
  commitCalls: LearnerImportDecision[][] = [];
  previewResult: LearnerImportPreviewRow[] = [];
  commitResult: LearnerImportBatchResult = {
    batchId: "batch-1",
    createdCount: 1,
    updatedCount: 0,
    skippedCount: 0,
  };
  logResult: LearnerImportLogEntry[] = [];

  async preview(): Promise<LearnerImportPreviewRow[]> {
    return this.previewResult;
  }

  async commit(decisions: LearnerImportDecision[]): Promise<LearnerImportBatchResult> {
    this.commitCalls.push(decisions);
    return this.commitResult;
  }

  async log(): Promise<LearnerImportLogEntry[]> {
    return this.logResult;
  }
}

function renderScreen(repo = new FakeLearnerImportRepository()) {
  const result = render(
    <ModeProvider>
      <LearnerImportScreen learnerImportService={new LearnerImportApplicationService(repo)} />
    </ModeProvider>,
  );
  return { ...result, repo };
}

function csvFile(contents: string) {
  return new File([contents], "learners.csv", { type: "text/csv" });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LearnerImportScreen", () => {
  it("previews an uploaded file and shows a clean row as ready to import", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerImportRepository();
    repo.previewResult = [
      {
        rowNumber: 1,
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        error: null,
        potentialDuplicate: null,
      },
    ];
    const { repo: usedRepo } = renderScreen(repo);

    const input = screen.getByLabelText("CSV file");
    await user.upload(input, csvFile("given_name,family_name,lrn,sex\nAna,Santos,,\n"));

    await screen.findByText("New learner");
    expect(screen.getByDisplayValue("Ana")).toBeInTheDocument();
    expect(usedRepo).toBe(repo);
  });

  it("flags a potential duplicate and defaults its action to skip", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerImportRepository();
    repo.previewResult = [
      {
        rowNumber: 1,
        givenName: "Ana",
        familyName: "Santos",
        lrn: "123456789012",
        sex: null,
        error: null,
        potentialDuplicate: {
          id: "existing-1",
          schoolId: "s1",
          givenName: "Ana",
          familyName: "Santos",
          lrn: "123456789012",
          sex: null,
          createdAt: "now",
        },
      },
    ];
    renderScreen(repo);

    const input = screen.getByLabelText("CSV file");
    await user.upload(input, csvFile("given_name,family_name,lrn,sex\nAna,Santos,123456789012,\n"));

    const actionSelect = await screen.findByLabelText(/Possible match: Ana Santos/);
    expect(actionSelect).toHaveValue("skip");
  });

  it("shows a row's own parse error and excludes it from the importable count", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerImportRepository();
    repo.previewResult = [
      {
        rowNumber: 1,
        givenName: "",
        familyName: "",
        lrn: null,
        sex: null,
        error: "Given name is required.",
        potentialDuplicate: null,
      },
    ];
    renderScreen(repo);

    const input = screen.getByLabelText("CSV file");
    await user.upload(input, csvFile("given_name,family_name,lrn,sex\n,,,,\n"));

    await screen.findByText("Given name is required.");
    expect(screen.getByText(/0 rows ready to review/)).toBeInTheDocument();
  });

  it("commits the previewed rows and shows the resulting counts", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerImportRepository();
    repo.previewResult = [
      {
        rowNumber: 1,
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        error: null,
        potentialDuplicate: null,
      },
    ];
    renderScreen(repo);

    const input = screen.getByLabelText("CSV file");
    await user.upload(input, csvFile("given_name,family_name,lrn,sex\nAna,Santos,,\n"));
    await screen.findByText("New learner");

    await user.click(screen.getByRole("button", { name: "Import 1 row" }));

    await waitFor(() => screen.getByText(/Import complete: 1 created, 0 updated, 0 skipped/));
    expect(repo.commitCalls).toHaveLength(1);
    expect(repo.commitCalls[0]).toEqual([
      {
        rowNumber: 1,
        action: "create",
        existingLearnerId: null,
        importedGivenName: "Ana",
        importedFamilyName: "Santos",
        importedLrn: null,
        importedSex: null,
        finalGivenName: "Ana",
        finalFamilyName: "Santos",
        finalLrn: null,
        finalSex: null,
      },
    ]);
  });

  it("has no detectable accessibility violations after previewing a duplicate row", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerImportRepository();
    repo.previewResult = [
      {
        rowNumber: 1,
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        error: null,
        potentialDuplicate: {
          id: "existing-1",
          schoolId: "s1",
          givenName: "Ana",
          familyName: "Santos",
          lrn: null,
          sex: null,
          createdAt: "now",
        },
      },
    ];
    const { container } = renderScreen(repo);

    const input = screen.getByLabelText("CSV file");
    await user.upload(input, csvFile("given_name,family_name,lrn,sex\nAna,Santos,,\n"));
    await screen.findByLabelText(/Possible match: Ana Santos/);

    await expectNoAccessibilityViolations(container);
  });
});
