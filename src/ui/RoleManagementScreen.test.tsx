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

function rowFor(name: string): HTMLElement {
  return screen.getByRole("rowheader", { name }).closest("tr")!;
}

async function grantRole(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, role: string) {
  await user.selectOptions(within(row).getByRole("combobox"), role);
  await user.click(within(row).getByRole("button", { name: "Grant" }));
}

describe("RoleManagementScreen", () => {
  it("shows every school member with their current roles and a grant picker -- no client-side role gating", async () => {
    renderScreen();

    expect(await screen.findByRole("rowheader", { name: "Ana Cruz" })).toBeInTheDocument();
    const anaRow = rowFor("Ana Cruz");
    expect(within(anaRow).getByText("Teacher only")).toBeInTheDocument();
    expect(within(anaRow).getByRole("combobox")).toBeInTheDocument();
    expect(within(anaRow).getByRole("option", { name: "School Head" })).toBeInTheDocument();

    const boRow = rowFor("Bo Reyes");
    expect(within(boRow).getByRole("button", { name: "Revoke School Head" })).toBeInTheDocument();
  });

  it("renders each held role exactly once -- not as both plain text and a revoke button", async () => {
    renderScreen();
    await screen.findByRole("rowheader", { name: "Bo Reyes" });

    expect(within(rowFor("Bo Reyes")).getAllByText(/School Head/)).toHaveLength(1);
  });

  it("grants a role and shows the confirmation", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await screen.findByRole("rowheader", { name: "Ana Cruz" });

    await grantRole(user, rowFor("Ana Cruz"), "registrar");

    expect(await screen.findByText("Ana Cruz is now a Registrar.")).toBeInTheDocument();
    expect(repo.grantRoleCalls).toEqual([{ targetUserId: "teacher-1", roleName: "registrar" }]);
  });

  it("revokes a role and shows the confirmation", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await screen.findByRole("rowheader", { name: "Bo Reyes" });

    await user.click(
      within(rowFor("Bo Reyes")).getByRole("button", { name: "Revoke School Head" }),
    );

    expect(await screen.findByText("Bo Reyes is no longer a School Head.")).toBeInTheDocument();
    expect(repo.revokeRoleCalls).toEqual([{ targetUserId: "head-1", roleName: "school_head" }]);
  });

  it("does not submit a second grant while the first is still in flight", async () => {
    const user = userEvent.setup();
    const repo = new FakeSchoolMemberRepository();
    repo.pending = true;
    const schoolMemberService = new SchoolMemberApplicationService(repo);
    render(
      <ModeProvider>
        <RoleManagementScreen schoolMemberService={schoolMemberService} />
      </ModeProvider>,
    );
    await screen.findByRole("rowheader", { name: "Ana Cruz" });
    const anaRow = rowFor("Ana Cruz");

    await user.selectOptions(within(anaRow).getByRole("combobox"), "registrar");
    const grantButton = within(anaRow).getByRole("button", { name: "Grant" });
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
    await screen.findByRole("rowheader", { name: "Bo Reyes" });

    await user.click(
      within(rowFor("Bo Reyes")).getByRole("button", { name: "Revoke School Head" }),
    );

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
    await screen.findByRole("rowheader", { name: "Ana Cruz" });

    await grantRole(user, rowFor("Ana Cruz"), "registrar");

    expect(await screen.findByText("Could not grant Registrar to Ana Cruz.")).toBeInTheDocument();
  });

  it("marks a foundation-only role as not yet active in the grant picker, and discloses why", async () => {
    renderScreen();
    await screen.findByRole("rowheader", { name: "Ana Cruz" });
    const anaRow = rowFor("Ana Cruz");

    expect(
      within(anaRow).getByRole("option", { name: "ICT Coordinator (not yet active)" }),
    ).toBeInTheDocument();
    expect(within(anaRow).getByRole("option", { name: "School Head" })).toBeInTheDocument();
    expect(
      screen.getByText(/roles below are ready to grant.*this app doesn't have matching screens/s),
    ).toBeInTheDocument();
  });

  it("uses 'an' before a role label that starts with a vowel sound", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await screen.findByRole("rowheader", { name: "Ana Cruz" });

    await grantRole(user, rowFor("Ana Cruz"), "ict_coordinator");

    expect(await screen.findByText("Ana Cruz is now an ICT Coordinator.")).toBeInTheDocument();
    expect(repo.grantRoleCalls).toEqual([
      { targetUserId: "teacher-1", roleName: "ict_coordinator" },
    ]);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByRole("rowheader", { name: "Ana Cruz" });

    await expectNoAccessibilityViolations(container);
  });
});
