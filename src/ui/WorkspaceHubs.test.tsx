import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MoreScreen, SchoolFormsScreen } from "./WorkspaceHubs";
it("teacher tools omit school-wide learner editing and administration", () => {
  render(<MoreScreen roles={["teacher"]} onNavigate={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Learners" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Teacher Load Planner" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "My Published Schedule" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Attachments" })).toBeVisible();
});
it("teacher forms use advisory and review paths without global SF1 import", () => {
  render(<SchoolFormsScreen roles={["teacher"]} onNavigate={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Import learners" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open My Advisory" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Open forms and TANAW review" })).toBeVisible();
});
