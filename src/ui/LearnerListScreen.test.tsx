import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LearnerApplicationService } from "../application/learner-service";
import type { Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LearnerListScreen } from "./LearnerListScreen";

class FakeLearnerRepository implements LearnerRepository {
  createCalls: Array<{ givenName: string; familyName: string; lrn?: string; sex?: "M" | "F" }> = [];

  constructor(public learners: Learner[] = []) {}

  async list(): Promise<Learner[]> {
    return [...this.learners];
  }

  async create(
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner> {
    this.createCalls.push({ givenName, familyName, lrn, sex });
    const learner: Learner = {
      id: `l${this.learners.length + 1}`,
      schoolId: "s1",
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
      createdAt: "now",
    };
    this.learners.push(learner);
    return learner;
  }

  async updateProfile(
    learnerId: string,
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner | null> {
    const existing = this.learners.find((l) => l.id === learnerId);
    if (!existing) return null;
    existing.givenName = givenName;
    existing.familyName = familyName;
    existing.lrn = lrn ?? null;
    existing.sex = sex ?? null;
    return existing;
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
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);

    expect(await screen.findByText("Ana Santos")).toBeInTheDocument();
  });

  it("edits an existing learner's LRN and Sex without a fresh enrollment", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));
    const editForm = screen.getByRole("form", { name: "Edit Ana Santos" });
    await user.type(within(editForm).getByLabelText("LRN (optional)"), "123456789012");
    await user.selectOptions(within(editForm).getByLabelText("Sex (optional)"), "F");
    await user.click(within(editForm).getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/— LRN 123456789012/)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ana Santos's profile was updated.",
    );
    expect(repo.learners[0]).toMatchObject({ lrn: "123456789012", sex: "F" });
  });

  it("cancel discards edits and leaves the learner unchanged", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));
    const editForm = screen.getByRole("form", { name: "Edit Ana Santos" });
    await user.type(within(editForm).getByLabelText("LRN (optional)"), "123456789012");
    await user.click(within(editForm).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form", { name: "Edit Ana Santos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/— LRN/)).not.toBeInTheDocument();
  });

  it("moves focus into the edit form when editing starts", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));

    const editForm = screen.getByRole("form", { name: "Edit Ana Santos" });
    await waitFor(() => expect(within(editForm).getByLabelText("Given name")).toHaveFocus());
  });

  it("disables editing another learner while one edit is already in progress", async () => {
    const user = userEvent.setup();
    renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
      {
        id: "l2",
        schoolId: "s1",
        givenName: "Ben",
        familyName: "Reyes",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));

    expect(screen.getByRole("button", { name: "Edit Ben Reyes" })).toBeDisabled();
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
    expect(repo.createCalls).toEqual([
      { givenName: "Ben", familyName: "Reyes", lrn: undefined, sex: undefined },
    ]);
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
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await waitFor(() => screen.getByText("Ana Santos"));

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while editing a learner", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen([
      {
        id: "l1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ]);
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Edit Ana Santos" }));
    await screen.findByRole("form", { name: "Edit Ana Santos" });

    await expectNoAccessibilityViolations(container);
  });
});
