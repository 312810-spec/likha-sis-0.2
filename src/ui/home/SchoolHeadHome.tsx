import { useEffect, useRef, useState, type JSX } from "react";
import type { LearnerApplicationService } from "../../application/learner-service";
import type { SchoolAttendanceApplicationService } from "../../application/school-attendance-service";
import type { SchoolMemberApplicationService } from "../../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../../application/section-advisory-service";
import type { SectionApplicationService } from "../../application/section-service";
import type { Sf1ImportApplicationService } from "../../application/sf1-import-service";
import type { TeachingAssignmentApplicationService } from "../../application/teaching-assignment-service";
import type { SchoolDayAttendanceTotals } from "../../domain/attendance";
import type { Learner } from "../../domain/learner";
import type { SchoolMember } from "../../domain/school-member";
import type { Section } from "../../domain/section";
import type { Sf1ImportHistoryEntry } from "../../domain/sf1-import";
import type { TeacherLoad } from "../../domain/teacher-load";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { Kpi, KpiStrip, type KpiTone } from "../components/KpiStrip";
import { Skeleton } from "../components/Skeleton";
import { Page } from "../components/Page";

interface SchoolHeadHomeProps {
  schoolName: string;
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
  sf1ImportService: Sf1ImportApplicationService;
  schoolAttendanceService: SchoolAttendanceApplicationService;
  sectionAdvisoryService: SectionAdvisoryApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  teachingAssignmentService: TeachingAssignmentApplicationService;
  onManageSections: () => void;
  onOpenSf1Import: () => void;
}

const RECENT_IMPORT_LIMIT = 5;

/** Attendance-rate tone thresholds. The `foot` always states the raw
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

/** `YYYY-MM-DD` -> `4 Sep 2026`, matching `LearnerListScreen` /
 * `SectionRosterScreen`. (Consolidating these three into a shared util is
 * tracked as a Minor in the redesign review follow-ups.) */
function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : iso;
}

function formatImportDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? createdAt : parsed.toLocaleDateString();
}

function sharedSchoolYear(sections: Section[]): string {
  const years = new Set(sections.map((section) => section.schoolYear));
  return years.size === 1 ? ([...years][0] ?? "—") : "—";
}

