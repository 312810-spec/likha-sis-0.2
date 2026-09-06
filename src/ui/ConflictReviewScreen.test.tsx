import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConflictReviewApplicationService } from "../application/conflict-review-service";
import type { ConflictResolutionChoice, ConflictReviewSummary } from "../domain/conflict-review";
import type { ConflictReviewRepository } from "../domain/ports/conflict-review-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ConflictReviewScreen } from "./ConflictReviewScreen";

const CONFLICTS: ConflictReviewSummary[] = [
  {
    id: "cr-1",
    entityKind: "learner",
    entityId: "l-1",
    deviceId: "d-1",
    createdAt: "2026-09-01T08:00:00.000Z",
    submittedBaseVersion: 1,
    currentHubVersion: 2,
    incoming: { kind: "learner", givenName: "Anna", familyName: "Cruz", lrn: "123456789012" },
    incomingUnavailableReason: null,
    local: { kind: "learner", givenName: "Ana", familyName: "Cruz", lrn: null },
  },
  {
    id: "cr-2",
    entityKind: "attendance",
    entityId: "a-1",
    deviceId: "d-2",
    createdAt: "2026-09-02T08:00:00.000Z",
    submittedBaseVersion: 3,
    currentHubVersion: 4,
    incoming: null,
    incomingUnavailableReason: "The incoming change could not be decrypted right now.",
    local: {
      kind: "attendance",
      sectionId: "s-1",
      learnerId: "l-2",
      attendanceDate: "2026-09-01",
      status: "Present",
    },
  },
];

class FakeConflictReviewRepository implements ConflictReviewRepository {
  resolveResult: boolean | "reject" = true;
  resolveCalls: Array<{ conflictId: string; resolution: ConflictResolutionChoice }> = [];
  pending = false;

  constructor(private conflicts: ConflictReviewSummary[] = CONFLICTS) {}

  async listConflicts() {
    return this.conflicts;
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolutionChoice) {
    this.resolveCalls.push({ conflictId, resolution });
    if (this.pending) {
      return new Promise<boolean>(() => {});
    }
    if (this.resolveResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.resolveResult;
  }
}

function renderScreen(repo: FakeConflictReviewRepository = new FakeConflictReviewRepository()) {
  return render(
    <ModeProvider>
      <ConflictReviewScreen conflictReviewService={new ConflictReviewApplicationService(repo)} />
    </ModeProvider>,
  );
}

describe("ConflictReviewScreen", () => {
  it("shows an empty state when there are no conflicts", async () => {
    renderScreen(new FakeConflictReviewRepository([]));

    expect(
      await screen.findByText("There are no sync conflicts to review right now."),
    ).toBeInTheDocument();
  });

  it("lists staged conflicts with both versions' concrete field values", async () => {
    renderScreen();

    expect(await screen.findByText("Learner conflict")).toBeInTheDocument();
    expect(screen.getByText("Name: Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText("Name: Anna Cruz")).toBeInTheDocument();
    expect(screen.getByText("Attendance record conflict")).toBeInTheDocument();
  });

  it("discloses when the incoming version cannot be decrypted, instead of hiding it", async () => {
    renderScreen();
    await screen.findByText("Attendance record conflict");

    expect(
      screen.getByText("The incoming change could not be decrypted right now."),
    ).toBeInTheDocument();
  });

  it("shows the local version as absent when this device no longer has a copy", async () => {
    const repo = new FakeConflictReviewRepository([{ ...CONFLICTS[0]!, local: null }]);
    renderScreen(repo);
    await screen.findByText("Learner conflict");

    expect(
      screen.getByText("This device no longer has its own copy of this record."),
    ).toBeInTheDocument();
  });

  it("requires a confirmation step before resolving, and offers both choices", async () => {
    const repo = new FakeConflictReviewRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Learner conflict");

    await user.click(screen.getAllByRole("button", { name: "Resolve this conflict" }).at(0)!);

    expect(
      screen.getByText("Choose which version to keep. This cannot be undone."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep this device's version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use the incoming version" })).toBeInTheDocument();
    expect(repo.resolveCalls).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText("Choose which version to keep. This cannot be undone."),
    ).not.toBeInTheDocument();
    expect(repo.resolveCalls).toHaveLength(0);
  });

  it("resolves by keeping the local version and shows a plain-language confirmation", async () => {
    const repo = new FakeConflictReviewRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Learner conflict");

    await user.click(screen.getAllByRole("button", { name: "Resolve this conflict" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Keep this device's version" }));

    expect(repo.resolveCalls).toEqual([{ conflictId: "cr-1", resolution: "keep_local" }]);
    expect(
      await screen.findByText("Kept this device's own version of the learner."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Learner conflict")).not.toBeInTheDocument();
  });

  it("resolves by using the incoming version and shows a plain-language confirmation", async () => {
    const repo = new FakeConflictReviewRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Learner conflict");

    await user.click(screen.getAllByRole("button", { name: "Resolve this conflict" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Use the incoming version" }));

    expect(repo.resolveCalls).toEqual([{ conflictId: "cr-1", resolution: "use_incoming" }]);
    expect(
      await screen.findByText("Used the incoming version of the learner."),
    ).toBeInTheDocument();
  });

  it("disables 'use the incoming version' when no incoming preview is available, and refuses the click", async () => {
    const repo = new FakeConflictReviewRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Attendance record conflict");

    const resolveButtons = screen.getAllByRole("button", { name: "Resolve this conflict" });
    await user.click(resolveButtons[1]!);

    const useIncomingButton = screen.getByRole("button", { name: "Use the incoming version" });
    expect(useIncomingButton).toHaveAttribute("aria-disabled", "true");

    await user.click(useIncomingButton);
    expect(repo.resolveCalls).toHaveLength(0);
    expect(screen.getByText("Attendance record conflict")).toBeInTheDocument();
  });

  it("shows a generic failure message on a false result", async () => {
    const repo = new FakeConflictReviewRepository();
    repo.resolveResult = false;
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Learner conflict");

    await user.click(screen.getAllByRole("button", { name: "Resolve this conflict" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Keep this device's version" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not resolve this conflict/i);
    expect(screen.getByText("Learner conflict")).toBeInTheDocument();
  });

  it("shows the same generic failure message on a thrown error", async () => {
    const repo = new FakeConflictReviewRepository();
    repo.resolveResult = "reject";
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Learner conflict");

    await user.click(screen.getAllByRole("button", { name: "Resolve this conflict" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Keep this device's version" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not resolve this conflict/i);
  });

  it("shows an error message when loading fails", async () => {
    class FailingRepository extends FakeConflictReviewRepository {
      override async listConflicts(): Promise<ConflictReviewSummary[]> {
        throw new Error("boom");
      }
    }
    render(
      <ModeProvider>
        <ConflictReviewScreen
          conflictReviewService={new ConflictReviewApplicationService(new FailingRepository())}
        />
      </ModeProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen(new FakeConflictReviewRepository([]));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Review Sync Conflicts" })).toHaveFocus(),
    );
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen(new FakeConflictReviewRepository([]));
    await screen.findByText("There are no sync conflicts to review right now.");

    expect(screen.getByText(/a conflict happens when this device changed/i)).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen(new FakeConflictReviewRepository([]));
    await screen.findByText("There are no sync conflicts to review right now.");

    expect(
      screen.queryByText(/a conflict happens when this device changed/i),
    ).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Learner conflict");

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while the confirmation step is open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await screen.findByText("Learner conflict");

    await user.click(screen.getAllByRole("button", { name: "Resolve this conflict" }).at(0)!);
    await expectNoAccessibilityViolations(container);
  });
});
