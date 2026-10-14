import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { ReportCardDraftSourceCheck } from "../domain/report-readiness";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ReportCardDraftSourcePanel } from "./ReportCardDraftSourcePanel";

const MATCH: ReportCardDraftSourceCheck = {
  draftId: "synthetic-draft",
  classRecordId: "record",
  sourceStatus: "matches",
  sourceVersion: "report-card-readiness-source-v1",
  storedSourceSha256: "a".repeat(64),
  currentSourceSha256: "a".repeat(64),
};
const CHANGED: ReportCardDraftSourceCheck = {
  ...MATCH,
  sourceStatus: "changed",
  currentSourceSha256: "b".repeat(64),
};
const LEGACY: ReportCardDraftSourceCheck = {
  ...MATCH,
  sourceStatus: "legacy_unavailable",
  sourceVersion: null,
  storedSourceSha256: null,
  currentSourceSha256: null,
};
const UNSUPPORTED: ReportCardDraftSourceCheck = {
  ...MATCH,
  sourceStatus: "unsupported_version",
  sourceVersion: "synthetic-future-version",
  currentSourceSha256: null,
};
function setup(checkReportCardDraftSource = vi.fn().mockResolvedValue(MATCH)) {
  const captureReportCardDraft = vi.fn();
  const exports = { exportClassRecordReportCard: vi.fn() };
  const service = new ExportApplicationService(exports as unknown as ExportRepository, undefined, {
    captureReportCardDraft,
    listRecentReportCardDrafts: vi.fn(),
    compareReportCardDraft: vi.fn(),
    checkReportCardDraftSource,
  });
  const props = {
    service,
    classRecordId: "record",
    draftId: "synthetic-draft",
    revision: 0,
    disabled: false,
  };
  const view = (changes: Partial<typeof props> = {}) => (
    <ModeProvider>
      <ReportCardDraftSourcePanel {...props} {...changes} />
    </ModeProvider>
  );
  return { ...render(view()), view, checkReportCardDraftSource, captureReportCardDraft, exports };
}
async function check() {
  await userEvent.click(screen.getByRole("button", { name: "Check captured readiness inputs" }));
}
describe("ReportCardDraftSourcePanel", () => {
  afterEach(() => window.localStorage.removeItem("likha-sis:teacher-mode"));
  it.each(["efficient", "comfortable", "guided"])(
    "keeps all four evidence states accessible and non-approving in %s mode",
    async (mode) => {
      window.localStorage.setItem("likha-sis:teacher-mode", mode);
      const t = setup(
        vi
          .fn()
          .mockResolvedValueOnce(MATCH)
          .mockResolvedValueOnce(CHANGED)
          .mockResolvedValueOnce(LEGACY)
          .mockResolvedValueOnce(UNSUPPORTED),
      );
      expect(t.checkReportCardDraftSource).not.toHaveBeenCalled();
      await check();
      expect(await screen.findByText(/Captured readiness inputs match/)).toHaveTextContent(
        "Not reviewed, approved or issued",
      );
      await userEvent.click(screen.getByText("Input fingerprint identities"));
      expect(screen.getByText(/Protocol: report-card-readiness-source-v1/)).toBeInTheDocument();
      await expectNoAccessibilityViolations(t.container);
      await check();
      expect(
        await screen.findByText(/Readiness inputs or implementation changed/),
      ).toBeInTheDocument();
      await expectNoAccessibilityViolations(t.container);
      await check();
      expect(await screen.findByText(/This legacy draft has no captured/)).toHaveTextContent(
        "Nothing was backfilled",
      );
      expect(screen.queryByText("Input fingerprint identities")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(t.container);
      await check();
      expect(
        await screen.findByText(/captured source protocol is unsupported/),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByText("Input fingerprint identities"));
      expect(screen.getByText(/Protocol: synthetic-future-version/)).toBeInTheDocument();
      await expectNoAccessibilityViolations(t.container);
      expect(t.checkReportCardDraftSource).toHaveBeenCalledWith("record", "synthetic-draft");
      expect(t.captureReportCardDraft).not.toHaveBeenCalled();
      expect(t.exports.exportClassRecordReportCard).not.toHaveBeenCalled();
    },
  );
  it("clears an earlier match on missing/error and allows explicit retry", async () => {
    setup(
      vi
        .fn()
        .mockResolvedValueOnce(MATCH)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error("synthetic"))
        .mockResolvedValueOnce(CHANGED),
    );
    await check();
    await screen.findByText(/Captured readiness inputs match/);
    await check();
    expect(await screen.findByText(/No input check is available/)).toBeInTheDocument();
    expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
    await check();
    expect(await screen.findByText(/input check could not be loaded/)).toBeInTheDocument();
    await check();
    expect(
      await screen.findByText(/Readiness inputs or implementation changed/),
    ).toBeInTheDocument();
  });
  it("drops old evidence across revisions, identities, services and pending writes", async () => {
    const t = setup();
    await check();
    await screen.findByText(/Captured readiness inputs match/);
    t.rerender(t.view({ disabled: true }));
    expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check captured readiness inputs" })).toBeDisabled();
    t.rerender(t.view({ revision: 1 }));
    expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
    await check();
    await screen.findByText(/Captured readiness inputs match/);
    t.rerender(t.view({ classRecordId: "other-record", draftId: "other-draft" }));
    expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
    t.rerender(t.view({ service: new ExportApplicationService({} as ExportRepository) }));
    expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
  });
  it("ignores late replies after context changes/unmount and blocks pending repetition", async () => {
    let resolve!: (value: ReportCardDraftSourceCheck) => void;
    const t = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise<ReportCardDraftSourceCheck>((done) => {
            resolve = done;
          }),
      ),
    );
    await check();
    expect(screen.getByText("Checking captured readiness inputs…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check captured readiness inputs" })).toBeDisabled();
    t.rerender(t.view({ draftId: "other-draft" }));
    await act(async () => resolve(MATCH));
    expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
    await check();
    t.unmount();
    await act(async () => resolve(MATCH));
    expect(t.checkReportCardDraftSource).toHaveBeenCalledTimes(2);
  });
  it("refuses mismatched identities and malformed/inconsistent protocol evidence", async () => {
    const invalid = [
      { ...MATCH, draftId: "other" },
      { ...MATCH, classRecordId: "other" },
      { ...MATCH, sourceStatus: "approved" },
      { ...MATCH, sourceVersion: "unknown" },
      { ...MATCH, storedSourceSha256: "malformed" },
      { ...MATCH, currentSourceSha256: "b".repeat(64) },
      { ...CHANGED, currentSourceSha256: MATCH.storedSourceSha256 },
      { ...LEGACY, storedSourceSha256: MATCH.storedSourceSha256 },
      { ...UNSUPPORTED, currentSourceSha256: MATCH.currentSourceSha256 },
      { ...UNSUPPORTED, sourceVersion: MATCH.sourceVersion },
    ];
    setup(vi.fn().mockImplementation(async () => invalid.shift()));
    for (let i = 0; i < 10; i++) {
      await check();
      expect(await screen.findByText(/input check could not be loaded/)).toBeInTheDocument();
      expect(screen.queryByText(/Captured readiness inputs match/)).not.toBeInTheDocument();
    }
  });
});
