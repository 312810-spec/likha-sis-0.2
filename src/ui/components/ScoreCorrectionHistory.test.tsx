import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { LearnerScoreApplicationService } from "../../application/learner-score-service";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreCorrection,
  LearnerScoreRosterEntry,
} from "../../domain/learner-score";
import type { LearnerScoreRepository } from "../../domain/ports/learner-score-repository";
import { expectNoAccessibilityViolations } from "../../test/a11y";
import { ScoreCorrectionHistory } from "./ScoreCorrectionHistory";

/** Only the one method this surface needs is exercised; the rest are
 * stand-ins so the service's real dependency shape is satisfied. */
class FakeLearnerScoreRepository implements LearnerScoreRepository {
  correctionHistoryResult: LearnerScoreCorrection[] = [];
  correctionHistoryCalls = 0;
  rejectHistory = false;

  async rosterForItem(): Promise<LearnerScoreRosterEntry[] | null> {
    return [];
  }
  async record(): Promise<LearnerScore | null> {
    return null;
  }
  async correctionHistory(assessmentItemId: string, learnerId: string) {
    this.correctionHistoryCalls += 1;
    if (this.rejectHistory) throw new Error("the hub is unreachable");
    return this.correctionHistoryResult.filter(
      (entry) => entry.assessmentItemId === assessmentItemId && entry.learnerId === learnerId,
    );
  }
  async computeTermGrade(): Promise<ComputedTermGrade | null> {
    return null;
  }
}

function oneCorrection(overrides: Partial<LearnerScoreCorrection> = {}): LearnerScoreCorrection {
  return {
    id: "corr-1",
    assessmentItemId: "ai-1",
    learnerId: "l-1",
    previousStatus: "scored",
    previousScore: 15,
    previousRecordedByUserId: "u-1",
    previousRecordedByName: "Ana Santos",
    previousRecordedAt: "2026-10-01T09:00:00Z",
    newStatus: "scored",
    newScore: 19,
    correctedByUserId: "u-2",
    correctedByName: "Ben Reyes",
    reason: "Rechecked after a recount of the written work",
    correctedAt: "2026-10-06T14:30:00Z",
    ...overrides,
  };
}

/** The change line renders "15 → <strong>19</strong>", so the previous and
 * new values are separate text nodes and a plain getByText cannot match the
 * whole string. Read the paragraph's own textContent instead. */
function changeLineText(): string {
  const line = screen.getByText((_content, element) =>
    Boolean(element?.classList.contains("correction-history-change")),
  );
  return line.textContent ?? "";
}

function renderHistory(repo: FakeLearnerScoreRepository = new FakeLearnerScoreRepository()) {
  const service = new LearnerScoreApplicationService(repo);
  const result = render(
    <ScoreCorrectionHistory
      service={service}
      assessmentItemId="ai-1"
      learnerId="l-1"
      learnerName="Ana Cruz"
    />,
  );
  return { ...result, repo };
}

it("does not fetch the lineage until the teacher opens it", () => {
  const { repo } = renderHistory();

  expect(repo.correctionHistoryCalls).toBe(0);
  expect(
    screen.getByRole("button", { name: /correction history for ana cruz/i }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/no corrections recorded/i)).not.toBeInTheDocument();
});

it("renders the lineage with both authors, the reason, and the superseded and new values", async () => {
  const user = userEvent.setup();
  const repo = new FakeLearnerScoreRepository();
  repo.correctionHistoryResult = [oneCorrection()];
  renderHistory(repo);

  await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));

  await waitFor(() => expect(changeLineText()).toBe("15 → 19"));
  expect(screen.getByText(/rechecked after a recount of the written work/i)).toBeInTheDocument();
  // The correcting teacher is named, not keyed — and the original recorder's
  // name is shown too, since they can differ.
  expect(screen.getByText(/ben reyes/i)).toBeInTheDocument();
  expect(screen.getByText(/was recorded by ana santos/i)).toBeInTheDocument();
  expect(repo.correctionHistoryCalls).toBe(1);
});

it("names the author even when the previous recorder and the corrector are the same person", async () => {
  const user = userEvent.setup();
  const repo = new FakeLearnerScoreRepository();
  repo.correctionHistoryResult = [
    oneCorrection({ correctedByUserId: "u-1", correctedByName: "Ana Santos" }),
  ];
  renderHistory(repo);

  await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));

  await waitFor(() => expect(changeLineText()).toBe("15 → 19"));
  expect(screen.getByText(/^ana santos ·/i)).toBeInTheDocument();
  // Both authors are the same person, so the "was recorded by" clause is
  // redundant noise and is omitted rather than repeated.
  expect(screen.queryByText(/was recorded by/i)).not.toBeInTheDocument();
});

it("renders an Excused or N/A change in words rather than a bare number", async () => {
  const user = userEvent.setup();
  const repo = new FakeLearnerScoreRepository();
  repo.correctionHistoryResult = [oneCorrection({ newStatus: "excused", newScore: null })];
  renderHistory(repo);

  await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));

  await waitFor(() => expect(changeLineText()).toBe("15 → Excused"));
});

it("says so plainly when a score has never been corrected", async () => {
  const user = userEvent.setup();
  renderHistory();

  await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));

  expect(await screen.findByText(/no corrections recorded for this score/i)).toBeInTheDocument();
});

it("explains a failed load instead of silently omitting the history", async () => {
  const user = userEvent.setup();
  const repo = new FakeLearnerScoreRepository();
  repo.rejectHistory = true;
  renderHistory(repo);

  await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));

  expect(await screen.findByText(/could not load the correction history/i)).toBeInTheDocument();
});

it("has no detectable accessibility violations", async () => {
  const user = userEvent.setup();
  const repo = new FakeLearnerScoreRepository();
  repo.correctionHistoryResult = [oneCorrection()];
  const { container } = renderHistory(repo);

  await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));
  await waitFor(() => expect(changeLineText()).toBe("15 → 19"));

  await expectNoAccessibilityViolations(container);
});
