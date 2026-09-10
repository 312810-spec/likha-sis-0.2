import { useEffect, useRef, useState, type JSX } from "react";
import type { LearnerApplicationService } from "../../application/learner-service";
import type { SchoolAttendanceApplicationService } from "../../application/school-attendance-service";
import type { SchoolMemberApplicationService } from "../../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../../application/section-advisory-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { TeachingAssignmentApplicationService } from "../../application/teaching-assignment-service";
import type { SchoolDayAttendanceTotals } from "../../domain/attendance";
import type { Learner } from "../../domain/learner";
import type { SchoolMember } from "../../domain/school-member";
import type { Section } from "../../domain/section";
import type { TeacherLoad } from "../../domain/teacher-load";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { Loading } from "../components/Loading";
import { Page } from "../components/Page";
import { StatusChip, type StatusChipTone } from "../components/StatusChip";
import { useTeacherMode } from "../theme/useTeacherMode";

interface SchoolHeadHomeProps {
  schoolName: string;
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
  schoolAttendanceService: SchoolAttendanceApplicationService;
  sectionAdvisoryService: SectionAdvisoryApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  teachingAssignmentService: TeachingAssignmentApplicationService;
  onManageSections: () => void;
  onOpenSf1Import: () => void;
  onViewTeacherLoad: () => void;
}

/** Attendance-rate tone thresholds. The detail line always states the raw
 * present/marked counts, so the colour is never the only signal. */
const ATTENDANCE_SUCCESS_PCT = 85;
const ATTENDANCE_WARNING_PCT = 60;

/** Teaching-load outlier heuristic: flag the single highest-minutes
 * teacher only when their weekly instructional minutes exceed this
 * multiple of the median of all teachers' minutes. A display hint to
 * help a School Head notice an uneven spread, not an enforced cap. */
const TEACHING_LOAD_OUTLIER_MEDIAN_MULTIPLE = 1.5;

interface TeacherLoadRow {
  teacher: SchoolMember;
  load: TeacherLoad;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `YYYY-MM-DD` -> `4 Sep 2026`. */
function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : iso;
}

function sharedSchoolYear(sections: Section[]): string {
  const years = new Set(sections.map((section) => section.schoolYear));
  return years.size === 1 ? ([...years][0] ?? "—") : "—";
}

function sectionsSpanMultipleYears(sections: Section[]): boolean {
  return new Set(sections.map((section) => section.schoolYear)).size > 1;
}

function formatMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Plain median of a numeric list; 0 for an empty list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** The single teaching-load row to flag, or `null`. A display hint
 * (1.5x the median), not enforcement. */
function teachingLoadOutlier(rows: TeacherLoadRow[]): TeacherLoadRow | null {
  if (rows.length === 0) return null;
  const minutes = rows.map((row) => row.load.weeklyInstructionalMinutes);
  const highest = Math.max(...minutes);
  if (highest <= median(minutes) * TEACHING_LOAD_OUTLIER_MEDIAN_MULTIPLE) {
    return null;
  }
  return rows.find((row) => row.load.weeklyInstructionalMinutes === highest) ?? null;
}

/**
 * A read-only, school-wide overview for a school head, on the Precision
 * Intelligence dominant-surface model (ADR-0070 §19): one "Needs your
 * attention" list (sections missing an adviser + the teaching-load
 * outlier), above a single quiet context line. Every figure comes from
 * an existing school-scoped, capability-gated read; this screen adds no
 * backend read and writes nothing. All reads run under one composite
 * load guarded by a single `requestRef` and a single `.catch` — a reject
 * in any one shows the error `Alert` + `Retry` and nothing renders
 * partially.
 */
