import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SyncStatusApplicationService } from "../application/sync-status-service";
import type { SyncStatus } from "../domain/sync-status";
import type { SyncStatusRepository } from "../domain/ports/sync-status-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SyncStatusScreen } from "./SyncStatusScreen";

const ENROLLED_STATUS: SyncStatus = {
  enrolled: true,
  lastPullAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  pendingChangeCount: 3,
  hasPendingSyncTrouble: false,
  openConflictCount: 2,
};

class FakeSyncStatusRepository implements SyncStatusRepository {
  constructor(private result: SyncStatus | "reject" = ENROLLED_STATUS) {}

  async getStatus(): Promise<SyncStatus> {
    if (this.result === "reject") {
      throw new Error("could not load sync status");
    }
    return this.result;
  }
}

function renderScreen(
  repo: FakeSyncStatusRepository = new FakeSyncStatusRepository(),
  onReviewConflicts: () => void = () => {},
) {
  return render(
    <ModeProvider>
      <SyncStatusScreen
        syncStatusService={new SyncStatusApplicationService(repo)}
        onReviewConflicts={onReviewConflicts}
      />
    </ModeProvider>,
  );
}

describe("SyncStatusScreen", () => {
  it("shows a plain-language 'not enrolled' state when this device is not enrolled", async () => {
    renderScreen(
      new FakeSyncStatusRepository({
        enrolled: false,
        lastPullAt: null,
        pendingChangeCount: 0,
        hasPendingSyncTrouble: false,
        openConflictCount: 0,
      }),
    );

    expect(
      await screen.findByText(
        "This device is not set up to sync your school’s records with other devices. See Devices to enroll it.",
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it("shows last-synced, pending change count, and open conflict count for an enrolled device", async () => {
    renderScreen();

    expect(await screen.findByText("3 changes waiting to sync")).toBeInTheDocument();
    expect(screen.getByText("Received an update 2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("2 conflicts need your review")).toBeInTheDocument();
  });

  it("says no changes are pending and no conflicts exist for a fully caught-up device", async () => {
    renderScreen(
      new FakeSyncStatusRepository({
        enrolled: true,
        lastPullAt: null,
        pendingChangeCount: 0,
        hasPendingSyncTrouble: false,
        openConflictCount: 0,
      }),
    );

    expect(await screen.findByText("All changes are synced")).toBeInTheDocument();
    expect(screen.getByText("No sync conflicts")).toBeInTheDocument();
    expect(
      screen.getByText("This device has not received any updates from another device yet."),
    ).toBeInTheDocument();
  });

  it("surfaces sync trouble in plain language when pending changes are failing to send", async () => {
    renderScreen(
      new FakeSyncStatusRepository({
        ...ENROLLED_STATUS,
        hasPendingSyncTrouble: true,
      }),
    );

    expect(
      await screen.findByText("This device is having trouble reaching the sync hub.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("navigates to conflict review when the review-conflicts action is used", async () => {
    const user = userEvent.setup();
    const onReviewConflicts = vi.fn();
    renderScreen(new FakeSyncStatusRepository(), onReviewConflicts);

    await user.click(await screen.findByRole("button", { name: "Review conflicts" }));

    expect(onReviewConflicts).toHaveBeenCalledTimes(1);
  });

  it("shows a retry action when loading fails", async () => {
    renderScreen(new FakeSyncStatusRepository("reject"));

    expect(
      await screen.findByText("Could not load this device's sync status."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("has no structural accessibility violations in its loaded state", async () => {
    const { container } = renderScreen();
    await screen.findByText("3 changes waiting to sync");

    await expectNoAccessibilityViolations(container);
  });
});
