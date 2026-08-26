import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { FilePicker } from "../domain/ports/file-picker";
import type { Sf1ImportRepository } from "../domain/ports/sf1-import-repository";
import type {
  DuplicateDecision,
  Sf1ImportPreview,
  Sf1ImportRow,
  Sf1ImportSummary,
  Sf1RowCommitPlan,
} from "../domain/sf1-import";
import { Sf1ImportApplicationService } from "./sf1-import-service";

class FakeSf1ImportRepository implements Sf1ImportRepository {
  previewCalls: string[] = [];
  commitCalls: Array<{ sectionId: string; startsOn: string; plans: Sf1RowCommitPlan[] }> = [];
  previewResult: Sf1ImportPreview = emptyPreview();
  commitResult: Sf1ImportSummary = {
    rowsCommitted: 0,
    newLearnersCreated: 0,
    existingLearnersEnrolled: 0,
  };

  async preview(filePath: string): Promise<Sf1ImportPreview> {
    this.previewCalls.push(filePath);
    return this.previewResult;
  }

  async commit(
    sectionId: string,
    startsOn: string,
    plans: Sf1RowCommitPlan[],
  ): Promise<Sf1ImportSummary> {
    this.commitCalls.push({ sectionId, startsOn, plans });
    return this.commitResult;
  }
}

class FakeFilePicker implements FilePicker {
  result: string | null = null;
  async pickSf1Workbook(): Promise<string | null> {
    return this.result;
  }
}

function emptyPreview(): Sf1ImportPreview {
  return { rows: [], newRows: [], exactMatches: [], needsReview: [], errors: [], warnings: [] };
}

function row(overrides: Partial<Sf1ImportRow> = {}): Sf1ImportRow {
  return {
    rowNumber: 4,
    givenName: "Ana",
    familyName: "Dela Cruz",
    lrn: null,
    lrnWasPresentButInvalid: false,
    sex: null,
    sexWasPresentButUnrecognized: false,
    birthdate: null,
    remarks: null,
    ...overrides,
  };
}