function sharedSchoolYearFoot(sections: Section[]): string | undefined {
  const years = new Set(sections.map((section) => section.schoolYear));
  return years.size > 1 ? "Sections span more than one school year." : undefined;
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

/** Index of the single teaching-load row to flag, or -1. A display hint
 * (1.5x the median), not enforcement — see
 * `TEACHING_LOAD_OUTLIER_MEDIAN_MULTIPLE`. */
function teachingLoadOutlierIndex(rows: TeacherLoadRow[]): number {
  if (rows.length === 0) return -1;
  const minutes = rows.map((row) => row.load.weeklyInstructionalMinutes);
  const highest = Math.max(...minutes);
  if (highest <= median(minutes) * TEACHING_LOAD_OUTLIER_MEDIAN_MULTIPLE) {
    return -1;
  }
  return rows.findIndex((row) => row.load.weeklyInstructionalMinutes === highest);
}

/**
 * A read-only, school-wide overview for a school head — section and
 * learner totals, the school year in use, today's attendance rate, the
 * sections still missing an adviser, each teacher's weekly load, and the
 * most recent SF1 imports. Every figure comes from an existing
 * school-scoped read; this screen adds no backend and writes nothing.
 * All reads run under one composite load guarded by a single
 * `requestRef` and a single `.catch` — a reject in any one shows the
 * error `Alert` + `Retry` and nothing renders partially.
 */
export function SchoolHeadHome({
  schoolName,
  sectionService,
  learnerService,
  sf1ImportService,
  schoolAttendanceService,
  sectionAdvisoryService,
  schoolMemberService,
  teachingAssignmentService,
  onManageSections,
  onOpenSf1Import,
}: SchoolHeadHomeProps): JSX.Element {
  const [todayIso] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [history, setHistory] = useState<Sf1ImportHistoryEntry[]>([]);
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
      sf1ImportService.listImportHistory(RECENT_IMPORT_LIMIT),
      schoolAttendanceService.dayTotals(todayIso),
      schoolMemberService.listMembers(),
    ])
      .then(
        async ([sectionResult, learnerResult, historyResult, attendanceResult, memberResult]) => {
          const teachers = memberResult.filter((member) => member.roles.includes("teacher"));
          // The adviser and load lookups depend on the sections/members
          // just resolved — nest them inside this .then so the whole thing
          // stays one composite load under the same requestId guard and
          // the single .catch below.
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
          setHistory(historyResult);
          setAttendance(attendanceResult);
          setSectionsWithoutAdviser(
            adviserChecks.filter((check) => !check.hasAdviser).map((check) => check.section),
          );
          setTeachingLoad(loadRows);
        },
      )
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
    sf1ImportService,
    schoolAttendanceService,
    sectionAdvisoryService,
    schoolMemberService,
    teachingAssignmentService,
  ]);

  const marked = attendance.present + attendance.absent + attendance.tardy;
  const attendancePct = marked > 0 ? Math.round((attendance.present / marked) * 100) : null;
  const attendanceValue = attendancePct === null ? "—" : `${attendancePct}%`;
  const attendanceFoot =
    attendancePct === null
      ? `no attendance recorded yet · ${formatIsoDate(todayIso)}`
      : `${attendance.present} present of ${marked} marked · ${formatIsoDate(todayIso)}`;
  const attendanceTone: KpiTone =
    attendancePct === null
      ? "neutral"
      : attendancePct >= ATTENDANCE_SUCCESS_PCT
        ? "success"
        : attendancePct >= ATTENDANCE_WARNING_PCT
          ? "warning"
          : "danger";

  const outlierIndex = teachingLoadOutlierIndex(teachingLoad);

  return (
    <Page
      title="School overview"
      hint={<p className="field-hint">A school-wide summary for {schoolName}.</p>}
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
        <Skeleton label="Loading school overview…" lines={7} />
      ) : error ? null : (
        <>
          <KpiStrip>
            <Kpi label="Sections" value={sections.length} />
            <Kpi label="Learners" value={learners.length} tone="productive" />
            <Kpi
              label="School year"
              value={sharedSchoolYear(sections)}
              foot={sharedSchoolYearFoot(sections)}
            />
            <Kpi
              label="Attendance today"
              value={attendanceValue}
              tone={attendanceTone}
              foot={attendanceFoot}
            />
          </KpiStrip>

          <div className="school-operations">
            <section className="school-operation-section" aria-labelledby="school-attention-title">
              <div className="school-operation-heading">
                <div>
                  <p className="school-operation-eyebrow">Needs attention</p>
                  <h3 id="school-attention-title">Sections without an adviser</h3>
                </div>
                <button type="button" onClick={onManageSections}>
                  Assign
                </button>
              </div>
              {sectionsWithoutAdviser.length === 0 ? (
                <EmptyState
                  tone="success"
                  title="Every section has an adviser."
                  description="No adviser assignment needs attention right now."
                />
              ) : (
                <ul className="learner-list">
                  {sectionsWithoutAdviser.map((section) => (
                    <li key={section.id}>
                      {section.name} — Grade {section.gradeLevel}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="school-operation-section" aria-labelledby="school-load-title">
              <div className="school-operation-heading">
                <div>
                  <p className="school-operation-eyebrow">Workload</p>
                  <h3 id="school-load-title">Teaching load</h3>
                </div>
              </div>
              {teachingLoad.length === 0 ? (
                <EmptyState>No teachers on record.</EmptyState>
              ) : (
                <ul className="bars">
                  {teachingLoad.map((row, index) => {
                    const isOutlier = index === outlierIndex;
                    return (
                      <li
                        key={row.teacher.id}
                        className={isOutlier ? "fill warn" : "fill"}
                        data-tone={isOutlier ? "warning" : undefined}
                      >
                        <span className="bars-name">{row.teacher.displayName}</span>
                        <span className="bars-value">
                          {formatMinutes(row.load.weeklyInstructionalMinutes)}
                          {isOutlier ? " ⚠ high" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="school-operation-section" aria-labelledby="school-imports-title">
              <div className="school-operation-heading">
                <div>
                  <p className="school-operation-eyebrow">Recent activity</p>
                  <h3 id="school-imports-title">Recent SF1 imports</h3>
                </div>
                <button type="button" onClick={onOpenSf1Import}>
                  History
                </button>
              </div>
              {history.length === 0 ? (
                <EmptyState>No imports yet.</EmptyState>
              ) : (
                <ul className="learner-list">
                  {history.slice(0, RECENT_IMPORT_LIMIT).map((entry) => (
                    <li key={entry.id}>
                      {entry.sourceFilename} · {entry.rowsCommitted}{" "}
                      {entry.rowsCommitted === 1 ? "learner" : "learners"} ·{" "}
                      {formatImportDate(entry.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="school-operation-section" aria-labelledby="school-manage-title">
              <div className="school-operation-heading">
                <div>
                  <p className="school-operation-eyebrow">Quick actions</p>
                  <h3 id="school-manage-title">Manage</h3>
                </div>
              </div>
              <p className="field-hint">Open the two most common school-record setup tasks.</p>
              <div className="card-actions">
                <button type="button" onClick={onManageSections}>
                  Manage sections
                </button>
                <button type="button" onClick={onOpenSf1Import}>
                  Import learners (SF1)
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </Page>
  );
}
