import { useEffect, useState } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { AuthApplicationService } from "../application/auth-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { SectionApplicationService } from "../application/section-service";
import type { GradingPeriod } from "../domain/grading";
import type { AuditEventType, AuditLogEntry } from "../domain/session";
import type { Section } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { PageHeader } from "./components/PageHeader";
import { StatusChip, type StatusChipTone } from "./components/StatusChip";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TeacherWorkspaceScreenProps {
  displayName: string;
  attendanceService: AttendanceApplicationService;
  authService: AuthApplicationService;
  gradingService: GradingApplicationService;
  learnerService: LearnerApplicationService;
  sectionService: SectionApplicationService;
  /** Opens Attendance with this section already selected -- narrowly
   * typed, owned by `App.tsx`'s own tab/selection state, not a router or
   * URL param. See docs/adr/0032-teacher-workspace-polish.md. */
  onOpenAttendance: (sectionId: string) => void;
  /** Opens Sections -- used both for "no sections yet" and "this
   * section has no learners enrolled" (enrollment happens there). */
  onManageSections: () => void;
  /** Opens Sign-in Activity. */
  onViewAuditLog: () => void;
}

interface SectionAttendanceSummary {
  section: Section;
  markedCount: number;
  totalCount: number;
  /** The grading period whose date range covers today, among this
   * section's own school year's periods -- `null` if none is currently
   * open (no period created yet for today's date, or today falls in a
   * gap between periods). See ADR-0028: resolved per section's own
   * `schoolYear`, not a single value assumed to apply to every
   * section, since sections can in principle carry different school
   * years. */
  openGradingPeriod: GradingPeriod | null;
}

/** True if `today` (an ISO `YYYY-MM-DD` string) falls within
 * `[startsOn, endsOn]` inclusive -- plain string comparison is valid
 * here since ISO date strings sort lexicographically the same as
 * chronologically. */
function isPeriodOpenOn(period: GradingPeriod, today: string): boolean {
  return period.startsOn <= today && today <= period.endsOn;
}

const RECENT_ACTIVITY_LIMIT = 5;

const EVENT_LABELS: Record<AuditEventType, string> = {
  login_success: "signed in",
  login_failed: "failed sign-in attempt",
  account_locked: "account temporarily locked",
  logout: "signed out",
  password_reset_by_admin: "had their password reset by an administrator",
};

/** Formats an ISO timestamp as a readable local date and time -- raw
 * `created_at` values are ISO strings meant for storage/ordering, not
 * for a teacher to read directly (same fix `AuditLogScreen.tsx`'s
 * `formatWhen` applies for its own audit-log table). Falls back to the
 * raw string for anything that doesn't parse as a real date. */
