import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { ReportCardReadiness } from "../domain/report-readiness";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ReportCardReadinessPanel } from "./ReportCardReadinessPanel";

const PREVIEW: ReportCardReadiness = {
  classRecordId: "cr-1",
  schoolYear: "2026-2027",
  sectionName: "Synthetic Section",
  subjectName: "Synthetic Subject",
  gradingPeriodLabel: "Synthetic Term",
  startsOn: "2026-06-08",
  endsOn: "2026-09-15",
  weightPolicyId: "synthetic-policy",
  checkedAt: "synthetic-check-time",
  learnerCount: 2,
  missingGradeCount: 1,
  provisionalGradeCount: 1,
  completeGradeCount: 0,
  missingLrnCount: 1,
  officialFidelity: "not_verified",
  learners: [
    {
      learnerId: "earlier",
      givenName: "Earlier",
      familyName: "Learner",
      lrnMissing: true,
      grade: null,
      issue: "No computable grade; synthetic missing evidence.",
    },
    {
      learnerId: "current",
      givenName: "Current",
      familyName: "Learner",
      lrnMissing: false,
      grade: {
        initialGrade: 80,
        termGrade: 80,
        wasTransmuted: false,
        wasFloored: false,
        complete: false,
      },
      issue: "Provisional grade; synthetic missing scores.",
    },
  ],
  disclosure: {
    populatedFields: [],
    omittedFields: [{ field: "Synthetic omitted field", reason: "Not verified" }],
  },
};

function setup(previewReportCard = vi.fn().mockResolvedValue(PREVIEW)) {
  const exportCall = vi.fn();
  const service = new ExportApplicationService(
    { exportClassRecordReportCard: exportCall } as unknown as ExportRepository,
    { previewReportCard },
  );
  const props = { service, classRecordId: "cr-1", revision: 0, disabled: false };
  const view = (changes: Partial<typeof props> = {}) => (
    <ModeProvider>
      <ReportCardReadinessPanel {...props} {...changes} />
    </ModeProvider>
  );
  return { ...render(view()), view, service, previewReportCard, exportCall };
}

describe("ReportCardReadinessPanel", () => {
  it("keeps an empty full-period roster distinct from approval", async () => {
    const t = setup(
      vi.fn().mockResolvedValue({
        ...PREVIEW,
        learnerCount: 0,
        missingGradeCount: 0,
        provisionalGradeCount: 0,
        completeGradeCount: 0,
        missingLrnCount: 0,
        learners: [],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    expect(
      await screen.findByText("No period learners found. This is not reporting approval."),
    ).toBeInTheDocument();
    expect(t.exportCall).not.toHaveBeenCalled();
  });
  afterEach(() => window.localStorage.removeItem("likha-sis:teacher-mode"));
  it.each(["efficient", "comfortable", "guided"])(
    "shows full-period issues without exporting or certifying in %s mode",
    async (mode) => {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const t = setup();
      expect(t.previewReportCard).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
      expect(await screen.findByText(/2 period learners:/)).toHaveTextContent(
        "1 provisional, 1 unavailable",
      );
      expect(screen.getByText("Earlier Learner")).toBeInTheDocument();
      expect(screen.getByText(/Official fidelity is not verified/)).toBeInTheDocument();
      await userEvent.click(screen.getByText("Export fields still omitted"));
      expect(screen.getByText("Synthetic omitted field")).toBeInTheDocument();
      expect(t.exportCall).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(t.container);
    },
  );
  it("handles missing, failure and retry without retaining an old success", async () => {
    const t = setup(
      vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error("Synthetic failure"))
        .mockResolvedValueOnce(PREVIEW),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    expect(await screen.findByText(/No reporting preview is available/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    await screen.findByText(/2 period learners:/);
    t.rerender(t.view({ revision: 1 }));
    expect(screen.queryByText(/2 period learners:/)).not.toBeInTheDocument();
  });
  it("ignores stale replies after a record/revision switch and prevents repeat pending checks", async () => {
    let resolve!: (value: ReportCardReadiness) => void;
    const t = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise<ReportCardReadiness>((done) => {
            resolve = done;
          }),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    expect(screen.getByRole("button", { name: "Checking reporting…" })).toBeDisabled();
    expect(screen.getByText("Loading reporting preview…")).toBeInTheDocument();
    t.rerender(t.view({ classRecordId: "cr-2", revision: 1 }));
    await act(async () => resolve(PREVIEW));
    expect(screen.queryByText(/2 period learners:/)).not.toBeInTheDocument();
    expect(t.previewReportCard).toHaveBeenCalledTimes(1);
  });
  it("hides a prior snapshot during writes and refuses a mismatched response identity", async () => {
    const t = setup(
      vi
        .fn()
        .mockResolvedValueOnce(PREVIEW)
        .mockResolvedValueOnce({ ...PREVIEW, classRecordId: "other-record" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    await screen.findByText(/2 period learners:/);
    t.rerender(t.view({ disabled: true }));
    expect(screen.queryByText(/2 period learners:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check reporting preparation" })).toBeDisabled();
    t.rerender(t.view({ revision: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/2 period learners:/)).not.toBeInTheDocument();
  });
});
