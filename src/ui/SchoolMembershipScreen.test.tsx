import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SchoolMembershipScreen } from "./SchoolMembershipScreen";

const MEMBERS: SchoolMember[] = [
  {
    id: "u-head",
    username: "corazon.santos",
    displayName: "Corazon Santos",
    roles: ["school_head"],
  },
  { id: "u-teacher", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
];

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  removeResult: boolean | "reject" = true;
  removeCalls: string[] = [];
  grantResult: boolean | "reject" = true;
  grantCalls: Array<[string, string]> = [];
  revokeResult: boolean | "reject" = true;
  revokeCalls: Array<[string, string]> = [];
  /** When set, `removeMember` never resolves on its own -- proves the
   * in-flight guard, matching `DeviceManagementScreen.test.tsx`'s
   * established convention. */
  pending = false;

  constructor(private members: SchoolMember[] = MEMBERS) {}

  async listMembers() {
    return this.members;
  }

  async resetPassword(): Promise<boolean> {
    return true;
  }

  async removeMember(targetUserId: string): Promise<boolean> {
    this.removeCalls.push(targetUserId);
    if (this.pending) {
      return new Promise(() => {});
    }
    if (this.removeResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.removeResult;
  }

  async grantRole(targetUserId: string, role: string): Promise<boolean> {
    this.grantCalls.push([targetUserId, role]);
    if (this.grantResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.grantResult;
  }

  async revokeRole(targetUserId: string, role: string): Promise<boolean> {
    this.revokeCalls.push([targetUserId, role]);
    if (this.revokeResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.revokeResult;
  }
}

function renderScreen(repo: FakeSchoolMemberRepository = new FakeSchoolMemberRepository()) {
  return render(
    <ModeProvider>
      <SchoolMembershipScreen schoolMemberService={new SchoolMemberApplicationService(repo)} />
    </ModeProvider>,
  );
}

describe("SchoolMembershipScreen", () => {
  it("shows an empty state when there are no other school members", async () => {
    renderScreen(new FakeSchoolMemberRepository([]));

    expect(await screen.findByText("No other school members yet.")).toBeInTheDocument();
  });

  it("lists members with their username and role", async () => {
    renderScreen();

    expect(await screen.findByText("Corazon Santos")).toBeInTheDocument();
    expect(screen.getByText("corazon.santos")).toBeInTheDocument();
    expect(screen.getByText("School Head")).toBeInTheDocument();
    expect(screen.getByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText("ana.cruz")).toBeInTheDocument();
    expect(screen.getByText("Teacher")).toBeInTheDocument();
  });

  it("shows a placeholder for a member with no role granted yet", async () => {
    renderScreen(
      new FakeSchoolMemberRepository([
        { id: "u-none", username: "bo.reyes", displayName: "Bo Reyes", roles: [] },
      ]),
    );

    expect(await screen.findByText("No role assigned yet")).toBeInTheDocument();
  });

  it("requires a plain-language confirmation step before removing a member", async () => {
    const repo = new FakeSchoolMemberRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Remove member" }).at(1)!);

    expect(
      screen.getByText(/They will lose access to this school’s records right away/),
    ).toBeInTheDocument();
    expect(repo.removeCalls).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText(/They will lose access to this school’s records right away/),
    ).not.toBeInTheDocument();
    expect(repo.removeCalls).toHaveLength(0);
  });

  it("removes a member only after the confirmation step is accepted, and shows a plain-language success message", async () => {
    const repo = new FakeSchoolMemberRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Remove member" }).at(1)!);
    await user.click(screen.getByRole("button", { name: "Yes, remove this member" }));

    expect(repo.removeCalls).toEqual(["u-teacher"]);
    expect(
      await screen.findByText("Ana Cruz was removed and can no longer access this school."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ana Cruz")).not.toBeInTheDocument();
  });

  it("shows a generic failure message on a false result, without leaking why it failed", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.removeResult = false;
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Remove member" }).at(1)!);
    await user.click(screen.getByRole("button", { name: "Yes, remove this member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not remove this member/i);
    expect(screen.getByText("Ana Cruz")).toBeInTheDocument();
  });

  it("shows the same generic failure message on a thrown Unauthorized error", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.removeResult = "reject";
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Remove member" }).at(1)!);
    await user.click(screen.getByRole("button", { name: "Yes, remove this member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not remove this member/i);
  });

  it("shows an error message when loading fails", async () => {
    class FailingSchoolMemberRepository extends FakeSchoolMemberRepository {
      override async listMembers(): Promise<SchoolMember[]> {
        throw new Error("boom");
      }
    }
    render(
      <ModeProvider>
        <SchoolMembershipScreen
          schoolMemberService={
            new SchoolMemberApplicationService(new FailingSchoolMemberRepository())
          }
        />
      </ModeProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen(new FakeSchoolMemberRepository([]));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "School Members" })).toHaveFocus(),
    );
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen(new FakeSchoolMemberRepository([]));
    await screen.findByText("No other school members yet.");

    expect(screen.getByText(/able to sign in to your school/i)).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen(new FakeSchoolMemberRepository([]));
    await screen.findByText("No other school members yet.");

    expect(screen.queryByText(/able to sign in to your school/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while the confirmation step is open", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Remove member" }).at(1)!);
    await expectNoAccessibilityViolations(container);
  });

  it("grants an additional role via the picker without a heavy confirmation step", async () => {
    const repo = new FakeSchoolMemberRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Grant a role" }).at(1)!);
    await user.click(screen.getByRole("button", { name: "Grant role" }));

    expect(repo.grantCalls).toEqual([["u-teacher", "registrar"]]);
    expect(await screen.findByText("Ana Cruz was granted the Registrar role.")).toBeInTheDocument();
  });

  it("shows a generic failure message when a role grant fails", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.grantResult = false;
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getAllByRole("button", { name: "Grant a role" }).at(1)!);
    await user.click(screen.getByRole("button", { name: "Grant role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not grant this role/i);
  });

  it("revokes one of several roles immediately, without a heavy confirmation step", async () => {
    const repo = new FakeSchoolMemberRepository([
      {
        id: "u-multi",
        username: "bo.reyes",
        displayName: "Bo Reyes",
        roles: ["teacher", "registrar"],
      },
    ]);
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Bo Reyes");

    await user.click(screen.getByRole("button", { name: "Remove Teacher role from Bo Reyes" }));

    await waitFor(() => expect(repo.revokeCalls).toEqual([["u-multi", "teacher"]]));
    expect(await screen.findByText("Teacher was removed from Bo Reyes.")).toBeInTheDocument();
  });

  it("requires a plain-language confirmation before revoking a member's only role", async () => {
    const repo = new FakeSchoolMemberRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getByRole("button", { name: "Remove Teacher role from Ana Cruz" }));

    expect(screen.getByText("Remove this role?")).toBeInTheDocument();
    expect(repo.revokeCalls).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(repo.revokeCalls).toHaveLength(0);
  });

  it("revokes a member's only role after the confirmation step is accepted", async () => {
    const repo = new FakeSchoolMemberRepository();
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getByRole("button", { name: "Remove Teacher role from Ana Cruz" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove this role" }));

    expect(repo.revokeCalls).toEqual([["u-teacher", "teacher"]]);
    expect(await screen.findByText("Teacher was removed from Ana Cruz.")).toBeInTheDocument();
  });

  it("shows a generic failure message when a role revoke fails", async () => {
    const repo = new FakeSchoolMemberRepository();
    repo.revokeResult = false;
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText("Ana Cruz");

    await user.click(screen.getByRole("button", { name: "Remove Teacher role from Ana Cruz" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove this role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not remove this role/i);
  });
});
