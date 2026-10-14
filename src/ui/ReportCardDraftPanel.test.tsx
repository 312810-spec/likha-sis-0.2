import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { ReportCardDraft } from "../domain/report-readiness";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ReportCardDraftPanel } from "./ReportCardDraftPanel";

const DRAFT: ReportCardDraft = {
  id: "synthetic-draft",
  classRecordId: "cr-1",
  stage: "draft",
  snapshotSha256: "a".repeat(64),
  createdByUserId: "synthetic-teacher",
  createdAt: "synthetic-save-time",
  snapshot: {
    classRecordId: "cr-1",
    schoolYear: "2026-2027",
    sectionName: "Historical Section",
    subjectName: "Synthetic Subject",
    gradingPeriodLabel: "Synthetic Term",
    startsOn: "2026-06-08",
    endsOn: "2026-09-15",
    checkedAt: "synthetic-check-time",
    weightPolicyId: "synthetic-policy",
    learnerCount: 1,
    missingGradeCount: 1,
    provisionalGradeCount: 0,
    completeGradeCount: 0,
    missingLrnCount: 1,
    officialFidelity: "not_verified",
    learners: [
      {
        learnerId: "l-1",
        givenName: "Earlier",
        familyName: "Learner",
        lrnMissing: true,
        grade: null,
        issue: "Synthetic missing evidence",
      },
    ],
    disclosure: {
      populatedFields: [],
      omittedFields: [{ field: "Synthetic omission", reason: "Not verified" }],
    },
  },
};
function setup(
  captureReportCardDraft = vi.fn().mockResolvedValue(DRAFT),
  listRecentReportCardDrafts = vi.fn().mockResolvedValue([DRAFT]),
) {
  const exports = { exportClassRecordReportCard: vi.fn() };
  const service = new ExportApplicationService(exports as unknown as ExportRepository, undefined, {
    captureReportCardDraft,
    listRecentReportCardDrafts,
    compareReportCardDraft: vi.fn(),
    checkReportCardDraftSource: vi.fn(),
  });
  const props = { service, classRecordId: "cr-1", revision: 0, disabled: false };
  const view = (changes: Partial<typeof props> = {}) => (
    <ModeProvider>
      <ReportCardDraftPanel {...props} {...changes} />
    </ModeProvider>
  );
  return { ...render(view()), view, captureReportCardDraft, listRecentReportCardDrafts, exports };
}
async function capture() {
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Capture preparation draft" }));
}
describe("ReportCardDraftPanel", () => {
  afterEach(() => window.localStorage.removeItem("likha-sis:teacher-mode"));
  it.each(["efficient", "comfortable", "guided"])(
    "requires explicit capture and displays retained evidence accessibly in %s mode",
    async (mode) => {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const t = setup();
      expect(t.captureReportCardDraft).not.toHaveBeenCalled();
      expect(t.listRecentReportCardDrafts).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Capture preparation draft" })).toBeDisabled();
      await capture();
      expect(await screen.findByText(/Preparation draft retained/)).toBeInTheDocument();
      expect(t.captureReportCardDraft).toHaveBeenCalledExactlyOnceWith("cr-1");
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      await userEvent.click(screen.getByText(/Draft · synthetic-save-time/));
      expect(screen.getByText(/Historical Section/)).toBeInTheDocument();
      expect(screen.getByText("Synthetic missing evidence")).toBeInTheDocument();
      expect(screen.getByText(/Saved by account synthetic-teacher/)).toHaveTextContent(
        "Official fidelity is not verified",
      );
      expect(screen.getByText(/Synthetic omission/)).toBeInTheDocument();
      expect(t.exports.exportClassRecordReportCard).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(t.container);
    },
  );
  it("loads bounded history without recapture and supports truthful empty/retry states", async () => {
    const t = setup(
      undefined,
      vi
        .fn()
        .mockRejectedValueOnce(new Error("synthetic"))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([DRAFT]),
    );
    await userEvent.click(screen.getByRole("button", { name: "Load recent drafts" }));
    expect(await screen.findByText(/Recent drafts could not be loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load recent drafts" }));
    expect(await screen.findByText(/Showing 0 recent drafts/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load recent drafts" }));
    expect(await screen.findByText(/Showing 1 recent drafts/)).toHaveTextContent("at most 50");
    expect(t.captureReportCardDraft).not.toHaveBeenCalled();
  });
  it("never automatically retries an uncertain capture and requires renewed confirmation", async () => {
    const t = setup(vi.fn().mockRejectedValue(new Error("synthetic")));
    await capture();
    expect(await screen.findByText(/A draft may have been saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture preparation draft" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Load recent drafts" }));
    await screen.findByText(/Showing 1 recent drafts/);
    expect(t.captureReportCardDraft).toHaveBeenCalledTimes(1);
  });
  it("resets confirmation and hides historical evidence across revisions and pending writes", async () => {
    const t = setup();
    await userEvent.click(screen.getByRole("checkbox"));
    t.rerender(t.view({ revision: 1 }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Load recent drafts" }));
    await screen.findByText(/Showing 1 recent drafts/);
    t.rerender(t.view({ revision: 1, disabled: true }));
    expect(screen.queryByText(/Showing 1 recent drafts/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load recent drafts" })).toBeDisabled();
  });
  it("ignores a late capture after context changes and blocks repeat pending actions", async () => {
    let resolve!: (value: ReportCardDraft) => void;
    const t = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise<ReportCardDraft>((done) => {
            resolve = done;
          }),
      ),
    );
    await capture();
    expect(screen.getByText("Saving preparation draft…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load recent drafts" })).toBeDisabled();
    t.rerender(t.view({ classRecordId: "cr-2", revision: 1 }));
    await act(async () => resolve(DRAFT));
    expect(screen.queryByText(/Preparation draft retained/)).not.toBeInTheDocument();
    expect(t.captureReportCardDraft).toHaveBeenCalledTimes(1);
  });
  it("refuses mismatched record, snapshot, stage or fidelity responses", async () => {
    const wrong = [
      { ...DRAFT, classRecordId: "other" },
      { ...DRAFT, snapshot: { ...DRAFT.snapshot, classRecordId: "other" } },
      { ...DRAFT, stage: "issued" },
      { ...DRAFT, snapshot: { ...DRAFT.snapshot, officialFidelity: "verified" } },
    ];
    setup(
      undefined,
      vi.fn().mockImplementation(async () => [wrong.shift()]),
    );
    for (let i = 0; i < 4; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Load recent drafts" }));
      expect(await screen.findByText(/Recent drafts could not be loaded/)).toBeInTheDocument();
      expect(screen.queryByText(/Draft · synthetic-save-time/)).not.toBeInTheDocument();
    }
  });
  it("does not infer success from a missing capture result", async () => {
    setup(vi.fn().mockResolvedValue(null));
    await capture();
    expect(await screen.findByText(/No draft was returned/)).toBeInTheDocument();
    expect(screen.queryByText(/Preparation draft retained/)).not.toBeInTheDocument();
  });
});
