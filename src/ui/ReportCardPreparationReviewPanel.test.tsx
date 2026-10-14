import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import type { ExportRepository } from "../domain/ports/export-repository";
import type {
  ReportCardDraft,
  ReportPreparationReview,
  ReportPreparationReviewRequest,
} from "../domain/report-readiness";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ReportCardPreparationReviewPanel } from "./ReportCardPreparationReviewPanel";

const draft = {
  id: "draft",
  classRecordId: "record",
  snapshotSha256: "b".repeat(64),
} as ReportCardDraft;
const MATCH = {
  draftId: "draft",
  classRecordId: "record",
  sourceStatus: "matches",
  sourceVersion: "report-card-readiness-source-v1",
  storedSourceSha256: "a".repeat(64),
  currentSourceSha256: "a".repeat(64),
};
function event(request: ReportPreparationReviewRequest): ReportPreparationReview {
  return {
    id: "synthetic-review",
    classRecordId: "record",
    draftId: request.draftId,
    requestId: request.requestId,
    stage: "review",
    snapshotSha256: request.expectedSnapshotSha256,
    sourceSha256: request.expectedSourceSha256,
    sourceVersion: MATCH.sourceVersion,
    notes: request.notes.trim(),
    reviewedByUserId: "native-actor",
    reviewedAt: "2026-10-15T00:00:00Z",
  };
}
function setup() {
  const checkReportCardDraftSource = vi.fn().mockResolvedValue(MATCH);
  const recordReportCardPreparationReview = vi
    .fn()
    .mockImplementation((_record: string, request: ReportPreparationReviewRequest) =>
      Promise.resolve(event(request)),
    );
  const listRecentReportCardPreparationReviews = vi.fn().mockResolvedValue([]);
  const exports = { exportClassRecordReportCard: vi.fn() };
  const service = new ExportApplicationService(
    exports as unknown as ExportRepository,
    undefined,
    {
      checkReportCardDraftSource,
      captureReportCardDraft: vi.fn(),
      listRecentReportCardDrafts: vi.fn(),
      compareReportCardDraft: vi.fn(),
    },
    { recordReportCardPreparationReview, listRecentReportCardPreparationReviews },
  );
  const props = { service, draft, revision: 0, disabled: false };
  const view = (changes: Partial<typeof props> = {}) => (
    <ModeProvider>
      <ReportCardPreparationReviewPanel {...props} {...changes} />
    </ModeProvider>
  );
  return {
    ...render(view()),
    view,
    checkReportCardDraftSource,
    recordReportCardPreparationReview,
    listRecentReportCardPreparationReviews,
    exports,
  };
}
const check = () =>
  userEvent.click(screen.getByRole("button", { name: "Check inputs before preparation review" }));
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Record preparation review" }));
const history = () =>
  userEvent.click(screen.getByRole("button", { name: "Load recent preparation reviews" }));
