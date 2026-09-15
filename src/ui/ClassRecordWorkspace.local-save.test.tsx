import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ExportApplicationService } from "../application/export-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { AssessmentCategorySet, AssessmentItemDetail } from "../domain/assessment";
import type { LearnerScoreRosterEntry } from "../domain/learner-score";
import { ClassRecordWorkspace } from "./ClassRecordWorkspace";
import { ModeProvider } from "./theme/ModeContext";

const ITEM: AssessmentItemDetail = {
  id: "item-1",
  schoolId: "school-1",
  classRecordId: "record-1",
  categoryId: "category-1",
  categoryName: "Written Works",
  name: "Quiz 1",
  maxScore: 20,
  createdAt: "2026-09-15T09:00:00.000Z",
  recordedCount: 0,
  totalEligible: 1,
};

const CATEGORY_SET: AssessmentCategorySet = {
  id: "set-1",
  name: "Synthetic DepEd weighting",
  sourceCitation: "Synthetic fixture only",
  isDefault: true,
  createdAt: "2026-09-15T09:00:00.000Z",
};

const ROSTER_ENTRY: LearnerScoreRosterEntry = {
  learnerId: "learner-1",
  givenName: "Ana",
  familyName: "Cruz",
  status: null,
  score: null,
  updatedAt: null,
};

function renderWorkspace() {
  const assessmentService = {
    listItemsByClassRecord: vi.fn().mockResolvedValue([ITEM]),
    listCategorySets: vi.fn().mockResolvedValue([CATEGORY_SET]),
    listCategoriesForSet: vi.fn().mockResolvedValue([
      { id: "category-1", setId: "set-1", sequence: 1, name: "Written Works" },
    ]),
  } as unknown as AssessmentApplicationService;

  const learnerScoreService = {
    rosterForItem: vi.fn().mockResolvedValue([ROSTER_ENTRY]),
    recordScore: vi.fn().mockResolvedValue({
      id: "score-1",
      schoolId: "school-1",
      assessmentItemId: "item-1",
      learnerId: "learner-1",
      status: "scored",
      score: 18,
      updatedAt: "2026-09-15T09:30:00.000Z",
    }),
  } as unknown as LearnerScoreApplicationService;

  const exportService = {} as ExportApplicationService;

  render(
    <ModeProvider>
      <ClassRecordWorkspace
        classRecordId="record-1"
        weightPolicyName="Synthetic weighting"
        assessmentService={assessmentService}
        learnerScoreService={learnerScoreService}
        exportService={exportService}
      />
    </ModeProvider>,
  );

  return { learnerScoreService };
}

describe("ClassRecordWorkspace local-save state", () => {
  it("shows the proven device-save state after a successful score write without claiming sync", async () => {
    const user = userEvent.setup();
    const { learnerScoreService } = renderWorkspace();

    await user.click(await screen.findByRole("button", { name: /Written Works — Quiz 1/ }));
    const scoreInput = await screen.findByLabelText("Score for Ana Cruz");
    await user.type(scoreInput, "18");
    await user.keyboard("{Enter}");

    expect(learnerScoreService.recordScore).toHaveBeenCalled();
    expect(await screen.findByText("Saved on this device")).toBeInTheDocument();
    expect(screen.queryByText(/synced|waiting to sync/i)).not.toBeInTheDocument();
  });
});