export function SchoolHeadHome({
  schoolName,
  sectionService,
  learnerService,
  schoolAttendanceService,
  sectionAdvisoryService,
  schoolMemberService,
  teachingAssignmentService,
  onManageSections,
  onOpenSf1Import,
  onViewTeacherLoad,
}: SchoolHeadHomeProps): JSX.Element {
  const { mode } = useTeacherMode();
  const [todayIso] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [attendance, setAttendance] = useState<SchoolDayAttendanceTotals>({
    present: 0,
    absent: 0,
    tardy: 0,
  });
  const [sectionsWithoutAdviser, setSectionsWithoutAdviser] = useState<Section[]>([]);
  const [teachingLoad, setTeachingLoad] = useState<TeacherLoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    Promise.all([
      sectionService.listSections(),
      learnerService.listLearners(),
      schoolAttendanceService.dayTotals(todayIso),
      schoolMemberService.listMembers(),
    ])
      .then(async ([sectionResult, learnerResult, attendanceResult, memberResult]) => {
        const teachers = memberResult.filter((member) => member.roles.includes("teacher"));
        // The adviser and load lookups depend on the sections/members
        // just resolved — nested here so the whole thing stays one
        // composite load under the same requestId guard and single
        // .catch below.
        const [adviserChecks, loadRows] = await Promise.all([
          Promise.all(
            sectionResult.map((section) =>
              sectionAdvisoryService
                .currentAdviser(section.id, todayIso)
                .then((adviser) => ({ section, hasAdviser: adviser !== null })),
            ),
          ),
          Promise.all(
            teachers.map((teacher) =>
              teachingAssignmentService
                .getLoad(teacher.id)
                .then((teacherLoad) => ({ teacher, load: teacherLoad })),
            ),
          ),
        ]);

        if (requestRef.current !== requestId) return;
        setSections(sectionResult);
        setLearners(learnerResult);
        setAttendance(attendanceResult);
        setSectionsWithoutAdviser(
          adviserChecks.filter((check) => !check.hasAdviser).map((check) => check.section),
        );
        setTeachingLoad(loadRows);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load the school overview.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sectionService,
    learnerService,
    schoolAttendanceService,
    sectionAdvisoryService,
    schoolMemberService,
    teachingAssignmentService,
  ]);

  const marked = attendance.present + attendance.absent + attendance.tardy;
  const attendancePct = marked > 0 ? Math.round((attendance.present / marked) * 100) : null;
  const attendanceLabel = attendancePct === null ? "not recorded" : `${attendancePct}%`;
  const attendanceDetail =
    attendancePct === null
      ? `No attendance recorded yet · ${formatIsoDate(todayIso)}`
      : `${attendance.present} present of ${marked} marked · ${formatIsoDate(todayIso)}`;
  const attendanceTone: StatusChipTone =
    attendancePct === null
      ? "neutral"
      : attendancePct >= ATTENDANCE_SUCCESS_PCT
        ? "success"
        : attendancePct >= ATTENDANCE_WARNING_PCT
          ? "warning"
          : "danger";

  const outlier = teachingLoadOutlier(teachingLoad);
  const nothingNeedsAttention = sectionsWithoutAdviser.length === 0 && outlier === null;

  return (
    <Page
      title="School overview"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            A school-wide summary for {schoolName} — anything that needs a decision from you first,
            then the day&rsquo;s numbers.
          </p>
        ) : undefined
      }
      actions={
        <>
          <button type="button" onClick={onManageSections}>
            Manage sections
          </button>
          <button type="button" onClick={onOpenSf1Import}>
            Import learners (SF1)
          </button>
        </>
      }
    >
      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <Loading label="Loading school overview…" />
      ) : error ? null : (
        <>
          <p className="school-overview-context">
            {learners.length} learner{learners.length === 1 ? "" : "s"} · {sections.length} section
            {sections.length === 1 ? "" : "s"} · SY {sharedSchoolYear(sections)} · Attendance today{" "}
            <StatusChip tone={attendanceTone}>{attendanceLabel}</StatusChip>
          </p>
          <p className="field-hint">{attendanceDetail}</p>
          {sectionsSpanMultipleYears(sections) && (
            <p className="field-hint">Sections span more than one school year.</p>
          )}

          <section className="home-zone home-zone-primary" aria-label="Needs your attention">
            <h3>Needs your attention</h3>
            {mode === "guided" && (
              <p className="field-hint">
                Sections without an adviser have no one owning their attendance and records. A very
                uneven teaching load is worth a look.
              </p>
            )}
            {nothingNeedsAttention ? (
              <EmptyState>Nothing needs your attention right now.</EmptyState>
            ) : (
              <ul className="home-duty-rail">
                {sectionsWithoutAdviser.map((section) => (
                  <li key={section.id} className="home-duty-item is-not-started">
                    <div className="home-duty-main">
                      <span className="home-duty-what">
                        {section.name} — Grade {section.gradeLevel}
                      </span>
                      <StatusChip tone="warning">No adviser</StatusChip>
                    </div>
                    <button type="button" className="button-primary" onClick={onManageSections}>
                      Assign adviser
                    </button>
                  </li>
                ))}
                {outlier && (
                  <li className="home-duty-item is-partial">
                    <div className="home-duty-main">
                      <span className="home-duty-what">
                        {outlier.teacher.displayName} — heaviest teaching load
                      </span>
                      <StatusChip tone="warning">
                        {formatMinutes(outlier.load.weeklyInstructionalMinutes)} / week
                      </StatusChip>
                    </div>
                    <button type="button" onClick={onViewTeacherLoad}>
                      Review teaching load
                    </button>
                  </li>
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
