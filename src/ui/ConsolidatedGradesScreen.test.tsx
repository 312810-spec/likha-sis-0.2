import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClassRecordApplicationService } from "../application/class-record-service";
import { LearnerScoreApplicationService } from "../application/learner-score-service";
import { SectionApplicationService } from "../application/section-service";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { ComputedTermGrade } from "../domain/learner-score";
import type {
  CorrectPlacementResult,
  EndEnrollmentResult,
  EnrollMembershipResult,
  EnrollmentCandidate,
  Section,
  SectionMembership,
  SectionRosterMember,
  TransferResult,
} from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ConsolidatedGradesScreen } from "./ConsolidatedGradesScreen";
import { ModeProvider } from "./theme/ModeContext";

const SECTION: Section = {
  id: "sec1",
  schoolId: "s1",
  schoolYear: "2026-2027",
  gradeLevel: "Grade 7",
  name: "Rizal",
  createdAt: "now",
};

const ROSTER: SectionRosterMember[] = [
  {
    membershipId: "m1",
    learnerId: "l1",
    givenName: "Ana",
    familyName: "Reyes",
    lrn: null,
    startsOn: "2026-06-08",
  },
];

const MATH_RECORD: ClassRecordDetail = {
  id: "cr-math",
  schoolId: "s1",
  sectionId: "sec1",
  sectionName: "Rizal",
  subjectId: "sub-math",
  subjectName: "Math",
  gradingPeriodId: "gp1",
  gradingPeriodLabel: "1st Term",
  schoolYear: "2026-2027",
  weightPolicyId: "wp1",
  weightPolicyName: "Default",
  createdAt: "now",
  itemCount: 1,
  recordedCount: 1,
  totalEligible: 1,
};

class FakeSectionRepository implements SectionRepository {
  async list(): Promise<Section[]> {
    return [SECTION];
  }
  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }
  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }
  async roster(): Promise<SectionRosterMember[]> {
    return ROSTER;
  }
  async transferMembership(): Promise<TransferResult> {
    throw new Error("not used in this test");
  }
  async endMembership(): Promise<EndEnrollmentResult> {
    throw new Error("not used in this test");
  }
  async listEnrollableLearners(): Promise<EnrollmentCandidate[]> {
    throw new Error("not used in this test");
  }
  async enrollMembership(): Promise<EnrollMembershipResult> {
    throw new Error("not used in this test");
  }
  async correctSameDayPlacement(): Promise<CorrectPlacementResult> {
    throw new Error("not used in this test");
  }
}

class FakeClassRecordRepository implements ClassRecordRepository {
  async list(): Promise<ClassRecordDetail[]> {
    return [MATH_RECORD];
  }
  async create(): Promise<ClassRecord | null> {
    throw new Error("not used in this test");
  }
  async listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return [];
  }
}

class FakeLearnerScoreRepository implements LearnerScoreRepository {
  async rosterForItem(): ReturnType<LearnerScoreRepository["rosterForItem"]> {
    throw new Error("not used in this test");
  }
  async record(): ReturnType<LearnerScoreRepository["record"]> {
    throw new Error("not used in this test");
  }
  async computeTermGrade(): Promise<ComputedTermGrade | null> {
    return { initialGrade: 88, termGrade: 88, wasTransmuted: false, wasFloored: false };
  }
}

function renderScreen() {
  const sectionService = new SectionApplicationService(new FakeSectionRepository());
  const classRecordService = new ClassRecordApplicationService(new FakeClassRecordRepository());
  const learnerScoreService = new LearnerScoreApplicationService(new FakeLearnerScoreRepository());
  return render(
    <ModeProvider>
      <ConsolidatedGradesScreen
        sectionService={sectionService}
        classRecordService={classRecordService}
        learnerScoreService={learnerScoreService}
      />
    </ModeProvider>,
  );
}

describe("ConsolidatedGradesScreen", () => {
  it("builds a section x subject x term matrix from computed term grades", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Consolidated Grades Matrix" });

    await user.click(screen.getByRole("button", { name: /build matrix/i }));

    expect(await screen.findByText("Ana Reyes")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Math" })).toBeInTheDocument();
    expect(screen.getAllByText("88.00").length).toBeGreaterThanOrEqual(1);
  });

  it("has no axe-detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("heading", { name: "Consolidated Grades Matrix" });
    await expectNoAccessibilityViolations(container);
  });
});
