import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SchoolPlanningApplicationService } from "../application/school-planning-service";
import { SchoolPlanningScreen } from "./SchoolPlanningScreen";
it("retains inactive program and typed information when activation lacks instructions", async () => {
  const save = vi.fn();
  const user = userEvent.setup();
  render(
    <SchoolPlanningScreen
      service={new SchoolPlanningApplicationService({ list: async () => [], save })}
      members={[]}
      canManage
    />,
  );
  await user.selectOptions(screen.getByLabelText("Type"), "program");
  await user.type(screen.getByLabelText("Name"), "ARAL");
  expect(screen.getByLabelText("Program status")).toHaveValue("inactive");
  await user.selectOptions(screen.getByLabelText("Program status"), "active");
  await user.click(screen.getByRole("button", { name: "Save reviewed item" }));
  expect(await screen.findByText(/needs school instructions/)).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Name")).toHaveValue("ARAL");
});
it("teacher can read notices but cannot confirm a calendar change", () => {
  render(
    <SchoolPlanningScreen
      service={new SchoolPlanningApplicationService({ list: async () => [], save: vi.fn() })}
      members={[]}
    />,
  );
  expect(screen.getByRole("button", { name: "Save reviewed item" })).toBeDisabled();
});
