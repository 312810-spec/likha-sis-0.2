import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SetupApplicationService } from "../application/setup-service";
import type { InstallationStatus, SetupRepository } from "../domain/ports/setup-repository";
import type { CurrentSession } from "../domain/session";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { FirstRunSetupScreen } from "./FirstRunSetupScreen";
import { ModeProvider } from "./theme/ModeContext";

class FakeSetupRepository implements SetupRepository {
  bootstrapCalls: Array<{
    schoolName: string;
    username: string;
    password: string;
    displayName: string;
  }> = [];
  shouldFail = false;
  /** When set, `bootstrapInstallation` never resolves on its own -- the
   * test controls completion. Used to prove the in-flight guard blocks a
   * second submission while the first is still pending. */
  pending = false;

  async installationStatus(): Promise<InstallationStatus> {
    return { needsSetup: true };
  }

  async bootstrapInstallation(
    schoolName: string,
    username: string,
    password: string,
    displayName: string,
  ): Promise<CurrentSession> {
    this.bootstrapCalls.push({ schoolName, username, password, displayName });
    if (this.pending) {
      return new Promise(() => {});
    }
    if (this.shouldFail) {
      throw new Error("already_initialized");
    }
    return {
      userId: "u1",
      username,
      displayName,
      schoolId: "s1",
      schoolName,
      expiresAtUnixMs: 1_000_000,
      idleExpiresAtUnixMs: 1_000_000,
      roles: ["teacher"],
    };
  }
}

function renderScreen(
  props: { repo?: FakeSetupRepository; onSetupComplete?: (s: CurrentSession) => void } = {},
) {
  const repo = props.repo ?? new FakeSetupRepository();
  const result = render(
    <ModeProvider>
      <FirstRunSetupScreen
        setupService={new SetupApplicationService(repo)}
        onSetupComplete={props.onSetupComplete ?? (() => {})}
      />
    </ModeProvider>,
  );
  return { ...result, repo };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("School name"), "Rizal Elementary");
  await user.type(screen.getByLabelText("Your name"), "Ana Cruz");
  await user.type(screen.getByLabelText("Choose a username"), "ana.cruz");
  await user.type(screen.getByLabelText("Choose a password"), "correct horse battery staple");
  await user.type(screen.getByLabelText("Confirm password"), "correct horse battery staple");
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("FirstRunSetupScreen", () => {
  it("moves focus to the welcome heading on mount", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Welcome to LIKHA-SIS" })).toHaveFocus(),
    );
  });

  it("avoids technical jargon in the visible copy", () => {
    renderScreen();

    const bodyText = document.body.textContent ?? "";
    for (const term of [
      "database",
      "migration",
      "credential hash",
      "tenant",
      "cryptography",
      "repository",
    ]) {
      expect(bodyText.toLowerCase()).not.toContain(term);
    }
  });

  it("completes setup and reports the new session", async () => {
    const user = userEvent.setup();
    let completedSession: CurrentSession | null = null;
    const { repo } = renderScreen({
      onSetupComplete: (session) => {
        completedSession = session;
      },
    });

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(completedSession).not.toBeNull());
    expect(repo.bootstrapCalls).toEqual([
      {
        schoolName: "Rizal Elementary",
        username: "ana.cruz",
        password: "correct horse battery staple",
        displayName: "Ana Cruz",
      },
    ]);
  });

  it("does not submit a second setup while the first is still in flight", async () => {
    const user = userEvent.setup();
    const repo = new FakeSetupRepository();
    repo.pending = true;
    renderScreen({ repo });

    await fillValidForm(user);
    const finishButton = screen.getByRole("button", { name: "Finish setup" });
    await user.click(finishButton);
    await waitFor(() => expect(repo.bootstrapCalls).toHaveLength(1));

    expect(finishButton).toHaveAttribute("aria-disabled", "true");
    await user.click(finishButton);

    expect(repo.bootstrapCalls).toHaveLength(1);
  });

  it("shows a validation message and does not call the repository for mismatched passwords", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();

    await user.type(screen.getByLabelText("School name"), "Rizal Elementary");
    await user.type(screen.getByLabelText("Your name"), "Ana Cruz");
    await user.type(screen.getByLabelText("Choose a username"), "ana.cruz");
    await user.type(screen.getByLabelText("Choose a password"), "correct horse battery staple");
    await user.type(screen.getByLabelText("Confirm password"), "a different password");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/passwords do not match/i);
    expect(repo.bootstrapCalls).toEqual([]);
  });

  it("allows a successful retry after a failed attempt without losing entered data", async () => {
    const user = userEvent.setup();
    let completedSession: CurrentSession | null = null;
    const { repo } = renderScreen({
      onSetupComplete: (session) => {
        completedSession = session;
      },
    });

    // First attempt: mismatched passwords, fails client-side.
    await user.type(screen.getByLabelText("School name"), "Rizal Elementary");
    await user.type(screen.getByLabelText("Your name"), "Ana Cruz");
    await user.type(screen.getByLabelText("Choose a username"), "ana.cruz");
    await user.type(screen.getByLabelText("Choose a password"), "correct horse battery staple");
    await user.type(screen.getByLabelText("Confirm password"), "a different password");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await screen.findByRole("alert");

    // Other fields were not cleared by the failed attempt.
    expect(screen.getByLabelText("School name")).toHaveValue("Rizal Elementary");

    // Fix just the confirmation and retry — should succeed cleanly.
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(completedSession).not.toBeNull());
    expect(repo.bootstrapCalls).toEqual([
      {
        schoolName: "Rizal Elementary",
        username: "ana.cruz",
        password: "correct horse battery staple",
        displayName: "Ana Cruz",
      },
    ]);
  });

  it("shows a generic message (not a leaked internal error) when bootstrap fails server-side", async () => {
    const user = userEvent.setup();
    const repo = new FakeSetupRepository();
    repo.shouldFail = true;
    renderScreen({ repo });

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't finish setting up/i);
    expect(alert.textContent?.toLowerCase()).not.toContain("already_initialized");
  });

  it("the show-passwords checkbox reveals both password fields", async () => {
    const user = userEvent.setup();
    renderScreen();

    const passwordField = screen.getByLabelText("Choose a password");
    const confirmField = screen.getByLabelText("Confirm password");
    expect(passwordField).toHaveAttribute("type", "password");
    expect(confirmField).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("checkbox", { name: "Show passwords" }));

    expect(passwordField).toHaveAttribute("type", "text");
    expect(confirmField).toHaveAttribute("type", "text");
  });

  it("shows field hints only in guided mode", () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen();

    expect(screen.getByText(/set up as your school's main account/i)).toBeInTheDocument();
  });

  it("does not show field hints in comfortable (default) mode", () => {
    renderScreen();

    expect(screen.queryByText(/set up as your school's main account/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();

    await expectNoAccessibilityViolations(container);
  });
});
