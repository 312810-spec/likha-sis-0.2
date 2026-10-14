import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { ReportCardDraft, ReportCardDraftComparison } from "../domain/report-readiness";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ReportCardDraftComparisonPanel } from "./ReportCardDraftComparisonPanel";

const DRAFT: ReportCardDraft = {
  id: "synthetic-draft",
  classRecordId: "record",
  stage: "draft",
  snapshotSha256: "a".repeat(64),
  createdByUserId: "synthetic-teacher",
  createdAt: "synthetic-save-time",
  snapshot: {
    classRecordId: "record",
    schoolYear: "2026-2027",
    sectionName: "Historical Section",
    subjectName: "Synthetic Subject",
    gradingPeriodLabel: "Synthetic Term",
    startsOn: "2026-06-08",
    endsOn: "2026-09-15",
    weightPolicyId: "synthetic-policy",
    checkedAt: "synthetic-old-time",
    learnerCount: 0,
    completeGradeCount: 0,
    provisionalGradeCount: 0,
    missingGradeCount: 0,
    missingLrnCount: 0,
    officialFidelity: "not_verified",
    learners: [],
    disclosure: { populatedFields: [], omittedFields: [] },
  },
};
const COMPARISON: ReportCardDraftComparison = {
  draftId: DRAFT.id,
  classRecordId: DRAFT.classRecordId,
  storedSnapshotSha256: DRAFT.snapshotSha256,
  projectionMatches: false,
  changedFields: ["sectionName"],
  comparisonScope: "reporting_projection_only_not_source_lock_or_approval",
  current: { ...DRAFT.snapshot, sectionName: "Current Section", checkedAt: "synthetic-new-time" },
};
function setup(compareReportCardDraft = vi.fn().mockResolvedValue(COMPARISON)) {
  const captureReportCardDraft = vi.fn();
  const exportClassRecordReportCard = vi.fn();
  const service = new ExportApplicationService(
    { exportClassRecordReportCard } as unknown as ExportRepository,
    undefined,
    { captureReportCardDraft, listRecentReportCardDrafts: vi.fn(), compareReportCardDraft },
  );
  const props = { service, draft: DRAFT, revision: 0, disabled: false };
  const view = (changes: Partial<typeof props> = {}) => (
    <ModeProvider>
      <ReportCardDraftComparisonPanel {...props} {...changes} />
    </ModeProvider>
  );
  return {
    ...render(view()),
    view,
    compareReportCardDraft,
    captureReportCardDraft,
    exportClassRecordReportCard,
  };
}
async function compare() {
  await userEvent.click(screen.getByRole("button", { name: "Compare with current reporting" }));
}
describe("ReportCardDraftComparisonPanel", () => {
  afterEach(() => window.localStorage.removeItem("likha-sis:teacher-mode"));
  it.each(["efficient", "comfortable", "guided"])(
    "shows explicit changed projections without writes or approval in %s mode",
    async (mode) => {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const t = setup();
      expect(t.compareReportCardDraft).not.toHaveBeenCalled();
      await compare();
      expect(await screen.findByText(/Current projected evidence differs/)).toBeInTheDocument();
      expect(t.compareReportCardDraft).toHaveBeenCalledExactlyOnceWith("record", "synthetic-draft");
      expect(screen.getByRole("list", { name: "Changed projection fields" })).toHaveTextContent(
        "Section",
      );
      expect(screen.getByText("Retained: Historical Section")).toBeInTheDocument();
      expect(screen.getByText("Current: Current Section")).toBeInTheDocument();
      expect(screen.getByText(/Compared at: synthetic-new-time/)).toBeInTheDocument();
      await userEvent.click(screen.getByText("Current learner evidence and export omissions"));
      expect(screen.getByText(/No current period learners/)).toBeInTheDocument();
      expect(t.captureReportCardDraft).not.toHaveBeenCalled();
      expect(t.exportClassRecordReportCard).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(t.container);
    },
  );
  it("does not turn a projection match into approval and clears it during refresh/failure", async () => {
    setup(
      vi
        .fn()
        .mockResolvedValueOnce({ ...COMPARISON, projectionMatches: true, changedFields: [] })
        .mockRejectedValueOnce(new Error("synthetic")),
    );
    await compare();
    expect(await screen.findByText(/Current projected evidence matches/)).toHaveTextContent(
      "not approval or issuance clearance",
    );
    await compare();
    expect(await screen.findByText(/Comparison could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/Current projected evidence matches/)).not.toBeInTheDocument();
  });
  it("shows missing and retry states without claiming saved data changed", async () => {
    setup(vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(COMPARISON));
    await compare();
    expect(await screen.findByText(/No comparison is available/)).toBeInTheDocument();
    await compare();
    expect(await screen.findByText(/Current projected evidence differs/)).toBeInTheDocument();
  });
  it("exposes current learner evidence, omissions and unknown changed fields truthfully", async () => {
    setup(
      vi.fn().mockResolvedValue({
        ...COMPARISON,
        changedFields: ["learners", "disclosure", "futureField"],
        current: {
          ...COMPARISON.current,
          learners: [
            {
              learnerId: "l-1",
              givenName: "Synthetic",
              familyName: "Learner",
              grade: null,
              issue: "Synthetic missing evidence",
              lrnMissing: true,
            },
          ],
          disclosure: {
            populatedFields: [],
            omittedFields: [{ field: "Synthetic omitted field", reason: "Unverified" }],
          },
        },
      }),
    );
    await compare();
    await screen.findByText(/Current projected evidence differs/);
    expect(screen.getByText("Other projection field: futureField")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Current learner evidence and export omissions"));
    expect(screen.getByText("Synthetic Learner")).toBeInTheDocument();
    expect(screen.getByText("Synthetic missing evidence")).toBeInTheDocument();
    expect(screen.getByText(/Synthetic omitted field/)).toBeInTheDocument();
  });
  it("hides comparisons during writes and after revision/service/draft changes", async () => {
    const t = setup();
    await compare();
    await screen.findByText(/Current projected evidence differs/);
    t.rerender(t.view({ disabled: true }));
    expect(screen.queryByText(/Current projected evidence differs/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare with current reporting" })).toBeDisabled();
    t.rerender(t.view({ revision: 1 }));
    expect(screen.queryByText(/Current projected evidence differs/)).not.toBeInTheDocument();
    await compare();
    await screen.findByText(/Current projected evidence differs/);
    t.rerender(t.view({ service: new ExportApplicationService({} as ExportRepository) }));
    expect(screen.queryByText(/Current projected evidence differs/)).not.toBeInTheDocument();
    t.rerender(t.view({ draft: { ...DRAFT, id: "other-draft" } }));
    expect(screen.queryByText(/Current projected evidence differs/)).not.toBeInTheDocument();
  });
  it("ignores late responses after draft changes or unmount and prevents pending reentry", async () => {
    let resolve!: (value: ReportCardDraftComparison) => void;
    const t = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise<ReportCardDraftComparison>((done) => {
            resolve = done;
          }),
      ),
    );
    await compare();
    expect(screen.getByText("Comparing reporting evidence…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare with current reporting" })).toBeDisabled();
    t.rerender(t.view({ draft: { ...DRAFT, id: "other-draft" } }));
    await act(async () => resolve(COMPARISON));
    expect(screen.queryByText(/Current projected evidence differs/)).not.toBeInTheDocument();
    await compare();
    t.unmount();
    await act(async () => resolve(COMPARISON));
    expect(t.compareReportCardDraft).toHaveBeenCalledTimes(2);
  });
  it("rejects mismatched identities, hashes, scope, fidelity and inconsistent match flags", async () => {
    const invalid = [
      { ...COMPARISON, draftId: "other" },
      { ...COMPARISON, classRecordId: "other" },
      { ...COMPARISON, storedSnapshotSha256: "wrong" },
      { ...COMPARISON, comparisonScope: "approval" },
      { ...COMPARISON, current: { ...COMPARISON.current, classRecordId: "other" } },
      { ...COMPARISON, current: { ...COMPARISON.current, officialFidelity: "verified" } },
      { ...COMPARISON, projectionMatches: true },
    ];
    setup(vi.fn().mockImplementation(async () => invalid.shift()));
    for (let i = 0; i < 7; i++) {
      await compare();
      expect(await screen.findByText(/Comparison could not be loaded/)).toBeInTheDocument();
      expect(screen.queryByText(/Current projected evidence differs/)).not.toBeInTheDocument();
    }
  });
});
