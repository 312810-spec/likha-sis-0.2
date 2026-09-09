import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { TeacherOversightAssignmentApplicationService } from "../application/teacher-oversight-assignment-service";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { TeacherOversightAssignmentRepository } from "../domain/ports/teacher-oversight-assignment-repository";
import type { SchoolMember } from "../domain/school-member";
import type {
  AssignOversightOutcome,
  EndOversightOutcome,
  TeacherOversightAssignment,
} from "../domain/teacher-oversight-assignment";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { TeacherOversightScreen } from "./TeacherOversightScreen";

const MEMBERS: SchoolMember[] = [
  { id: "mt-1", username: "mt.one", displayName: "MT One", roles: ["master_teacher"] },
  { id: "teacher-1", username: "ana.cruz", displayName: "Ana Cruz", roles: ["teacher"] },
  { id: "teacher-2", username: "ben.reyes", displayName: "Ben Reyes", roles: ["teacher"] },
];

const ACTIVE_ASSIGNMENT: TeacherOversightAssignment = {
  id: "oa-1",
  schoolId: "school-1",
  masterTeacherUserId: "mt-1",
  teacherUserId: "teacher-1",
  startsOn: "2026-06-01",
  endsOn: null,
  createdAt: "now",
};

class FakeSchoolMemberRepository implements SchoolMemberRepository {
  async listMembers() {
    return MEMBERS;
  }
  async resetPassword(): Promise<boolean> {
    return true;
  }
  async removeMember(): Promise<boolean> {
    return true;
  }
  async grantRole(): Promise<boolean> {
    return true;
  }
  async revokeRole(): Promise<boolean> {
    return true;
  }
}

class FakeTeacherOversightAssignmentRepository implements TeacherOversightAssignmentRepository {
  assignments: TeacherOversightAssignment[] = [];
  assignResult: AssignOversightOutcome = {
    kind: "assigned",
    assignment: ACTIVE_ASSIGNMENT,
  };
  endResult: EndOversightOutcome = { kind: "ended", assignment: ACTIVE_ASSIGNMENT };
  assignCalls: unknown[] = [];
  endCalls: unknown[] = [];

  async listForSchool() {
    return this.assignments;
  }
  async currentOverseer(): Promise<TeacherOversightAssignment | null> {
    return null;
  }
  async assign(masterTeacherUserId: string, teacherUserId: string, startsOn: string) {
    this.assignCalls.push([masterTeacherUserId, teacherUserId, startsOn]);
    return this.assignResult;
  }
  async end(teacherUserId: string, assignmentId: string, endsOn: string) {
    this.endCalls.push([teacherUserId, assignmentId, endsOn]);
    return this.endResult;
  }
}

function renderScreen(
  memberRepo: FakeSchoolMemberRepository = new FakeSchoolMemberRepository(),
  oversightRepo: FakeTeacherOversightAssignmentRepository = new FakeTeacherOversightAssignmentRepository(),
) {
  const utils = render(
    <ModeProvider>
      <TeacherOversightScreen
        teacherOversightAssignmentService={
          new TeacherOversightAssignmentApplicationService(oversightRepo)
        }
        schoolMemberService={new SchoolMemberApplicationService(memberRepo)}
      />
    </ModeProvider>,
  );
  return { ...utils, memberRepo, oversightRepo };
}

describe("TeacherOversightScreen", () => {
  it("shows an empty state when there are no active or past assignments", async () => {
    renderScreen();
    expect(await screen.findByText("No active oversight assignments yet.")).toBeInTheDocument();
    expect(screen.getByText("No ended oversight assignments yet.")).toBeInTheDocument();
  });

  it("lists an active assignment with who oversees whom and since when", async () => {
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.assignments = [ACTIVE_ASSIGNMENT];
    renderScreen(undefined, oversightRepo);

    expect(await screen.findByText("MT One oversees Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText("Since 2026-06-01")).toBeInTheDocument();
  });

  it("assigns a new oversight via the form", async () => {
    const user = userEvent.setup();
    const { oversightRepo } = renderScreen();

    await screen.findByRole("button", { name: /assign oversight/i });
    await user.selectOptions(screen.getByLabelText("Master Teacher"), "mt-1");
    await user.selectOptions(screen.getByLabelText("Teacher"), "teacher-1");
    await user.click(screen.getByRole("button", { name: /assign oversight/i }));

    await waitFor(() =>
      expect(oversightRepo.assignCalls).toEqual([["mt-1", "teacher-1", expect.any(String)]]),
    );
    expect(await screen.findByText(/now oversees/i)).toBeInTheDocument();
  });

  it("shows a specific message when the proposed overseer does not hold the Master Teacher role", async () => {
    const user = userEvent.setup();
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.assignResult = { kind: "notAMasterTeacher" };
    renderScreen(undefined, oversightRepo);

    await screen.findByRole("button", { name: /assign oversight/i });
    await user.selectOptions(screen.getByLabelText("Master Teacher"), "mt-1");
    await user.selectOptions(screen.getByLabelText("Teacher"), "teacher-1");
    await user.click(screen.getByRole("button", { name: /assign oversight/i }));

    expect(
      await screen.findByText(/does not currently hold the Master Teacher role/i),
    ).toBeInTheDocument();
  });

  it("ends an active assignment via the two-step confirmation", async () => {
    const user = userEvent.setup();
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.assignments = [ACTIVE_ASSIGNMENT];
    renderScreen(undefined, oversightRepo);

    await user.click(await screen.findByRole("button", { name: "End assignment" }));
    await user.click(screen.getByRole("button", { name: /yes, end this assignment/i }));

    await waitFor(() => expect(oversightRepo.endCalls.length).toBe(1));
    expect(oversightRepo.endCalls[0]).toEqual(["teacher-1", "oa-1", expect.any(String)]);
  });

  it("has no detectable accessibility violations with an active assignment listed", async () => {
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.assignments = [ACTIVE_ASSIGNMENT];
    const { container } = renderScreen(undefined, oversightRepo);

    await screen.findByText("MT One oversees Ana Cruz");
    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations while the end-assignment confirmation is open", async () => {
    const user = userEvent.setup();
    const oversightRepo = new FakeTeacherOversightAssignmentRepository();
    oversightRepo.assignments = [ACTIVE_ASSIGNMENT];
    const { container } = renderScreen(undefined, oversightRepo);

    await user.click(await screen.findByRole("button", { name: "End assignment" }));
    await expectNoAccessibilityViolations(container);
  });
});
