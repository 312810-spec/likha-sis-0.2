import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import type { ExportRepository } from "../domain/ports/export-repository";
import type {
  ReportPreparationReview,
  ReportPreparationReviewSourceCheck,
} from "../domain/report-readiness";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ReportCardReviewSourcePanel } from "./ReportCardReviewSourcePanel";

const REVIEW: ReportPreparationReview = {
  id: "synthetic-review",
  classRecordId: "record",
  draftId: "synthetic-draft",
  requestId: "synthetic-request",
  stage: "review",
  snapshotSha256: "b".repeat(64),
  sourceSha256: "a".repeat(64),
  sourceVersion: "report-card-readiness-source-v1",
  notes: "Synthetic",
  reviewedByUserId: "native-actor",
  reviewedAt: "2026-10-15T00:00:00Z",
};
const MATCH: ReportPreparationReviewSourceCheck = {
  reviewId: REVIEW.id,
  draftId: REVIEW.draftId,
  classRecordId: REVIEW.classRecordId,
  snapshotSha256: REVIEW.snapshotSha256,
  storedSourceSha256: REVIEW.sourceSha256,
  sourceVersion: REVIEW.sourceVersion,
  currentSourceSha256: REVIEW.sourceSha256,
  sourceStatus: "matches",
  checkedAt: "2026-10-15T01:00:00Z",
  evidenceScope: "read_time_preparation_evidence_not_issue_authorization",
  officialFidelity: "not_verified",
};
function setup() {
  const checkReportCardPreparationReviewSource = vi.fn().mockResolvedValue(MATCH);
  const recordReportCardPreparationReview = vi.fn();
  const exports = { exportClassRecordReportCard: vi.fn() };
  const service = new ExportApplicationService(
    exports as unknown as ExportRepository,
    undefined,
    undefined,
    {
      checkReportCardPreparationReviewSource,
      recordReportCardPreparationReview,
      listRecentReportCardPreparationReviews: vi.fn(),
    },
  );
  const props = { service, review: REVIEW, revision: 0, disabled: false };
  const view = (changes: Partial<typeof props> = {}) => (
    <ModeProvider>
      <ReportCardReviewSourcePanel {...props} {...changes} />
    </ModeProvider>
  );
  return {
    ...render(view()),
    view,
    service,
    checkReportCardPreparationReviewSource,
    recordReportCardPreparationReview,
    exports,
  };
}
const check = () => userEvent.click(screen.getByRole("button", { name: "Check reviewed inputs" }));
describe("ReportCardReviewSourcePanel", () => {
  afterEach(() => window.localStorage.removeItem("likha-sis:teacher-mode"));
  it.each(["efficient", "comfortable", "guided"])(
    "exposes accessible explicit non-approving checks in %s",
    async (mode) => {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const t = setup();
      expect(t.checkReportCardPreparationReviewSource).not.toHaveBeenCalled();
      if (mode === "guided")
        expect(screen.getByText(/A retained review records an earlier action/)).toBeInTheDocument();
      else
        expect(
          screen.queryByText(/A retained review records an earlier action/),
        ).not.toBeInTheDocument();
      await check();
      expect(await screen.findByText(/Reviewed inputs match/)).toHaveTextContent(
        "not current approval or issuance permission",
      );
      expect(screen.getByText(/Checked at:/)).toHaveTextContent(
        "Official fidelity remains unverified",
      );
      await userEvent.click(screen.getByText("Reviewed input identities"));
      expect(screen.getByText(/Snapshot SHA-256/)).toHaveTextContent(REVIEW.snapshotSha256);
      await expectNoAccessibilityViolations(t.container);
      t.checkReportCardPreparationReviewSource.mockResolvedValue({
        ...MATCH,
        sourceStatus: "changed",
        currentSourceSha256: "c".repeat(64),
      });
      await check();
      expect(
        await screen.findByText(/Inputs or implementation changed since this review/),
      ).toHaveTextContent("not refreshed or re-approved");
      await expectNoAccessibilityViolations(t.container);
      expect(t.checkReportCardPreparationReviewSource).toHaveBeenCalledWith(
        "record",
        "synthetic-review",
      );
      expect(t.recordReportCardPreparationReview).not.toHaveBeenCalled();
      expect(t.exports.exportClassRecordReportCard).not.toHaveBeenCalled();
    },
  );
  it("distinguishes unsupported protocol without inventing current input comparison", async () => {
    const t = setup();
    const review = { ...REVIEW, sourceVersion: "synthetic-future-version" };
    t.rerender(t.view({ review }));
    t.checkReportCardPreparationReviewSource.mockResolvedValue({
      ...MATCH,
      sourceVersion: review.sourceVersion,
      sourceStatus: "unsupported_version",
      currentSourceSha256: null,
    });
    await check();
    expect(await screen.findByText(/retained review uses an unsupported/)).toHaveTextContent(
      "unavailable, not approved",
    );
    expect(screen.queryByText(/Current source SHA-256/)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(t.container);
  });
  it.each([
    { reviewId: "foreign" },
    { classRecordId: "foreign" },
    { draftId: "foreign" },
    { snapshotSha256: "f".repeat(64) },
    { storedSourceSha256: "f".repeat(64) },
    { sourceVersion: "foreign" },
    { currentSourceSha256: "f".repeat(64) },
    { sourceStatus: "changed" },
    { sourceStatus: "legacy_unavailable" },
    { sourceStatus: "unsupported_version", currentSourceSha256: null },
    { evidenceScope: "issue_authorized" },
    { officialFidelity: "verified" },
    { checkedAt: "" },
  ])("rejects inconsistent identities, status or authority claims %j", async (patch) => {
    const t = setup();
    t.checkReportCardPreparationReviewSource.mockResolvedValue({ ...MATCH, ...patch });
    await check();
    expect(
      await screen.findByText(/Review input evidence could not be loaded or verified/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
  });
  it("clears earlier evidence on loading, missing or error and allows explicit retry", async () => {
    const t = setup();
    await check();
    await screen.findByText(/Reviewed inputs match/);
    t.checkReportCardPreparationReviewSource
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("offline"));
    await check();
    expect(await screen.findByText(/No input check is available/)).toBeInTheDocument();
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
    await check();
    expect(
      await screen.findByText(/Review input evidence could not be loaded or verified/),
    ).toBeInTheDocument();
    await check();
    expect(await screen.findByText(/Reviewed inputs match/)).toBeInTheDocument();
  });
  it("invalidates evidence on revision, disabled state, changed review or service", async () => {
    const t = setup();
    await check();
    await screen.findByText(/Reviewed inputs match/);
    t.rerender(t.view({ revision: 1 }));
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
    await check();
    await screen.findByText(/Reviewed inputs match/);
    t.rerender(t.view({ disabled: true }));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
    t.rerender(t.view({ review: { ...REVIEW, sourceSha256: "d".repeat(64) } }));
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
    t.rerender(
      t.view({ service: new ExportApplicationService(t.exports as unknown as ExportRepository) }),
    );
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
  });
  it("drops late responses after context change/unmount and blocks duplicate reads", async () => {
    const t = setup();
    let resolve!: (value: ReportPreparationReviewSourceCheck) => void;
    t.checkReportCardPreparationReviewSource.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await check();
    await check();
    expect(t.checkReportCardPreparationReviewSource).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/Checking reviewed inputs…/)).toBeInTheDocument();
    t.rerender(t.view({ revision: 1 }));
    await act(async () => resolve(MATCH));
    expect(screen.queryByText(/Reviewed inputs match/)).not.toBeInTheDocument();
    await check();
    t.unmount();
    await act(async () => resolve(MATCH));
  });
});
