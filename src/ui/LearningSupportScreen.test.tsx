import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClassOccurrenceApplicationService } from "../application/class-occurrence-service";
import { LearnerSupportApplicationService } from "../application/learner-support-service";
import type { LearnerSupportCase } from "../domain/learner-support";
import type { LearnerSupportRepository } from "../domain/ports/learner-support-repository";
import type {
  ClassOccurrence,
  LearnerFollowupMarker,
  OccurrenceOutcome,
} from "../domain/class-occurrence";
import type { ClassOccurrenceRepository } from "../domain/ports/class-occurrence-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LearningSupportScreen } from "./LearningSupportScreen";
import type { SupportTargetMarker } from "./LearningSupportScreen";

function caseFixture(over: Partial<LearnerSupportCase> = {}): LearnerSupportCase {
  return {
    id: "case-1",
    schoolId: "school-1",
    classOccurrenceId: "occ-1",
    sectionMembershipId: "mem-1",
    need: "Cannot read CVC words",
    goal: "Read a short passage independently",
    intervention: "Daily one-on-one reading",
    status: "open",
    participation: null,
    outcome: null,
    openedByUserId: "teacher-1",
    openedAt: "2026-09-09T01:00:00.000Z",
    updatedAt: "2026-09-09T01:00:00.000Z",
    resolvedAt: null,
    learnerGivenName: "Ana",
    learnerFamilyName: "Cruz",
    ...over,
  };
}

class FakeSupportRepository implements LearnerSupportRepository {
  opened: LearnerSupportCase[] = [];
  openResult: LearnerSupportCase | null = caseFixture();
  participationResult: LearnerSupportCase | null = caseFixture({ status: "in_progress" });
  resolveResult: LearnerSupportCase | null = caseFixture({
    status: "resolved",
    participation: "Joined the full session",
    outcome: "Met the goal",
    resolvedAt: "2026-09-09T03:00:00.000Z",
  });
  listed: LearnerSupportCase[] = [];
  refused = false;
  fail = false;

  async openCase(
    classOccurrenceId: string,
    sectionMembershipId: string,
    need: string,
    goal: string,
    intervention: string,
  ) {
    if (this.fail) throw new Error("network");
    if (this.refused) return null;
    const opened = caseFixture({
      classOccurrenceId,
      sectionMembershipId,
      need,
      goal,
      intervention,
    });
    this.opened.push(opened);
    return this.openResult ?? opened;
  }

  async recordParticipation(caseId: string, participation: string) {
    if (this.fail) throw new Error("network");
    if (this.refused) return null;
    const advanced = caseFixture({
      id: caseId,
      status: "in_progress",
      participation,
    });
    this.listed = this.listed.map((existing) => (existing.id === caseId ? advanced : existing));
    return this.participationResult ?? advanced;
  }

  async resolve(caseId: string, outcome: string) {
    if (this.fail) throw new Error("network");
    if (this.refused) return null;
    const resolved = caseFixture({
      id: caseId,
      status: "resolved",
      participation: "Joined the full session",
      outcome,
      resolvedAt: "2026-09-09T03:00:00.000Z",
    });
    this.listed = this.listed.map((existing) => (existing.id === caseId ? resolved : existing));
    return this.resolveResult ?? resolved;
  }

  async listForOccurrence() {
    if (this.fail) throw new Error("network");
    return this.listed;
  }
}

class FakeOccurrenceRepository implements ClassOccurrenceRepository {
  cleared: [string, string][] = [];
  clearFailed = false;

  async start(): Promise<OccurrenceOutcome> {
    throw new Error("unused");
  }
  async capture(): Promise<ClassOccurrence | null> {
    throw new Error("unused");
  }
  async finish(): Promise<OccurrenceOutcome> {
    throw new Error("unused");
  }
  async cancel(): Promise<OccurrenceOutcome> {
    throw new Error("unused");
  }
  async reopen(): Promise<OccurrenceOutcome> {
    throw new Error("unused");
  }
  async getForDate(): Promise<ClassOccurrence | null> {
    throw new Error("unused");
  }
  async listForAssignment(): Promise<ClassOccurrence[]> {
    throw new Error("unused");
  }
  async markFollowup(): Promise<LearnerFollowupMarker | null> {
    throw new Error("unused");
  }
  async clearFollowup(classOccurrenceId: string, sectionMembershipId: string) {
    if (this.clearFailed) throw new Error("network");
    this.cleared.push([classOccurrenceId, sectionMembershipId]);
    return {
      id: "marker-1",
      schoolId: "school-1",
      classOccurrenceId,
      sectionMembershipId,
      reason: "Follow up",
      clearedAt: "2026-09-09T01:00:00.000Z",
      markedAt: "2026-09-09T00:00:00.000Z",
      markedByUserId: "teacher-1",
    };
  }
  async listFollowupMarkers(): Promise<LearnerFollowupMarker[]> {
    throw new Error("unused");
  }
}