async function confirm() {
  await check();
  await userEvent.click(await screen.findByRole("checkbox"));
}
describe("ReportCardPreparationReviewPanel", () => {
  afterEach(() => window.localStorage.removeItem("likha-sis:teacher-mode"));
  it.each(["efficient", "comfortable", "guided"])(
    "requires explicit accessible confirmation and retains non-approval evidence in %s",
    async (mode) => {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const t = setup();
      expect(t.recordReportCardPreparationReview).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Record preparation review" })).toBeDisabled();
      if (mode === "guided")
        expect(screen.getByText(/Open the retained draft above/)).toBeInTheDocument();
      else expect(screen.queryByText(/Open the retained draft above/)).not.toBeInTheDocument();
      await check();
      const notes = await screen.findByRole("textbox");
      await userEvent.type(notes, "Synthetic notes");
      expect(screen.getByRole("button", { name: "Record preparation review" })).toBeDisabled();
      await userEvent.click(screen.getByRole("checkbox"));
      await expectNoAccessibilityViolations(t.container);
      await save();
      expect(await screen.findByText(/Preparation review retained/)).toHaveTextContent(
        "Not approved or issued",
      );
      expect(t.recordReportCardPreparationReview).toHaveBeenCalledTimes(1);
      expect(t.recordReportCardPreparationReview).toHaveBeenCalledWith(
        "record",
        expect.objectContaining({
          draftId: "draft",
          teacherConfirmed: true,
          notes: "Synthetic notes",
          expectedSnapshotSha256: draft.snapshotSha256,
          expectedSourceSha256: MATCH.storedSourceSha256,
        }),
      );
      await userEvent.click(screen.getByText(/Retained preparation review —/));
      expect(screen.getByText(/Reviewer identity: native-actor/)).toBeInTheDocument();
      await expectNoAccessibilityViolations(t.container);
      expect(t.exports.exportClassRecordReportCard).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    { ...MATCH, sourceStatus: "changed" },
    { ...MATCH, sourceStatus: "legacy_unavailable" },
    { ...MATCH, sourceVersion: "unsupported" },
    { ...MATCH, classRecordId: "foreign" },
    { ...MATCH, currentSourceSha256: "c".repeat(64) },
  ])("refuses unavailable/mismatched preflight %j", async (result) => {
    const t = setup();
    t.checkReportCardDraftSource.mockResolvedValue(result);
    await check();
    expect(
      await screen.findByText(/Matching current inputs could not be established/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await save();
    expect(t.recordReportCardPreparationReview).not.toHaveBeenCalled();
  });
  it("invalidates confirmation on notes, recheck, revision, pending writes and context changes", async () => {
    const t = setup();
    await confirm();
    await userEvent.type(screen.getByRole("textbox"), "Changed notes");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox"));
    await check();
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox"));
    t.rerender(t.view({ revision: 1 }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await check();
    expect(await screen.findByRole("textbox")).toHaveValue("Changed notes");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    t.rerender(t.view({ disabled: true }));
    expect(screen.getByRole("button", { name: "Record preparation review" })).toBeDisabled();
    t.rerender(t.view({ draft: { ...draft, id: "other" } }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(t.recordReportCardPreparationReview).not.toHaveBeenCalled();
  });
  it("never retries an uncertain write and resolves only an exact retained request acknowledgement", async () => {
    const t = setup();
    t.recordReportCardPreparationReview.mockRejectedValue(new Error("lost acknowledgement"));
    await confirm();
    await save();
    expect(await screen.findByText(/A review write was attempted/)).toHaveTextContent(
      "It may have been saved",
    );
    expect(screen.getByRole("button", { name: "Record preparation review" })).toBeDisabled();
    await history();
    expect(await screen.findByText(/No review for this draft appears/)).toBeInTheDocument();
    expect(screen.getByText(/A review write was attempted/)).toHaveTextContent(
      "not proof that nothing was saved",
    );
    const payload = t.recordReportCardPreparationReview.mock
      .calls[0]![1] as ReportPreparationReviewRequest;
    t.listRecentReportCardPreparationReviews.mockResolvedValue([
      { ...event(payload), sourceSha256: "f".repeat(64) },
    ]);
    await history();
    expect(await screen.findByText(/A review write was attempted/)).toBeInTheDocument();
    t.listRecentReportCardPreparationReviews.mockResolvedValue([event(payload)]);
    await history();
    expect(await screen.findByText(/Preparation review retained/)).toBeInTheDocument();
    expect(screen.queryByText(/A review write was attempted/)).not.toBeInTheDocument();
    expect(t.recordReportCardPreparationReview).toHaveBeenCalledTimes(1);
  });
  it("treats malformed write acknowledgements as uncertain and rejects cross-record history", async () => {
    const t = setup();
    t.recordReportCardPreparationReview.mockResolvedValue({
      ...event({
        draftId: "draft",
        requestId: "x",
        expectedSnapshotSha256: draft.snapshotSha256,
        expectedSourceSha256: MATCH.storedSourceSha256,
        teacherConfirmed: true,
        notes: "",
      }),
      stage: "issued",
    });
    await confirm();
    await save();
    expect(await screen.findByText(/A review write was attempted/)).toBeInTheDocument();
    t.listRecentReportCardPreparationReviews.mockResolvedValue([{ classRecordId: "foreign" }]);
    await history();
    expect(
      await screen.findByText(/Review evidence could not be loaded or verified/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Recent retained preparation-review evidence loaded/),
    ).not.toBeInTheDocument();
  });
  it("discards late source/read/write responses after revision or unmount and blocks double submission", async () => {
    const t = setup();
    let resolve!: (value: typeof MATCH) => void;
    t.checkReportCardDraftSource.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await check();
    t.rerender(t.view({ revision: 1 }));
    await act(async () => resolve(MATCH));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    t.checkReportCardDraftSource.mockResolvedValue(MATCH);
    await confirm();
    let finish!: (value: ReportPreparationReview) => void;
    t.recordReportCardPreparationReview.mockImplementation(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    await save();
    await save();
    expect(t.recordReportCardPreparationReview).toHaveBeenCalledTimes(1);
    const payload = t.recordReportCardPreparationReview.mock
      .calls[0]![1] as ReportPreparationReviewRequest;
    t.unmount();
    await act(async () => finish(event(payload)));
  });
});