function formatWhen(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AttendanceState = "not-started" | "partial" | "complete" | "no-learners";

function attendanceState(markedCount: number, totalCount: number): AttendanceState {
  if (totalCount === 0) return "no-learners";
  if (markedCount === 0) return "not-started";
  if (markedCount < totalCount) return "partial";
  return "complete";
}

const ATTENDANCE_STATE_TONE: Record<AttendanceState, StatusChipTone> = {
  "not-started": "warning",
  partial: "productive",
  complete: "success",
  "no-learners": "neutral",
};

const ATTENDANCE_STATE_LABEL: Record<AttendanceState, (marked: number, total: number) => string> = {
  "not-started": () => "not yet marked today",
  partial: (marked, total) => `${marked} of ${total} marked`,
  complete: (_marked, total) => `all ${total} marked`,
  "no-learners": () => "no learners enrolled",
};

/** Today's-priority ordering: the state a teacher most needs to act on
 * first sorts first. Not started is the most urgent (nothing done yet);
 * partial still needs finishing; complete needs nothing further;
 * no-learners has no attendance task at all yet, so it sorts last.
 * Ties break alphabetically by section name so the order is fully
 * deterministic, not incidental to fetch order. This ordering was a
 * deliberate choice for UX-02 (docs/adr/0032-teacher-workspace-polish.md),
 * not the default "whatever the backend returned" order the screen used
 * before it. */
const ATTENDANCE_STATE_PRIORITY: Record<AttendanceState, number> = {
  "not-started": 0,
  partial: 1,
  complete: 2,
  "no-learners": 3,
};

function sortByPriority(summaries: SectionAttendanceSummary[]): SectionAttendanceSummary[] {
  return [...summaries].sort((a, b) => {
    const rankDiff =
      ATTENDANCE_STATE_PRIORITY[attendanceState(a.markedCount, a.totalCount)] -
      ATTENDANCE_STATE_PRIORITY[attendanceState(b.markedCount, b.totalCount)];
    return rankDiff !== 0 ? rankDiff : a.section.name.localeCompare(b.section.name);
  });
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A teacher's at-a-glance landing view — a priority-ranked "Today's
 * attendance" rail (which sections need marking, in what order),
 * currently-open grading period per section, roster/section counts,
 * one-click actions into the real workflow, and recent sign-in
 * activity. Deliberately built entirely from data every other screen
 * already fetches (sections, today's roster per section, grading
 * periods per school year, the learner list, the audit log) rather
 * than a new backend query — see `docs/adr/0024-teacher-workspace.md`,
 * `docs/adr/0028-workspace-grading-period-status.md`, and
 * `docs/adr/0032-teacher-workspace-polish.md`.
 *
 * Loading is split into two independent paths on purpose: the critical
 * attendance/grading overview, and the secondary recent-activity list.
 * A failure in the secondary path must never discard a successfully
 * loaded critical overview (or vice versa) — each has its own error
 * state and its own retry.
 */
export function TeacherWorkspaceScreen({
  displayName,
  attendanceService,
  authService,
  gradingService,
  learnerService,
  sectionService,
  onOpenAttendance,
  onManageSections,
  onViewAuditLog,
}: TeacherWorkspaceScreenProps) {
  const { mode } = useTeacherMode();
  const [learnerCount, setLearnerCount] = useState<number | null>(null);
  const [sectionSummaries, setSectionSummaries] = useState<SectionAttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewRetryKey, setOverviewRetryKey] = useState(0);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRetryKey, setActivityRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const today = todayAsIsoDate();

    async function loadOverview() {
      setError(null);
      setLoading(true);
      try {
        const [learners, sections] = await Promise.all([
          learnerService.listLearners(),
          sectionService.listSections(),
        ]);
        if (cancelled) return;
        setLearnerCount(learners.length);

        // Fetch each distinct school year's periods once, not once per
        // section -- sections commonly share a school year, and a
        // separate call per section would be redundant work against the
        // same data.
        const schoolYears = [...new Set(sections.map((section) => section.schoolYear))];
        const periodsByYear = new Map<string, GradingPeriod[]>();
        await Promise.all(
          schoolYears.map(async (schoolYear) => {
            periodsByYear.set(schoolYear, await gradingService.listPeriodsBySchoolYear(schoolYear));
          }),
        );

        const summaries = await Promise.all(
          sections.map(async (section) => {
            const roster = await attendanceService.rosterForDate(section.id, today);
            const periods = periodsByYear.get(section.schoolYear) ?? [];
            return {
              section,
              markedCount: roster.filter((entry) => entry.status !== null).length,
              totalCount: roster.length,
              openGradingPeriod: periods.find((period) => isPeriodOpenOn(period, today)) ?? null,
            };
          }),
        );
        if (!cancelled) setSectionSummaries(sortByPriority(summaries));
      } catch {
        if (!cancelled) setError("Could not load your workspace overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [attendanceService, gradingService, learnerService, sectionService, overviewRetryKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      setActivityError(null);
      setActivityLoading(true);
      try {
        const activity = await authService.listAuditLog();
        if (!cancelled) setRecentActivity(activity.slice(0, RECENT_ACTIVITY_LIMIT));
      } catch {
        if (!cancelled) setActivityError("Could not load recent sign-in activity.");
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    }

    loadActivity();
    return () => {
      cancelled = true;
    };
  }, [authService, activityRetryKey]);

  return (
    <section aria-label="Workspace">
      <PageHeader
        title={`Welcome, ${displayName}`}
        hint={
          mode === "guided" && (
            <p className="field-hint">
              This is your workspace overview — today's attendance-marking status for each of your
              sections, in the order that needs your attention first, plus recent sign-in activity
              for your school.
            </p>
          )
        }
      />

      {error ? (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={() => setOverviewRetryKey((key) => key + 1)}>
            Try again
          </button>
        </Alert>
      ) : loading ? (
        <Loading label="Loading your workspace…" />
      ) : (
        <>
          <p className="workspace-summary">
            {learnerCount} learner{learnerCount === 1 ? "" : "s"} across {sectionSummaries.length}{" "}
            section{sectionSummaries.length === 1 ? "" : "s"}.
          </p>

          <h3>Today's attendance</h3>
          {sectionSummaries.length === 0 ? (
            <EmptyState>
              No sections created yet.{" "}
              <button type="button" onClick={onManageSections}>
                Create a section
              </button>
            </EmptyState>
          ) : (
            <ul className="workspace-priority-rail">
              {sectionSummaries.map(({ section, markedCount, totalCount, openGradingPeriod }) => {
                const state = attendanceState(markedCount, totalCount);
                return (
                  <li key={section.id} className={`workspace-priority-item is-${state}`}>
                    <div className="workspace-priority-main">
                      <span className="workspace-priority-section">
                        {section.name} — Grade {section.gradeLevel}
                      </span>
                      <StatusChip tone={ATTENDANCE_STATE_TONE[state]}>
                        {ATTENDANCE_STATE_LABEL[state](markedCount, totalCount)}
                      </StatusChip>
                      <span className="field-hint workspace-priority-period">
                        {openGradingPeriod
                          ? `${openGradingPeriod.label} is open`
                          : "no grading period currently open"}
                      </span>
                    </div>
                    {state === "no-learners" ? (
                      <button type="button" onClick={onManageSections}>
                        Manage sections
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => onOpenAttendance(section.id)}
                      >
                        {state === "not-started"
                          ? "Mark attendance"
                          : state === "partial"
                            ? "Continue attendance"
                            : "Review attendance"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* Rendered as a sibling of the overview block above, not nested
       * inside it -- a failed/loading overview must not hide a
       * successfully-loaded activity list, matching this screen's own
       * split-loading independence guarantee in both directions. See
       * docs/adr/0032-teacher-workspace-polish.md. */}
      <h3>Recent sign-in activity</h3>
      {activityError ? (
        <Alert tone="error">
          <p>{activityError}</p>
          <button type="button" onClick={() => setActivityRetryKey((key) => key + 1)}>
            Try again
          </button>
        </Alert>
      ) : activityLoading ? (
        <Loading label="Loading recent activity…" />
      ) : recentActivity.length === 0 ? (
        <EmptyState>No sign-in activity recorded yet.</EmptyState>
      ) : (
        <>
          <ul className="learner-list workspace-activity-list">
            {recentActivity.map((entry) => (
              <li key={entry.id}>
                {entry.username} {EVENT_LABELS[entry.eventType]} — {formatWhen(entry.createdAt)}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onViewAuditLog}>
            View all sign-in activity
          </button>
        </>
      )}
    </section>
  );
}
