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

function attendanceStatusTone(markedCount: number, totalCount: number): StatusChipTone {
  if (totalCount === 0) return "neutral";
  if (markedCount === 0) return "warning";
  if (markedCount === totalCount) return "success";
  return "productive";
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A teacher's at-a-glance landing view — today's attendance-marking
 * status per section, each section's currently-open grading period (if
 * any), roster/section counts, and recent sign-in activity.
 * Deliberately built entirely from data every other screen already
 * fetches (sections, today's roster per section, grading periods per
 * school year, the learner list, the audit log) rather than a new
 * backend query — see `docs/adr/0024-teacher-workspace.md` and
 * `docs/adr/0028-workspace-grading-period-status.md`.
 */
export function TeacherWorkspaceScreen({
  displayName,
  attendanceService,
  authService,
  gradingService,
  learnerService,
  sectionService,
}: TeacherWorkspaceScreenProps) {
  const { mode } = useTeacherMode();
  const [learnerCount, setLearnerCount] = useState<number | null>(null);
  const [sectionSummaries, setSectionSummaries] = useState<SectionAttendanceSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = todayAsIsoDate();

    async function load() {
      try {
        const [learners, sections, activity] = await Promise.all([
          learnerService.listLearners(),
          sectionService.listSections(),
          authService.listAuditLog(),
        ]);
        if (cancelled) return;
        setLearnerCount(learners.length);
        setRecentActivity(activity.slice(0, RECENT_ACTIVITY_LIMIT));

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
        if (!cancelled) setSectionSummaries(summaries);
      } catch {
        if (!cancelled) setError("Could not load your workspace overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [attendanceService, authService, gradingService, learnerService, sectionService]);

  return (
    <section aria-label="Workspace">
      <PageHeader
        title={`Welcome, ${displayName}`}
        hint={
          mode === "guided" && (
            <p className="field-hint">
              This is your workspace overview — today's attendance-marking status for each of your
              sections, and recent sign-in activity for your school.
            </p>
          )
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Loading label="Loading your workspace…" />
      ) : (
        <>
          <p>
            {learnerCount} learner{learnerCount === 1 ? "" : "s"} across {sectionSummaries.length}{" "}
            section{sectionSummaries.length === 1 ? "" : "s"}.
          </p>

          <h3>Today's attendance</h3>
          {sectionSummaries.length === 0 ? (
            <p>No sections created yet.</p>
          ) : (
            <ul className="learner-list">
              {sectionSummaries.map(({ section, markedCount, totalCount, openGradingPeriod }) => (
                <li key={section.id}>
                  {section.name} — Grade {section.gradeLevel}:{" "}
                  <StatusChip tone={attendanceStatusTone(markedCount, totalCount)}>
                    {totalCount === 0
                      ? "no learners enrolled"
                      : markedCount === 0
                        ? "not yet marked today"
                        : markedCount === totalCount
                          ? `all ${totalCount} marked`
                          : `${markedCount} of ${totalCount} marked`}
                  </StatusChip>
                  <span className="field-hint">
                    {" "}
                    —{" "}
                    {openGradingPeriod
                      ? `${openGradingPeriod.label} is open`
                      : "no grading period currently open"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3>Recent sign-in activity</h3>
          {recentActivity.length === 0 ? (
            <p>No sign-in activity recorded yet.</p>
          ) : (
            <ul className="learner-list">
              {recentActivity.map((entry) => (
                <li key={entry.id}>
                  {entry.username} {EVENT_LABELS[entry.eventType]} — {formatWhen(entry.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
