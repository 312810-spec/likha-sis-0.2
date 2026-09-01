import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { UserApplicationService } from "../application/user-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { UserRepository } from "../domain/ports/user-repository";
import type { SchoolMember } from "../domain/school-member";
import type { User } from "../domain/user";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SchoolMembersScreen } from "./SchoolMembersScreen";

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "head-1", username: "bo.reyes", displayName: "Bo Reyes", roles: ["school_head"] },
];

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  constructor(private members: SchoolMember[] = MEMBERS) {}
  async listMembers() {
    return this.members;
  }
}

class RejectingSchoolMemberRepository implements SchoolMemberRepository {
  async listMembers(): Promise<SchoolMember[]> {
    throw new Error("boom");
  }
}

class FakeUserRepository implements UserRepository {
  resetCalls: Array<{ targetUserId: string; newPassword: string }> = [];
  shouldReject = false;

  async registerUser(username: string): Promise<User> {
    return { id: "u1", username, displayName: username, createdAt: "now" };
  }
  async addUserToSchool(): Promise<void> {}
  async adminResetPassword(targetUserId: string, newPassword: string): Promise<void> {
    if (this.shouldReject) throw new Error("unauthorized");
    this.resetCalls.push({ targetUserId, newPassword });
  }
}

function renderScreen(
  memberRepo: SchoolMemberRepository = new FakeSchoolMemberRepository(),
  userRepo: FakeUserRepository = new FakeUserRepository(),
) {
  const schoolMemberService = new SchoolMemberApplicationService(memberRepo);
  const userService = new UserApplicationService(userRepo);
  return {
    userRepo,
    ...render(
      <ModeProvider>
        <SchoolMembersScreen schoolMemberService={schoolMemberService} userService={userService} />
      </ModeProvider>,
    ),
  };
}

describe("SchoolMembersScreen", () => {
  it("lists every member with their roles", async () => {
    renderScreen();

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText("bo.reyes")).toBeInTheDocument();
    expect(screen.getByText("teacher")).toBeInTheDocument();
    expect(screen.getByText("school_head")).toBeInTheDocument();
  });

  it("shows an empty state when the school has no members", async () => {
    renderScreen(new FakeSchoolMemberRepository([]));

    expect(await screen.findByText("No members found for this school yet.")).toBeInTheDocument();
  });

  it("shows a retryable error when the member list fails to load", async () => {
    renderScreen(new RejectingSchoolMemberRepository());

    expect(await screen.findByText("Could not load school members.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("resets a member's password on confirmation and shows a success message", async () => {
    const user = userEvent.setup();
    const { userRepo } = renderScreen();

    await screen.findByText("Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Reset password for Ana Cruz" }));
    await user.type(screen.getByLabelText("New password"), "a fresh strong password");
    await user.type(screen.getByLabelText("Confirm password"), "a fresh strong password");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() =>
      expect(screen.getByText("Ana Cruz's password has been reset.")).toBeInTheDocument(),
    );
    expect(userRepo.resetCalls).toEqual([
      { targetUserId: "teacher-1", newPassword: "a fresh strong password" },
    ]);
  });

  it("rejects a mismatched confirmation without calling the repository", async () => {
    const userEventInstance = userEvent.setup();
    const { userRepo } = renderScreen();

    await screen.findByText("Ana Cruz");
    await userEventInstance.click(
      screen.getByRole("button", { name: "Reset password for Ana Cruz" }),
    );
    await userEventInstance.type(screen.getByLabelText("New password"), "a fresh strong password");
    await userEventInstance.type(screen.getByLabelText("Confirm password"), "a different password");
    await userEventInstance.click(screen.getByRole("button", { name: "Set new password" }));

    expect(
      await screen.findByText("The new password and confirmation do not match."),
    ).toBeInTheDocument();
    expect(userRepo.resetCalls).toEqual([]);
  });

  it("shows a generic error if the backend declines the reset", async () => {
    const userEventInstance = userEvent.setup();
    const rejectingUserRepo = new FakeUserRepository();
    rejectingUserRepo.shouldReject = true;
    renderScreen(new FakeSchoolMemberRepository(), rejectingUserRepo);

    await screen.findByText("Ana Cruz");
    await userEventInstance.click(
      screen.getByRole("button", { name: "Reset password for Ana Cruz" }),
    );
    await userEventInstance.type(screen.getByLabelText("New password"), "a fresh strong password");
    await userEventInstance.type(
      screen.getByLabelText("Confirm password"),
      "a fresh strong password",
    );
    await userEventInstance.click(screen.getByRole("button", { name: "Set new password" }));

    expect(
      await screen.findByText(
        "Could not reset this password — check that you have permission to manage school membership.",
      ),
    ).toBeInTheDocument();
  });

  it("cancel clears the open reset form", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Reset password for Ana Cruz" }));
    await user.type(screen.getByLabelText("New password"), "a fresh strong password");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Reset password for Ana Cruz" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("has no accessibility violations in the populated state", async () => {
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");
    await expectNoAccessibilityViolations(container);
  });

  it("has no accessibility violations with the reset form open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Reset password for Ana Cruz" }));
    await expectNoAccessibilityViolations(container);
  });

  it("has no accessibility violations in the empty state", async () => {
    const { container } = renderScreen(new FakeSchoolMemberRepository([]));
    await screen.findByText("No members found for this school yet.");
    await expectNoAccessibilityViolations(container);
  });
});
