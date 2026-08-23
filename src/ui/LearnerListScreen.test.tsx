import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LearnerApplicationService } from "../application/learner-service";
import type { Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LearnerListScreen } from "./LearnerListScreen";

class FakeLearnerRepository implements LearnerRepository {
  createCalls: Array<{ givenName: string; familyName: string }> = [];

  constructor(private learners: Learner[] = []) {}

  async list(): Promise<Learner[]> {
    return [...this.learners];
  }

  async create(givenName: string, familyName: string): Promise<Learner> {
    this.createCalls.push({ givenName, familyName });
    const learner: Learner = {
      id: `l${this.learners.length + 1}`,
      schoolId: "s1",
      givenName,
      familyName,
      createdAt: "now",
    };
    this.learners.push(learner);
    return learner;
  }
}

function renderScreen(learners: Learner[] = []) {
  const repo = new FakeLearnerRepository(learners);
  const result = render(
    <ModeProvider>
      <LearnerListScreen learnerService={new LearnerApplicationService(repo)} />
    </ModeProvider>,
  );
  return { ...result, repo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LearnerListScreen", () => {
  it("shows an empty state when there are no learners yet", async () => {
    renderScreen([]);

    expect(await screen.findByText("No learners enrolled yet.")).toBeInTheDocument();
  });

  it("lists existing learners", async () => {
    renderScreen([
      { id: "l1", schoolId: "s1", givenName: "Ana", familyName: "Santos", createdAt: "now" },
    ]);

    expect(await screen.findByText("Ana Santos")).toBeInTheDocument();
  });

  it("enrolls a learner, adds them to the visible list, and confirms it", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    await user.type(screen.getByLabelText("Given name"), "Ben");
    await user.type(screen.getByLabelText("Family name"), "Reyes");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    expect(await screen.findByText("Ben Reyes")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Ben Reyes was enrolled.");
    expect(repo.createCalls).toEqual([{ givenName: "Ben", familyName: "Reyes" }]);
  });

  it("shows a validation message and does not call the repository for an empty name", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    await user.type(screen.getByLabelText("Given name"), "   ");
    await user.type(screen.getByLabelText("Family name"), "Reyes");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/given name must not be empty/i);
    expect(repo.createCalls).toEqual([]);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen([]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Learners" })).toHaveFocus());
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    expect(screen.getByText(/full legal given and family names/i)).toBeInTheDocument();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen([]);
    await screen.findByText("No learners enrolled yet.");

    expect(screen.queryByText(/full legal given and family names/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen([
      { id: "l1", schoolId: "s1", givenName: "Ana", familyName: "Santos", createdAt: "now" },
    ]);
    await waitFor(() => screen.getByText("Ana Santos"));

    await expectNoAccessibilityViolations(container);
  });
});
