import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BackupApplicationService } from "../application/backup-service";
import type { BackupRepository } from "../domain/ports/backup-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { BackupPanel } from "./BackupPanel";

const PASSWORD = "synthetic recovery password";
function fixture() {
  const repository: BackupRepository = {
    create: vi.fn().mockResolvedValue("synthetic.likhabak"),
    stageRecovery: vi.fn().mockResolvedValue(true),
  };
  return { repository, service: new BackupApplicationService(repository) };
}
async function enterPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Recovery password", { exact: true }), PASSWORD);
  await user.type(screen.getByLabelText("Repeat recovery password"), PASSWORD);
}

describe("portable backup experience", () => {
  it("reports completion and clears passwords only after the backup is saved", async () => {
    const { service, repository } = fixture();
    const user = userEvent.setup();
    const { container } = render(<BackupPanel service={service} />);
    await expectNoAccessibilityViolations(container);
    await enterPassword(user);
    await user.click(screen.getByRole("button", { name: "Choose location and save backup" }));
    expect(repository.create).toHaveBeenCalledWith(PASSWORD);
    expect(await screen.findByRole("status")).toHaveTextContent("Backup saved: synthetic.likhabak");
    expect(screen.getByLabelText("Recovery password", { exact: true })).toHaveValue("");
  });

  it("canceling the native file chooser does not claim the backup was saved", async () => {
    const { service, repository } = fixture();
    vi.mocked(repository.create).mockResolvedValue(null);
    const user = userEvent.setup();
    render(<BackupPanel service={service} />);
    await enterPassword(user);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows native authority failures and remains retryable without logging out", async () => {
    const { service, repository } = fixture();
    vi.mocked(repository.create).mockRejectedValue("unauthorized");
    const user = userEvent.setup();
    render(<BackupPanel service={service} />);
    await enterPassword(user);
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("School Head for every school");
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("blocks repeat submission while a write is pending", async () => {
    const { service, repository } = fixture();
    let complete!: (path: string) => void;
    vi.mocked(repository.create).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<BackupPanel service={service} />);
    await enterPassword(user);
    await user.click(screen.getByRole("button"));
    const working = screen.getByRole("button", { name: "Working…" });
    expect(working).toBeDisabled();
    await user.click(working);
    expect(repository.create).toHaveBeenCalledTimes(1);
    complete("synthetic.likhabak");
    await screen.findByRole("status");
  });

  it("requires replacement confirmation, stages recovery, and asks for a full restart", async () => {
    const { service, repository } = fixture();
    const ready = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <BackupPanel service={service} recovery onRecoveryReady={ready} />,
    );
    await expectNoAccessibilityViolations(container);
    expect(screen.getByRole("button")).toBeDisabled();
    await enterPassword(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button"));
    expect(repository.stageRecovery).toHaveBeenCalledWith(PASSWORD);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Close LIKHA-SIS completely and reopen it",
    );
    expect(ready).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not stage a recovery when passwords disagree", async () => {
    const { service, repository } = fixture();
    const user = userEvent.setup();
    render(<BackupPanel service={service} recovery />);
    await user.type(screen.getByLabelText("Recovery password", { exact: true }), PASSWORD);
    await user.type(screen.getByLabelText("Repeat recovery password"), "different phrase");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    expect(repository.stageRecovery).not.toHaveBeenCalled();
  });
});
