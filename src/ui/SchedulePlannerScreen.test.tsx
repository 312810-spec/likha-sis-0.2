import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchedulePlanApplicationService } from "../application/schedule-plan-service";
import { SchedulePlannerScreen } from "./SchedulePlannerScreen";
import { emptySchedulePlan } from "./schedule-plan-draft";
import type { SchedulePlanRepository } from "../domain/ports/schedule-plan-repository";
import type { SchedulePlan } from "../domain/schedule-plan";
function fixture(plan?: SchedulePlan) {
  const repository: SchedulePlanRepository = {
    list: vi.fn(async () => (plan ? [plan] : [])),
    save: vi.fn(),
    generate: vi.fn(),
    publish: vi.fn(),
    copy: vi.fn(),
    listMine: vi.fn(async () => []),
  };
  render(
    <SchedulePlannerScreen
      service={new SchedulePlanApplicationService(repository)}
      members={[]}
      sections={[]}
      subjects={[]}
    />,
  );
  return repository;
}
describe("Schedule planner review boundaries", () => {
  it("starts empty, permits manual fixed meetings and room unavailable times", async () => {
    const user = userEvent.setup();
    fixture();
    expect(screen.getByLabelText("Plan name")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Add fixed meeting" }));
    expect(screen.getByLabelText("Fixed meeting 1 class")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add room" }));
    await user.click(screen.getByRole("button", { name: "Add unavailable time for room 1" }));
    expect(screen.getByLabelText("Room 1 block 1 start")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish reviewed schedule" })).toBeDisabled();
  });
  it("unknown search is not presented as impossible; edits invalidate a suggestion", async () => {
    const user = userEvent.setup();
    fixture({
      id: "p",
      revision: 2,
      status: "draft",
      input: { ...emptySchedulePlan(), label: "Test" },
      result: { status: "unknown", meetings: [], issues: [], exploredNodes: 10 },
      publishedAt: null,
    });
    await screen.findByRole("option", { name: /Test/ });
    await user.selectOptions(screen.getByLabelText("Saved plan"), "p");
    expect(screen.getByText(/does not mean the schedule is impossible/)).toBeVisible();
    await user.type(screen.getByLabelText("Plan name"), " changed");
    expect(screen.queryByText(/does not mean the schedule is impossible/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish reviewed schedule" })).toBeDisabled();
  });
});
