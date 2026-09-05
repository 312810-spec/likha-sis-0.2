import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DeviceSyncApplicationService } from "../application/device-sync-service";
import type { DeviceSyncRepository } from "../domain/ports/device-sync-repository";
import type { DeviceSyncCredential } from "../domain/device-sync-credential";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { DeviceManagementScreen } from "./DeviceManagementScreen";

const DEVICES: DeviceSyncCredential[] = [
  {
    credentialId: "cred-1",
    deviceLabel: "Front Office PC",
    ownerDisplayName: "Ana Cruz",
    ownerUsername: "ana.cruz",
    createdAt: "2026-08-25T08:00:00.000Z",
    lastUsedAt: "2026-09-01T10:00:00.000Z",
  },
  {
    credentialId: "cred-2",
    deviceLabel: null,
    ownerDisplayName: "Bo Reyes",
    ownerUsername: "bo.reyes",
    createdAt: "2026-08-26T08:00:00.000Z",
    lastUsedAt: null,
  },
];

class FakeDeviceSyncRepository implements DeviceSyncRepository {
  revokeResult: boolean | "reject" = true;
  revokeCalls: string[] = [];
  /** When set, `revokeDevice` never resolves on its own -- the test
   * controls completion, matching `AdminPasswordResetScreen.test.tsx`'s
   * established convention for proving an in-flight guard. */
  pending = false;

  constructor(private devices: DeviceSyncCredential[] = DEVICES) {}

  async listDevices() {
    return this.devices;
  }

  async revokeDevice(credentialId: string): Promise<boolean> {
    this.revokeCalls.push(credentialId);
    if (this.pending) {
      return new Promise(() => {});
    }
    if (this.revokeResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.revokeResult;
  }
}

function renderScreen(repo: FakeDeviceSyncRepository = new FakeDeviceSyncRepository()) {
  return render(
    <ModeProvider>
      <DeviceManagementScreen deviceSyncService={new DeviceSyncApplicationService(repo)} />
    </ModeProvider>,
  );
}

describe("DeviceManagementScreen", () => {
  it("shows an empty state when no devices are enrolled", async () => {
    renderScreen(new FakeDeviceSyncRepository([]));

    expect(
      await screen.findByText("No devices are currently enrolled for sync."),
    ).toBeInTheDocument();
  });

  it("lists enrolled devices with their owner and label, falling back for an unlabeled device", async () => {
    renderScreen();

    expect(await screen.findByText("Front Office PC")).toBeInTheDocument();
    expect(screen.getByText(/Ana Cruz \(ana\.cruz\)/)).toBeInTheDocument();
    expect(screen.getByText("Unnamed device")).toBeInTheDocument();
    expect(screen.getByText(/Bo Reyes \(bo\.reyes\)/)).toBeInTheDocument();
  });

  it("shows a human-readable last-synced time, and a plain 'has not synced yet' when there is none", async () => {
    renderScreen();
    await screen.findByText("Front Office PC");

    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    expect(screen.getByText(/Has not synced yet/)).toBeInTheDocument();
  });

  it("requires a plain-language confirmation step before removing a device", async () => {
    const repo = new FakeDeviceSyncRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Front Office PC");

    await user.click(screen.getAllByRole("button", { name: "Remove device" }).at(0)!);

    expect(
      screen.getByText(/This device will stop syncing right away, and this cannot be undone/),
    ).toBeInTheDocument();
    expect(repo.revokeCalls).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/This device will stop syncing right away/)).not.toBeInTheDocument();
    expect(repo.revokeCalls).toHaveLength(0);
  });

  it("removes a device only after the confirmation step is accepted, and shows a plain-language success message", async () => {
    const repo = new FakeDeviceSyncRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Front Office PC");

    await user.click(screen.getAllByRole("button", { name: "Remove device" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Yes, remove this device" }));

    expect(repo.revokeCalls).toEqual(["cred-1"]);
    expect(
      await screen.findByText("Front Office PC was removed and can no longer sync."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Front Office PC")).not.toBeInTheDocument();
  });

  it("shows a generic failure message on a false result, without leaking whether it was denied or already gone", async () => {
    const repo = new FakeDeviceSyncRepository();
    repo.revokeResult = false;
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Front Office PC");

    await user.click(screen.getAllByRole("button", { name: "Remove device" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Yes, remove this device" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not remove this device/i);
    expect(screen.getByText("Front Office PC")).toBeInTheDocument();
  });

  it("shows the same generic failure message on a thrown Unauthorized error", async () => {
    const repo = new FakeDeviceSyncRepository();
    repo.revokeResult = "reject";
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Front Office PC");

    await user.click(screen.getAllByRole("button", { name: "Remove device" }).at(0)!);
    await user.click(screen.getByRole("button", { name: "Yes, remove this device" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not remove this device/i);
  });

  it("shows an error message when loading fails", async () => {
    class FailingDeviceSyncRepository extends FakeDeviceSyncRepository {
      override async listDevices(): Promise<DeviceSyncCredential[]> {
        throw new Error("boom");
      }
    }
    render(
      <ModeProvider>
        <DeviceManagementScreen
          deviceSyncService={new DeviceSyncApplicationService(new FailingDeviceSyncRepository())}
        />
      </ModeProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen(new FakeDeviceSyncRepository([]));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Devices" })).toHaveFocus());
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen(new FakeDeviceSyncRepository([]));
    await screen.findByText("No devices are currently enrolled for sync.");

    expect(screen.getByText(/allowed to sync your school/i)).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen(new FakeDeviceSyncRepository([]));
    await screen.findByText("No devices are currently enrolled for sync.");

    expect(screen.queryByText(/allowed to sync your school/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Front Office PC");

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while the confirmation step is open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await screen.findByText("Front Office PC");

    await user.click(screen.getAllByRole("button", { name: "Remove device" }).at(0)!);
    await expectNoAccessibilityViolations(container);
  });
});
