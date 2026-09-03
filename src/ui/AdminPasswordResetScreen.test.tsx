import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { AdminPasswordResetScreen } from "./AdminPasswordResetScreen";

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "head-1", username: "bo.reyes", displayName: "Bo Reyes", roles: ["school_head"] },
];

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  resetPasswordResult: boolean | "reject" = true;
  resetPasswordCalls: Array<{ targetUserId: string; newPassword: string }> = [];
  /** When set, `resetPassword` never resolves on its own -- the test
   * controls completion. Used to prove the in-flight guard blocks a
   * second submission while the first is still pending. */
  pending = false;

  constructor(private members: SchoolMember[] = MEMBERS) {}

  async listMembers() {
    return this.members;
  }

  async resetPassword(targetUserId: string, newPassword: string): Promise<boolean> {
    this.resetPasswordCalls.push({ targetUserId, newPassword });
    if (this.pending) {
      return new Promise(() => {});
    }
    if (this.resetPasswordResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.resetPasswordResult;
  }
}

function renderScreen(
  options: { members?: SchoolMember[]; resetPasswordResult?: boolean | "reject" } = {},
) {
  const repo = new FakeSchoolMemberRepository(options.members ?? MEMBERS);
  if (options.resetPasswordResult !== undefined) {
    repo.resetPasswordResult = options.resetPasswordResult;
  }
  const schoolMemberService = new SchoolMemberApplicationService(repo);

  const result = render(
    <ModeProvider>
      <AdminPasswordResetScreen schoolMemberService={schoolMemberService} />
    </ModeProvider>,
  );
  return { ...result, repo };
}

describe("AdminPasswordResetScreen", () => {
  it("shows the same form to every school member -- no client-side role gating", async () => {
    renderScreen();

    expect(await screen.findByRole("combobox", { name: "Teacher" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ana Cruz" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bo Reyes" })).toBeInTheDocument();
  });

  it("resets a colleague's password and shows the confirmation", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await screen.findByRole("combobox", { name: "Teacher" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Ana Cruz's password was reset.")).toBeInTheDocument();
    expect(repo.resetPasswordCalls).toEqual([
      { targetUserId: "teacher-1", newPassword: "brand-new-password" },
    ]);
  });

  it("does not submit a second reset while the first is still in flight", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolMemberRepository();
    repo.pending = true;
    const schoolMemberService = new SchoolMemberApplicationService(repo);
    render(
      <ModeProvider>
        <AdminPasswordResetScreen schoolMemberService={schoolMemberService} />
      </ModeProvider>,
    );
    await screen.findByRole("combobox", { name: "Teacher" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    const resetButton = screen.getByRole("button", { name: "Reset password" });
    await user.click(resetButton);
    await waitFor(() => expect(repo.resetPasswordCalls).toHaveLength(1));

    expect(resetButton).toHaveAttribute("aria-disabled", "true");
    await user.click(resetButton);

    expect(repo.resetPasswordCalls).toHaveLength(1);
  });

  it("shows a generic message when the backend returns false (unknown target or a different school), never distinguishing which", async () => {
    const user = userEvent.setup();
    renderScreen({ resetPasswordResult: false });
    await screen.findByRole("combobox", { name: "Teacher" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(
      await screen.findByText(
        "Could not reset this password. Check that you selected a valid teacher and have permission to reset passwords.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the exact same generic message when the backend throws Unauthorized (a denied capability check)", async () => {
    const user = userEvent.setup();
    renderScreen({ resetPasswordResult: "reject" });
    await screen.findByRole("combobox", { name: "Teacher" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(
      await screen.findByText(
        "Could not reset this password. Check that you selected a valid teacher and have permission to reset passwords.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a validation message for a too-short password without calling the repository", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await screen.findByRole("combobox", { name: "Teacher" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Teacher" }), "teacher-1");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(repo.resetPasswordCalls).toHaveLength(0);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("combobox", { name: "Teacher" });

    await expectNoAccessibilityViolations(container);
  });
});
