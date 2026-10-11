import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  clearSessionDrafts,
  readSessionDraft,
  retainSessionDraft,
  sessionDraftEpoch,
} from "./ui/session-draft-store";
import type { CurrentSession } from "./domain/session";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  // Far in the future, not the same magic-past-timestamp convention as
  // expiresAtUnixMs above -- IdleTimeoutWarning polls this on mount and
  // would otherwise immediately treat every signed-in test as idle-
  // expired (see ADR-0026).
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
  roles: ["teacher"],
};

beforeEach(() => {
  mockInvoke.mockReset();
  clearSessionDrafts();
});

describe("App", () => {
  it("does not infer sign-in or first-run setup from a failed startup read and can retry", async () => {
    let failed = true;
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status")
        return failed
          ? Promise.reject(new Error("private database path"))
          : Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(null);
      if (command === "list_schools") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    render(<App />);
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private database path");
    expect(screen.queryByRole("form", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Set up your school" })).not.toBeInTheDocument();
    failed = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry startup" }));
    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
  });

  it("opens the real Today aggregate as the signed-in landing destination", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "get_my_day_summary")
        return Promise.resolve({
          schedule: [],
          next: null,
          pendingAttendance: [],
          pendingAssignments: [],
          pendingConflicts: [],
          pendingScoring: [],
          pendingFollowups: [],
          hasAnyAssignments: false,
        });
      return Promise.resolve(null);
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("get_my_day_summary", expect.anything()),
    );
    expect(document.title).toBe("Today · LIKHA-SIS");
    expect(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", {
        name: "Today",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["same account and school", session, true],
    ["different account", { ...session, userId: "other" }, false],
    ["different school", { ...session, schoolId: "other-school" }, false],
  ] as const)(
    "isolates retained drafts after reauthentication: %s",
    async (_label, next, retained) => {
      let current = session;
      mockInvoke.mockImplementation((command) => {
        if (command === "installation_status") return Promise.resolve({ needsSetup: false });
        if (command === "current_session") return Promise.resolve(current);
        if (command === "get_my_day_summary")
          return Promise.resolve({
            schedule: [],
            next: null,
            pendingAttendance: [],
            pendingAssignments: [],
            pendingConflicts: [],
            pendingScoring: [],
            pendingFollowups: [],
            hasAnyAssignments: false,
          });
        if (command === "list_audit_log") return Promise.reject("unauthorized");
        if (command === "list_schools")
          return Promise.resolve([
            { id: next.schoolId, name: next.schoolName, createdAt: "synthetic" },
          ]);
        if (command === "login") {
          current = next;
          return Promise.resolve(next);
        }
        return Promise.resolve(null);
      });
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole("heading", { name: "Today" });
      const scope = JSON.stringify([
        JSON.stringify([session.userId, session.schoolId]),
        "sentinel",
        sessionDraftEpoch(),
      ]);
      retainSessionDraft(scope, "unfinished teacher work");
      await user.click(screen.getByRole("button", { name: "More" }));
      await user.click(screen.getByRole("button", { name: "Sign-in Activity" }));
      await screen.findByRole("form", { name: "Sign in" });
      expect(readSessionDraft(scope, () => "empty")).toBe("unfinished teacher work");
      await user.type(screen.getByLabelText("Username"), next.username);
      await user.type(screen.getByLabelText("Password"), "synthetic-password");
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByRole("heading", { name: "Today" });
      expect(readSessionDraft(scope, () => "empty")).toBe(
        retained ? "unfinished teacher work" : "empty",
      );
    },
  );

  it("shows the first-run setup screen when the backend reports the install needs setup", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: true });
      if (command === "current_session") return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("form", { name: "Set up your school" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows the sign-in screen when setup is already done and there is no current session", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(null);
      if (command === "list_schools") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "LIKHA-SIS" })).toBeInTheDocument();
  });

  it("keeps authorized assigned classes available from Dashboard", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_teacher_assignments") return Promise.resolve([]);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Dashboard" }));
    expect(await screen.findByRole("heading", { name: "My classes" })).toBeInTheDocument();
    expect(await screen.findByText("No teaching assignments yet.")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("list_teacher_assignments", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("list_learners_by_school", expect.anything());
    expect(screen.getAllByText(/Rizal Elementary/).length).toBeGreaterThan(0);
  });

  it("shows the school-head Home view switch for a session that holds school_head", async () => {
    const schoolHeadSession: CurrentSession = {
      ...session,
      roles: ["school_head", "teacher"],
    };
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(schoolHeadSession);
      if (command === "list_teacher_assignments") return Promise.resolve([]);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_sf1_import_history") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Dashboard" }));
    const group = await screen.findByRole("group", { name: "Home view" });
    expect(within(group).getByRole("button", { name: "School overview" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "School overview" })).toBeInTheDocument();
  });

  it("keeps Today and six primary destinations and preserves specialist tools in More", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_teacher_assignments") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Dashboard" }));
    await screen.findByRole("heading", { name: "My classes" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("button")).toHaveLength(7);
    for (const destination of [
      "Today",
      "Dashboard",
      "My Advisory",
      "Class Record",
      "School Forms",
      "Calendar",
      "More",
    ]) {
      expect(within(nav).getByRole("button", { name: destination })).toBeInTheDocument();
    }
    await userEvent.setup().click(within(nav).getByRole("button", { name: "More" }));
    const directory = await screen.findByRole("region", { name: "More" });
    for (const destination of [
      "Daily teaching planner",
      "Today's Classes",
      "Attendance",
      "Subject Attendance",
      "My Subject Attendance",
      "My Advisory",
      "My Teaching Load",
      "Monthly Summary",
      "Learners",
      "Sections",
      "Import Learners (SF1)",
      "Grading Periods",
      "Record management",
      "Lesson Plans",
      "Sync Status",
      "Review Sync Conflicts",
      "Sign-in Activity",
      "Reset a Password",
      "School Members",
      "Devices",
      "School Logo",
    ]) {
      expect(
        within(directory).getAllByRole("button", { name: destination }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("sets the browser tab title to the active destination", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_teacher_assignments") return Promise.resolve([]);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });
    const user = userEvent.setup();

    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Dashboard" }));
    await screen.findByRole("heading", { name: "My classes" });
    await waitFor(() => expect(document.title).toBe("Dashboard · LIKHA-SIS"));

    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "More" }));
    const directory = await screen.findByRole("region", { name: "More" });
    await user.click(within(directory).getByRole("button", { name: "Learners" }));

    await waitFor(() => expect(document.title).toBe("Learners · LIKHA-SIS"));
  });

  it("shows the learner screen after switching to the Learners tab", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_teacher_assignments") return Promise.resolve([]);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });
    const user = userEvent.setup();

    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Dashboard" }));
    await screen.findByRole("heading", { name: "My classes" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "More" }));
    const directory = await screen.findByRole("region", { name: "More" });
    await user.click(within(directory).getByRole("button", { name: "Learners" }));

    expect(await screen.findByRole("region", { name: "Learners" })).toBeInTheDocument();
  });

  it("remembers the grading period and weighting chosen for a class across destinations", async () => {
    // M05's acceptance clause: the teacher should not repeatedly reselect
    // grade/section/subject/term when the active class already determines
    // them. The Class Folio remounts when the teacher moves between
    // Dashboard, My Classes and Class Record; without App-held state each
    // remount would blank the grading period and weighting the teacher
    // already chose for that class.
    const assignment = {
      id: "ta-1",
      sectionId: "sec-1",
      sectionName: "Grade 8 – Joy",
      schoolYear: "2026-2027",
      subjectId: "subj-1",
      subjectName: "Filipino",
    };
    const savedRecord = {
      id: "cr-1",
      schoolId: "s1",
      sectionId: "sec-1",
      sectionName: "Grade 8 – Joy",
      subjectId: "subj-1",
      subjectName: "Filipino",
      gradingPeriodId: "gp-1",
      gradingPeriodLabel: "Term 1",
      schoolYear: "2026-2027",
      weightPolicyId: "wp-1",
      weightPolicyName: "Core Weighting",
      createdAt: "now",
      itemCount: 0,
      recordedCount: 0,
      totalEligible: 0,
    };
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_teacher_assignments") return Promise.resolve([assignment]);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      if (command === "subject_attendance_monitor") return Promise.resolve({ rows: [] });
      if (command === "list_grading_periods_by_school_year")
        return Promise.resolve([
          {
            id: "gp-1",
            schoolId: "s1",
            schoolYear: "2026-2027",
            policyPeriodId: "pp-1",
            label: "Term 1",
            startsOn: "2026-06-01",
            endsOn: "2026-09-30",
            createdAt: "now",
          },
        ]);
      if (command === "list_grading_weight_policies")
        return Promise.resolve([
          {
            id: "wp-1",
            name: "Core Weighting",
            sourceCitation: "Synthetic fixture",
            isDefault: true,
          },
        ]);
      if (command === "list_class_records_by_school") return Promise.resolve([savedRecord]);
      if (command === "list_assessment_items_by_class_record") return Promise.resolve([]);
      if (command === "list_assessment_category_sets") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Dashboard" }));
    await screen.findByRole("button", { name: "Filipino · Grade 8 – Joy" });

    // Open the Scores worksheet for the one authorized class and choose the
    // term and weighting explicitly — the academic choice this test is about.
    await user.click(screen.getByRole("button", { name: "View scores" }));
    await user.selectOptions(await screen.findByLabelText("Grading period"), "gp-1");
    await user.selectOptions(screen.getByLabelText("DepEd grading weighting"), "wp-1");
    await user.click(screen.getByRole("button", { name: "Open class record" }));

    // Leaving and returning to the Class Record destination remounts the
    // folio. The teacher should not be asked for the term again.
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "Dashboard" }));
    await user.click(within(nav).getByRole("button", { name: "Class Record" }));

    expect(await screen.findByLabelText("Grading period")).toHaveValue("gp-1");
    expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue("wp-1");
    expect(screen.getByRole("button", { name: "Open class record" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("returns to sign-in with a clear notice when a command fails because the session expired", async () => {
    // The client believed it had an active session (current_session
    // returned one), but the backend has since idle-timed it out, been
    // revoked, or hit its absolute TTL — the first real protected
    // command discovers this. See ADR-0022 / src/infrastructure/tauri/invoke.ts.
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_teacher_assignments") return Promise.resolve([]);
      if (command === "get_school_logo") return Promise.reject("unauthorized");
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      if (command === "list_schools") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/session has expired/i);
  });
});