function renderScreen(
  support: FakeSupportRepository,
  occurrences: FakeOccurrenceRepository,
  targetMarker: SupportTargetMarker | null = {
    sectionMembershipId: "mem-1",
    learnerGivenName: "Ana",
    learnerFamilyName: "Cruz",
    reason: "Left the exit slip blank",
  },
) {
  return render(
    <ModeProvider>
      <LearningSupportScreen
        learnerSupportService={new LearnerSupportApplicationService(support)}
        classOccurrenceService={new ClassOccurrenceApplicationService(occurrences)}
        classOccurrenceId="occ-1"
        subjectName="Mathematics"
        sectionName="Grade 10 - Rizal"
        occurrenceDate="2026-09-09"
        targetMarker={targetMarker}
        onBack={() => {}}
      />
    </ModeProvider>,
  );
}

describe("LearningSupportScreen", () => {
  it("drafts the need from the marker's reason and saves the plan on one explicit submit", async () => {
    const support = new FakeSupportRepository();
    const occurrences = new FakeOccurrenceRepository();
    const user = userEvent.setup();
    renderScreen(support, occurrences);

    expect(screen.getByRole("button", { name: /Save plan and clear the marker/i })).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("What should change for this learner?"),
      "Read a short passage independently",
    );
    await user.type(screen.getByPlaceholderText("What will you do?"), "Daily one-on-one reading");

    const save = screen.getByRole("button", { name: /Save plan and clear the marker/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() =>
      expect(support.opened).toContainEqual(
        expect.objectContaining({
          classOccurrenceId: "occ-1",
          sectionMembershipId: "mem-1",
          need: "Left the exit slip blank",
          goal: "Read a short passage independently",
          intervention: "Daily one-on-one reading",
        }),
      ),
    );
    expect(occurrences.cleared).toEqual([["occ-1", "mem-1"]]);
  });

  it("keeps the plan when clearing the marker fails", async () => {
    const support = new FakeSupportRepository();
    const occurrences = new FakeOccurrenceRepository();
    occurrences.clearFailed = true;
    const user = userEvent.setup();
    renderScreen(support, occurrences);

    await user.type(screen.getByPlaceholderText("What should change for this learner?"), "Goal");
    await user.type(screen.getByPlaceholderText("What will you do?"), "Intervention");
    const save = screen.getByRole("button", { name: /Save plan and clear the marker/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() => expect(support.opened).toHaveLength(1));
    // The plan was written; the form stays so the marker can be cleared again.
    expect(screen.getByRole("button", { name: /Retry clearing marker/i })).toBeInTheDocument();
  });

  it("says the plan was refused rather than silently saving nothing", async () => {
    const support = new FakeSupportRepository();
    support.refused = true;
    const occurrences = new FakeOccurrenceRepository();
    const user = userEvent.setup();
    renderScreen(support, occurrences);

    await user.type(screen.getByPlaceholderText("What should change for this learner?"), "Goal");
    await user.type(screen.getByPlaceholderText("What will you do?"), "Intervention");
    const save = screen.getByRole("button", { name: /Save plan and clear the marker/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() => expect(screen.getByText(/Saving was not confirmed/i)).toBeInTheDocument());
    expect(occurrences.cleared).toEqual([]);
  });

  it("shows each case's plan and the one action its status permits", async () => {
    const support = new FakeSupportRepository();
    support.listed = [
      caseFixture({ id: "case-1", status: "open" }),
      caseFixture({
        id: "case-2",
        status: "in_progress",
        participation: "Joined the full session",
      }),
      caseFixture({
        id: "case-3",
        status: "resolved",
        participation: "Joined the full session",
        outcome: "Met the goal",
        resolvedAt: "2026-09-09T03:00:00.000Z",
      }),
    ];
    renderScreen(support, new FakeOccurrenceRepository(), null);

    expect((await screen.findAllByText("Ana Cruz")).length).toBe(3);
    expect(screen.getByText("Plan open")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Met the goal")).toBeInTheDocument();
    // A resolved case offers no action; an open one asks for participation.
    expect(screen.getAllByRole("button", { name: /Record (participation|outcome)/i })).toHaveLength(
      2,
    );
  });

  it("advances a case only through the explicit button for its step", async () => {
    const support = new FakeSupportRepository();
    support.listed = [caseFixture({ id: "case-1", status: "open" })];
    const user = userEvent.setup();
    renderScreen(support, new FakeOccurrenceRepository(), null);

    const textarea = await screen.findByPlaceholderText("Record participation to start this plan");
    await user.type(textarea, "Joined the full session");
    await user.click(screen.getByRole("button", { name: /Record participation/i }));

    await waitFor(() =>
      expect(support.listed).toContainEqual(
        expect.objectContaining({ id: "case-1", status: "in_progress" }),
      ),
    );
    // The outcome step is now the one offered.
    expect(
      screen.getByPlaceholderText("Record the outcome to close this plan"),
    ).toBeInTheDocument();
  });

  it("reports a refused transition instead of pretending it succeeded", async () => {
    const support = new FakeSupportRepository();
    support.listed = [caseFixture({ id: "case-1", status: "open" })];
    support.refused = true;
    const user = userEvent.setup();
    renderScreen(support, new FakeOccurrenceRepository(), null);

    await user.type(
      await screen.findByPlaceholderText("Record participation to start this plan"),
      "Joined",
    );
    await user.click(screen.getByRole("button", { name: /Record participation/i }));

    await waitFor(() =>
      expect(screen.getByText(/This step was not confirmed/i)).toBeInTheDocument(),
    );
  });

  it("warns plainly when the case list cannot be loaded", async () => {
    const support = new FakeSupportRepository();
    support.fail = true;
    renderScreen(support, new FakeOccurrenceRepository(), null);

    expect(await screen.findByText(/Could not load the support cases/i)).toBeInTheDocument();
  });

  it("lands on an honest empty state when no plan has been opened", async () => {
    const support = new FakeSupportRepository();
    renderScreen(support, new FakeOccurrenceRepository(), null);

    expect(
      await screen.findByText(/No support plans have been opened for this class yet/i),
    ).toBeInTheDocument();
  });

  it("has no new accessibility violations", async () => {
    const support = new FakeSupportRepository();
    support.listed = [caseFixture({ id: "case-1", status: "open" })];
    const { container } = renderScreen(support, new FakeOccurrenceRepository(), null);

    expect((await screen.findAllByText("Ana Cruz")).length).toBe(1);
    await expectNoAccessibilityViolations(container);
  });
  it("retries marker clearing without opening a duplicate plan", async () => {
    const support = new FakeSupportRepository();
    const occurrences = new FakeOccurrenceRepository();
    occurrences.clearFailed = true;
    const user = userEvent.setup();
    renderScreen(support, occurrences);
    await user.type(screen.getByPlaceholderText("What should change for this learner?"), "Goal");
    await user.type(screen.getByPlaceholderText("What will you do?"), "Intervention");
    await user.click(screen.getByRole("button", { name: "Save plan and clear the marker" }));
    expect(await screen.findByText(/The support plan is saved/)).toBeInTheDocument();
    occurrences.clearFailed = false;
    await user.click(screen.getByRole("button", { name: "Retry clearing marker" }));
    await waitFor(() => expect(occurrences.cleared).toHaveLength(1));
    expect(support.opened).toHaveLength(1);
  });

  it("requires explicit choice before using an existing active plan", async () => {
    const support = new FakeSupportRepository();
    const occurrences = new FakeOccurrenceRepository();
    support.listed = [
      caseFixture({ need: "Left the exit slip blank", goal: "Goal", intervention: "Intervention" }),
    ];
    const user = userEvent.setup();
    renderScreen(support, occurrences);
    await user.type(screen.getByPlaceholderText("What should change for this learner?"), "Goal");
    await user.type(screen.getByPlaceholderText("What will you do?"), "Intervention");
    await user.click(screen.getByRole("button", { name: "Save plan and clear the marker" }));
    expect(support.opened).toHaveLength(0);
    expect(occurrences.cleared).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Use saved plan and clear marker" }));
    await waitFor(() => expect(occurrences.cleared).toHaveLength(1));
    expect(support.opened).toHaveLength(0);
  });

  it("requires a successful read after an ambiguous participation write", async () => {
    const support = new FakeSupportRepository();
    support.listed = [caseFixture()];
    const user = userEvent.setup();
    renderScreen(support, new FakeOccurrenceRepository(), null);
    const field = await screen.findByPlaceholderText("Record participation to start this plan");
    await user.type(field, "Joined activity");
    const write = vi
      .spyOn(support, "recordParticipation")
      .mockRejectedValue(new Error("response lost"));
    await user.click(screen.getByRole("button", { name: "Record participation" }));
    expect(await screen.findByText(/This step may already be recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record participation" })).toBeDisabled();
    support.fail = true;
    await user.click(screen.getByRole("button", { name: "Reload cases" }));
    expect(await screen.findByText(/Could not load the support cases/)).toBeInTheDocument();
    expect(field).toHaveValue("Joined activity");
    expect(screen.getByRole("button", { name: "Record participation" })).toBeDisabled();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
