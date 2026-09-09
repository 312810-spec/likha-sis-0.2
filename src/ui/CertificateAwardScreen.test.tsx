import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AnecdotalRecordApplicationService } from "../application/anecdotal-record-service";
import { ClassRecordApplicationService } from "../application/class-record-service";
import { LearnerScoreApplicationService } from "../application/learner-score-service";
import { SectionApplicationService } from "../application/section-service";
import type { ComputedTermGrade } from "../domain/learner-score";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type { AnecdotalRecordRepository } from "../domain/ports/anecdotal-record-repository";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
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
import { CertificateAwardScreen } from "./CertificateAwardScreen";
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
    lrn: "123456789012",
    startsOn: "2026-06-08",
  } as SectionRosterMember,
  {
    membershipId: "m2",
    learnerId: "l2",
    givenName: "Ben",
    familyName: "Santos",
    lrn: "123456789013",
    startsOn: "2026-06-08",
  } as SectionRosterMember,
];

const CLASS_RECORD: ClassRecordDetail = {
  id: "cr1",
  schoolId: "s1",
  sectionId: "sec1",
  sectionName: "Rizal",
  subjectId: "sub1",
  subjectName: "Math",
  gradingPeriodId: "gp1",
  gradingPeriodLabel: "1st Term",
  schoolYear: "2026-2027",
  weightPolicyId: "wp1",
  weightPolicyName: "Default",
  createdAt: "now",
  itemCount: 2,
  recordedCount: 2,
  totalEligible: 2,
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
    return [CLASS_RECORD];
  }
  async create(): Promise<ClassRecord | null> {
    throw new Error("not used in this test");
  }
  async listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return [];
  }
}

/** l1 is above the (unverified default) threshold on every leg; l2 fails
 * the general-average leg. */
class FakeLearnerScoreRepository implements LearnerScoreRepository {
  async rosterForItem(): ReturnType<LearnerScoreRepository["rosterForItem"]> {
    throw new Error("not used in this test");
  }
  async record(): ReturnType<LearnerScoreRepository["record"]> {
    throw new Error("not used in this test");
  }
  async computeTermGrade(
    _classRecordId: string,
    learnerId: string,
  ): Promise<ComputedTermGrade | null> {
    const termGrade = learnerId === "l1" ? 95 : 70;
    return { initialGrade: termGrade, termGrade, wasTransmuted: false, wasFloored: false };
  }
}

/** By default no learner has a disqualifying anecdotal record; pass
 * `disqualifiedLearnerIds` to simulate one, per Batch 13's real
 * anecdote-check wiring (ADR-0084). */
class FakeAnecdotalRecordRepository implements AnecdotalRecordRepository {
  constructor(private readonly disqualifiedLearnerIds: ReadonlySet<string> = new Set()) {}

  record(): ReturnType<AnecdotalRecordRepository["record"]> {
    throw new Error("not used in this test");
  }
  listForSection(): ReturnType<AnecdotalRecordRepository["listForSection"]> {
    throw new Error("not used in this test");
  }
  addFollowup(): ReturnType<AnecdotalRecordRepository["addFollowup"]> {
    throw new Error("not used in this test");
  }
  listFollowups(): ReturnType<AnecdotalRecordRepository["listFollowups"]> {
    throw new Error("not used in this test");
  }
  async hasCategoryForLearner(_sectionId: string, learnerId: string): Promise<boolean> {
    return this.disqualifiedLearnerIds.has(learnerId);
  }
}

function renderScreen(disqualifiedLearnerIds: readonly string[] = []) {
  const sectionService = new SectionApplicationService(new FakeSectionRepository());
  const classRecordService = new ClassRecordApplicationService(new FakeClassRecordRepository());
  const learnerScoreService = new LearnerScoreApplicationService(new FakeLearnerScoreRepository());
  const anecdotalRecordService = new AnecdotalRecordApplicationService(
    new FakeAnecdotalRecordRepository(new Set(disqualifiedLearnerIds)),
  );
  return render(
    <ModeProvider>
      <CertificateAwardScreen
        sectionService={sectionService}
        classRecordService={classRecordService}
        learnerScoreService={learnerScoreService}
        anecdotalRecordService={anecdotalRecordService}
        schoolName="Mabini Elementary School"
      />
    </ModeProvider>,
  );
}

describe("CertificateAwardScreen", () => {
  it("shows the GA-threshold and anecdote-disqualification-rule disclosures up front", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Certificates & Awards" });
    expect(
      screen.getByText(/not been\s+verified against a primary DepEd source/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/disciplinary\/anecdotal-record disqualification rule/i),
    ).toBeInTheDocument();
  });

  it("computes eligibility and only offers a certificate to eligible learners", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Certificates & Awards" });

    await user.click(screen.getByRole("button", { name: /compute eligibility/i }));

    const anaRow = (await screen.findByText("Ana Reyes")).closest("tr")!;
    expect(within(anaRow).getByRole("button", { name: /print certificate/i })).toBeInTheDocument();

    const benRow = screen.getByText("Ben Santos").closest("tr")!;
    expect(
      within(benRow).queryByRole("button", { name: /print certificate/i }),
    ).not.toBeInTheDocument();
    expect(within(benRow).getByText(/below the configured threshold/i)).toBeInTheDocument();
  });

  it("excludes a learner who otherwise meets both grade legs but has a disqualifying anecdotal record", async () => {
    const user = userEvent.setup();
    // Ana (l1) meets both grade legs per FakeLearnerScoreRepository, but
    // is given a disqualifying-category anecdotal record here.
    renderScreen(["l1"]);
    await screen.findByRole("heading", { name: "Certificates & Awards" });

    await user.click(screen.getByRole("button", { name: /compute eligibility/i }));

    const anaRow = (await screen.findByText("Ana Reyes")).closest("tr")!;
    expect(
      within(anaRow).queryByRole("button", { name: /print certificate/i }),
    ).not.toBeInTheDocument();
    expect(within(anaRow).getByText(/disqualifying category/i)).toBeInTheDocument();
  });

  it("is still eligible when the learner has no disqualifying anecdotal record", async () => {
    const user = userEvent.setup();
    renderScreen([]);
    await screen.findByRole("heading", { name: "Certificates & Awards" });

    await user.click(screen.getByRole("button", { name: /compute eligibility/i }));

    const anaRow = (await screen.findByText("Ana Reyes")).closest("tr")!;
    expect(within(anaRow).getByRole("button", { name: /print certificate/i })).toBeInTheDocument();
  });

  it("renders both disclosures on the printed certificate itself", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Certificates & Awards" });
    await user.click(screen.getByRole("button", { name: /compute eligibility/i }));
    const anaRow = (await screen.findByText("Ana Reyes")).closest("tr")!;
    await user.click(within(anaRow).getByRole("button", { name: /print certificate/i }));

    await screen.findByRole("heading", { name: "Academic Excellence Certificate" });
    expect(
      screen.getByText(/not been\s+verified against a primary DepEd source/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/disciplinary\/anecdotal-record disqualification rule/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Reyes")).toBeInTheDocument();
  });

  it("has no axe-detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("heading", { name: "Certificates & Awards" });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    await expectNoAccessibilityViolations(container);
  });
});