describe("Sf1ImportApplicationService", () => {
  describe("pickWorkbookFile", () => {
    it("delegates to the file picker", async () => {
      const picker = new FakeFilePicker();
      picker.result = "C:\\sf1.xls";
      const service = new Sf1ImportApplicationService(new FakeSf1ImportRepository(), picker);

      expect(await service.pickWorkbookFile()).toBe("C:\\sf1.xls");
    });
  });

  describe("previewImport", () => {
    it("rejects an empty file path without calling the repository", async () => {
      const repo = new FakeSf1ImportRepository();
      const service = new Sf1ImportApplicationService(repo, new FakeFilePicker());

      await expect(service.previewImport("   ")).rejects.toThrow(ValidationError);
      expect(repo.previewCalls).toHaveLength(0);
    });

    it("trims the path and delegates to the repository", async () => {
      const repo = new FakeSf1ImportRepository();
      const service = new Sf1ImportApplicationService(repo, new FakeFilePicker());

      await service.previewImport("  C:\\sf1.xls  ");

      expect(repo.previewCalls).toEqual(["C:\\sf1.xls"]);
    });
  });

  describe("unresolvedReviewCount", () => {
    it("counts needsReview rows with no recorded decision", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        needsReview: [
          { rowNumber: 4, kind: "suspected_duplicate", candidates: [], reason: null },
          { rowNumber: 5, kind: "suspected_duplicate", candidates: [], reason: null },
        ],
      };
      const decisions = new Map<number, DuplicateDecision>([[4, { type: "createSeparate" }]]);

      expect(service.unresolvedReviewCount(preview, decisions)).toBe(1);
    });

    it("is zero once every row has a decision", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        needsReview: [{ rowNumber: 4, kind: "suspected_duplicate", candidates: [], reason: null }],
      };
      const decisions = new Map<number, DuplicateDecision>([[4, { type: "createSeparate" }]]);

      expect(service.unresolvedReviewCount(preview, decisions)).toBe(0);
    });
  });

  describe("buildCommitPlan", () => {
    it("plans every new row as createNewLearner", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        rows: [row({ rowNumber: 4 })],
        newRows: [4],
      };

      const plans = service.buildCommitPlan(preview, new Map());

      expect(plans).toEqual([
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          sex: null,
          action: "createNewLearner",
        },
      ]);
    });

    it("plans every exact match as enrollExistingLearner against the backend's own candidate", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        rows: [row({ rowNumber: 4, lrn: "123456789012" })],
        exactMatches: [
          {
            rowNumber: 4,
            kind: "exact_lrn",
            candidates: [
              {
                id: "learner-1",
                schoolId: "s1",
                givenName: "Ana",
                familyName: "Dela Cruz",
                lrn: "123456789012",
                sex: null,
                createdAt: "now",
              },
            ],
            reason: null,
          },
        ],
      };

      const plans = service.buildCommitPlan(preview, new Map());

      expect(plans).toEqual([
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: "123456789012",
          sex: null,
          action: { enrollExistingLearner: { learnerId: "learner-1" } },
        },
      ]);
    });

    it("excludes a needsReview row with no decision -- never guesses createSeparate", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        rows: [row({ rowNumber: 4 })],
        needsReview: [{ rowNumber: 4, kind: "suspected_duplicate", candidates: [], reason: null }],
      };

      const plans = service.buildCommitPlan(preview, new Map());

      expect(plans).toEqual([]);
    });

    it("plans a useExisting decision as enrollExistingLearner for the chosen candidate", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        rows: [row({ rowNumber: 4 })],
        needsReview: [{ rowNumber: 4, kind: "suspected_duplicate", candidates: [], reason: null }],
      };
      const decisions = new Map<number, DuplicateDecision>([
        [4, { type: "useExisting", learnerId: "learner-7" }],
      ]);

      const plans = service.buildCommitPlan(preview, decisions);

      expect(plans).toEqual([
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          sex: null,
          action: { enrollExistingLearner: { learnerId: "learner-7" } },
        },
      ]);
    });

    it("plans a createSeparate decision as createNewLearner", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        rows: [row({ rowNumber: 4 })],
        needsReview: [{ rowNumber: 4, kind: "suspected_duplicate", candidates: [], reason: null }],
      };
      const decisions = new Map<number, DuplicateDecision>([[4, { type: "createSeparate" }]]);

      const plans = service.buildCommitPlan(preview, decisions);

      expect(plans).toHaveLength(1);
      expect(plans[0]?.action).toBe("createNewLearner");
    });

    it("never includes a row whose backend classification is a hard error", () => {
      const service = new Sf1ImportApplicationService(
        new FakeSf1ImportRepository(),
        new FakeFilePicker(),
      );
      // A row with a null name (as an error row's normalized data would
      // carry) never appears in newRows/exactMatches/needsReview at all --
      // this proves buildCommitPlan doesn't invent a plan for it even if
      // it were somehow referenced.
      const preview: Sf1ImportPreview = {
        ...emptyPreview(),
        rows: [row({ rowNumber: 8, givenName: null })],
        newRows: [8],
      };

      const plans = service.buildCommitPlan(preview, new Map());

      expect(plans).toEqual([]);
    });
  });

  describe("commitImport", () => {
    it("rejects an empty plan without calling the repository", async () => {
      const repo = new FakeSf1ImportRepository();
      const service = new Sf1ImportApplicationService(repo, new FakeFilePicker());

      await expect(service.commitImport("sec-1", "2026-06-01", [])).rejects.toThrow(
        ValidationError,
      );
      expect(repo.commitCalls).toHaveLength(0);
    });

    it("delegates to the repository with sectionId/startsOn/plans", async () => {
      const repo = new FakeSf1ImportRepository();
      const service = new Sf1ImportApplicationService(repo, new FakeFilePicker());
      const plans: Sf1RowCommitPlan[] = [
        {
          rowNumber: 4,
          givenName: "Ana",
          familyName: "Dela Cruz",
          lrn: null,
          sex: null,
          action: "createNewLearner",
        },
      ];

      await service.commitImport("sec-1", "2026-06-01", plans);

      expect(repo.commitCalls).toEqual([{ sectionId: "sec-1", startsOn: "2026-06-01", plans }]);
    });
  });
});
