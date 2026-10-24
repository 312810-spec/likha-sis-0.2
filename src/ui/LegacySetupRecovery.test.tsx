import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LegacySetupRecoveryApplicationService } from "../application/legacy-setup-recovery-service";
import type { CurrentSession } from "../domain/session";
import { LegacySetupRecovery } from "./LegacySetupRecovery";
import { expectNoAccessibilityViolations } from "../test/a11y";

const session: CurrentSession = {
  userId: "synthetic-owner",
  username: "owner",
  displayName: "Synthetic owner",
  schoolId: "synthetic-school",
  schoolName: "Synthetic school",
  roles: ["teacher", "registrar", "school_head"],
  expiresAtUnixMs: 1,
  idleExpiresAtUnixMs: 1,
};
function setup(
  available = vi.fn().mockResolvedValue(true),
  restore = vi.fn().mockResolvedValue(session),
) {
  const service = new LegacySetupRecoveryApplicationService({ available, restore });
  return { service, available, restore };
}

describe("Legacy setup recovery", () => {
  it("does not infer availability from a pending or false check", async () => {
    let resolve!: (result: boolean) => void;
    const { service, restore } = setup(
      vi.fn(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          }),
      ),
    );
    render(<LegacySetupRecovery service={service} onRestored={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => resolve(false));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();
  });

  it("failed availability offers retry without rendering a privileged action or raw errors", async () => {
    const available = vi
      .fn()
      .mockRejectedValueOnce(new Error("private path"))
      .mockResolvedValue(true);
    const { service } = setup(available);
    const user = userEvent.setup();
    render(<LegacySetupRecovery service={service} onRestored={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Retry setup check" }));
    expect(await screen.findByRole("button", { name: "Restore setup access" })).toBeVisible();
    expect(screen.queryByText("private path")).not.toBeInTheDocument();
  });

  it("cancel writes nothing, clears the password and returns keyboard focus", async () => {
    const { service, restore } = setup();
    const user = userEvent.setup();
    render(<LegacySetupRecovery service={service} onRestored={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Restore setup access" }));
    await user.type(screen.getByLabelText("Current password"), "synthetic-secret");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(restore).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Restore setup access" })).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Restore setup access" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("submits one request, clears sensitive input and waits for the authoritative session", async () => {
    let resolve!: (result: CurrentSession) => void;
    const restore = vi.fn(
      () =>
        new Promise<CurrentSession>((done) => {
          resolve = done;
        }),
    );
    const { service } = setup(undefined, restore);
    const onRestored = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<LegacySetupRecovery service={service} onRestored={onRestored} />);
    await user.click(await screen.findByRole("button", { name: "Restore setup access" }));
    await user.type(screen.getByLabelText("Current password"), "synthetic-secret");
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    expect(restore).toHaveBeenCalledExactlyOnceWith("synthetic-secret");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onRestored).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(container);
    await act(async () => resolve(session));
    expect(onRestored).toHaveBeenCalledExactlyOnceWith(session);
  });

  it.each(["authentication_failed", "account_locked", "database_error"])(
    "%s keeps recovery incomplete with no raw data",
    async (error) => {
      const { service } = setup(undefined, vi.fn().mockRejectedValue(error));
      const onRestored = vi.fn();
      const user = userEvent.setup();
      render(<LegacySetupRecovery service={service} onRestored={onRestored} />);
      await user.click(await screen.findByRole("button", { name: "Restore setup access" }));
      await user.type(screen.getByLabelText("Current password"), "synthetic-secret");
      await user.click(screen.getByRole("button", { name: "Confirm restore setup access" }));
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(screen.getByLabelText("Current password")).toHaveValue("");
      expect(onRestored).not.toHaveBeenCalled();
    },
  );

  it("ignores an old receipt after service/owner replacement", async () => {
    let resolve!: (result: CurrentSession) => void;
    const { service } = setup(
      undefined,
      vi.fn(
        () =>
          new Promise<CurrentSession>((done) => {
            resolve = done;
          }),
      ),
    );
    const onRestored = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <LegacySetupRecovery key="first-owner" service={service} onRestored={onRestored} />,
    );
    await user.click(await screen.findByRole("button", { name: "Restore setup access" }));
    await user.type(screen.getByLabelText("Current password"), "synthetic-secret");
    await user.click(screen.getByRole("button", { name: "Confirm restore setup access" }));
    view.rerender(
      <LegacySetupRecovery key="second-owner" service={setup().service} onRestored={onRestored} />,
    );
    await act(async () => resolve(session));
    expect(onRestored).not.toHaveBeenCalled();
  });
});
