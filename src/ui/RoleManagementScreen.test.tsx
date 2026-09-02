import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { RoleManagementScreen } from "./RoleManagementScreen";

const MEMBERS: SchoolMember[] = [
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  {
    id: "head-1",
    username: "bo.reyes",
    displayName: "Bo Reyes",
    roles: ["teacher", "school_head"],
  },
];

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  grantRoleCalls: Array<{ targetUserId: string; roleName: string }> = [];
  revokeRoleCalls: Array<{ targetUserId: string; roleName: string }> = [];
  grantResult: "ok" | "reject" = "ok";
  revokeResult: "ok" | "reject" | "lastSchoolHead" = "ok";
  /** When set, the next call never resolves on its own -- the test
   * controls completion, same convention as
   * `AdminPasswordResetScreen.test.tsx`'s `pending` flag. */
  pending = false;

  constructor(private members: SchoolMember[] = MEMBERS) {}

  async listMembers() {
    return this.members;
  }

  async resetPassword(): Promise<boolean> {
    return true;
  }

  async grantRole(targetUserId: string, roleName: string): Promise<void> {
    this.grantRoleCalls.push({ targetUserId, roleName });
    if (this.pending) {
      return new Promise(() => {});
    }
    if (this.grantResult === "reject") {
      throw new Error("unauthorized");
    }
  }

  async revokeRole(targetUserId: string, roleName: string): Promise<void> {
    this.revokeRoleCalls.push({ targetUserId, roleName });
    if (this.pending) {
      return new Promise(() => {});
    }
    if (this.revokeResult === "reject") {
      throw new Error("unauthorized");
    }
    if (this.revokeResult === "lastSchoolHead") {
      throw new Error("cannot_remove_last_school_head");
    }
  }
}

function renderScreen(options: { members?: SchoolMember[] } = {}) {
  const repo = new FakeSchoolMemberRepository(options.members ?? MEMBERS);
  const schoolMemberService = new SchoolMemberApplicationService(repo);

  const result = render(
    <ModeProvider>
      <RoleManagementScreen schoolMemberService={schoolMemberService} />
    </ModeProvider>,
  );
  return { ...result, repo };
}

describe("RoleManagementScreen", () => {
  it("shows every school member with their current roles and grant/revoke buttons -- no client-side role gating", async () => {
    renderScreen();

    expect(await screen.findByRole("cell", { name: "Teacher" })).toBeInTheDocument();
    const anaRow = screen.getByRole("rowheader", { name: "Ana Cruz" }).closest("tr")!;
    expect(within(anaRow).getByRole("button", { name: "Grant Registrar" })).toBeInTheDocument();
    const boRow = screen.getByRole("rowheader", { name: "Bo Reyes" }).closest("tr")!;
    expect(within(boRow).getByRole("button", { name: "Revoke School Head" })).toBeInTheDocument();
  });

  it("grants a role and shows the confirmation", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    const anaRow = (await screen.findByRole("rowheader", { name: "Ana Cruz" })).closest("tr")!;

    await user.click(within(anaRow).getByRole("button", { name: "Grant Registrar" }));

    expect(await screen.findByText("Ana Cruz is now a Registrar.")).toBeInTheDocument();
    expect(repo.grantRoleCalls).toEqual([{ targetUserId: "teacher-1", roleName: "registrar" }]);
  });

  it("revokes a role and shows the confirmation", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    const boRow = (await screen.findByRole("rowheader", { name: "Bo Reyes" })).closest("tr")!;

    await user.click(within(boRow).getByRole("button", { name: "Revoke School Head" }));

    expect(await screen.findByText("Bo Reyes is no longer a School Head.")).toBeInTheDocument();
    expect(repo.revokeRoleCalls).toEqual([{ targetUserId: "head-1", roleName: "school_head" }]);
  });

  it("does not submit a second action for the same button while the first is still in flight", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolMemberRepository();
    repo.pending = true;
    const schoolMemberService = new SchoolMemberApplicationService(repo);
    render(
      <ModeProvider>
        <RoleManagementScreen schoolMemberService={schoolMemberService} />
      </ModeProvider>,
    );
    const anaRow = (await screen.findByRole("rowheader", { name: "Ana Cruz" })).closest("tr")!;

    const grantButton = within(anaRow).getByRole("button", { name: "Grant Registrar" });
    await user.click(grantButton);
    await waitFor(() => expect(repo.grantRoleCalls).toHaveLength(1));

    expect(within(anaRow).getByRole("button", { name: "Working…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(anaRow).getByRole("button", { name: "Working…" }));

    expect(repo.grantRoleCalls).toHaveLength(1);
  });

  it("shows a specific message when revoking would remove the school's last School Head", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolMemberRepository();
    repo.revokeResult = "lastSchoolHead";
    const schoolMemberService = new SchoolMemberApplicationService(repo);
    render(
      <ModeProvider>
        <RoleManagementScreen schoolMemberService={schoolMemberService} />
      </ModeProvider>,
    );
    const boRow = (await screen.findByRole("rowheader", { name: "Bo Reyes" })).closest("tr")!;

    await user.click(within(boRow).getByRole("button", { name: "Revoke School Head" }));

    expect(
      await screen.findByText(
        "Bo Reyes is the school's only School Head — grant School Head to someone else first.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a generic message when the backend rejects a grant", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolMemberRepository();
    repo.grantResult = "reject";
    const schoolMemberService = new SchoolMemberApplicationService(repo);
    render(
      <ModeProvider>
        <RoleManagementScreen schoolMemberService={schoolMemberService} />
      </ModeProvider>,
    );
    const anaRow = (await screen.findByRole("rowheader", { name: "Ana Cruz" })).closest("tr")!;

    await user.click(within(anaRow).getByRole("button", { name: "Grant Registrar" }));

    expect(await screen.findByText("Could not grant Registrar to Ana Cruz.")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("rowheader", { name: "Ana Cruz" });

    await expectNoAccessibilityViolations(container);
  });
});
