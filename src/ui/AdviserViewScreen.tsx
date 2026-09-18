import { useEffect, useRef, useState } from "react";
import type { AdviserDailyAttendanceApplicationService } from "../application/adviser-daily-attendance-service";
import type { AdviserMonthlyAttendanceApplicationService } from "../application/adviser-monthly-attendance-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import {
  adviserDailyAttendanceService as composedAdviserDailyAttendanceService,
  adviserMonthlyAttendanceService as composedAdviserMonthlyAttendanceService,
} from "../composition";
import type { AttendanceRosterEntry, AttendanceStatus } from "../domain/attendance";
import type { Section } from "../domain/section";
import type { AdviserAttendanceOverview } from "../domain/subject-attendance";
import { AdviserMonthlyAttendancePanel } from "./AdviserMonthlyAttendancePanel";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";
import type { AdvisoryWorkContext } from "./work-context";

interface AdviserViewScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  adviserDailyAttendanceService?: AdviserDailyAttendanceApplicationService;
  adviserMonthlyAttendanceService?: AdviserMonthlyAttendanceApplicationService;
  initialContext?: AdvisoryWorkContext | null;
  onContextChange?: (context: AdvisoryWorkContext | null) => void;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function attendanceLabel(status: AttendanceStatus): string {
  if (status === "tardy") return "Tardy";
  return status === "present" ? "Present" : "Absent";
}

/**
 * Adviser Room for the currently authorized advisory section/date.
 * Native commands remain authoritative for adviser access. Subject Attendance
 * stays read-only follow-up evidence and never becomes official attendance.
 */
export function AdviserViewScreen({
  subjectAttendanceService,
  adviserDailyAttendanceService = composedAdviserDailyAttendanceService,
  adviserMonthlyAttendanceService = composedAdviserMonthlyAttendanceService,
  initialContext = null,
  onContextChange,
}: AdviserViewScreenProps) {
  const { mode } = useTeacherMode();
  const sectionsRequestRef = useRef(0);
  const overviewRequestRef = useRef(0);
  const dailyAttendanceRequestRef = useRef(0);
  const [date, setDate] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdviserAttendanceOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [dailyRoster, setDailyRoster] = useState<AttendanceRosterEntry[]>([]);
  const [dailyAttendanceLoading, setDailyAttendanceLoading] = useState(false);
  const [dailyAttendanceError, setDailyAttendanceError] = useState<string | null>(null);
  const [savingLearnerId, setSavingLearnerId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const selectedSection = sections.find((section) => section.id === sectionId) ?? null;

  function loadSections() {
    const requestId = ++sectionsRequestRef.current;
    setSectionsLoading(true);
    setSectionsError(null);
    subjectAttendanceService
      .listAdviserViewSections(date)
      .then((result) => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections(result);
        setSectionId((current) => {
          if (result.some((section) => section.id === current)) return current;
          if (initialContext && result.some((section) => section.id === initialContext.sectionId)) {
            return initialContext.sectionId;
          }
          return result[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections([]);
        setSectionId("");
        setSectionsError("Could not load the sections available to My Advisory.");
      })
      .finally(() => {
        if (sectionsRequestRef.current === requestId) setSectionsLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, date]);

  useEffect(() => {
    if (sectionsLoading) return;
    const currentSection = sections.find((section) => section.id === sectionId);
    const nextSectionId = currentSection?.id ?? null;
    if ((initialContext?.sectionId ?? null) === nextSectionId) return;
    onContextChange?.(nextSectionId ? { sectionId: nextSectionId } : null);
  }, [sections, sectionId, sectionsLoading, initialContext?.sectionId, onContextChange]);

  function loadOverview() {
    if (!sectionId) return;
    const requestId = ++overviewRequestRef.current;
    setOverviewLoading(true);
    setOverviewError(null);
    subjectAttendanceService
      .adviserOverview(sectionId, date)
      .then((result) => {
        if (overviewRequestRef.current === requestId) setOverview(result);
      })
      .catch(() => {
        if (overviewRequestRef.current !== requestId) return;
        setOverview(null);
        setOverviewError(
          "Could not load Subject Attendance signals. Your advisory assignment or permission may have changed.",
        );
      })
      .finally(() => {
        if (overviewRequestRef.current === requestId) setOverviewLoading(false);
      });
  }

  async function loadDailyAttendance() {
    if (!sectionId) return;
    const requestId = ++dailyAttendanceRequestRef.current;
    setDailyAttendanceLoading(true);
    setDailyAttendanceError(null);
    try {
      const result = await adviserDailyAttendanceService.rosterForDate(sectionId, date);
      if (dailyAttendanceRequestRef.current === requestId) setDailyRoster(result);
    } catch {
      if (dailyAttendanceRequestRef.current !== requestId) return;
      setDailyRoster([]);
      setDailyAttendanceError(
        "Could not load official daily attendance. Your advisory assignment or permission may have changed.",
      );
    } finally {
      if (dailyAttendanceRequestRef.current === requestId) setDailyAttendanceLoading(false);
    }
  }

  useEffect(() => {
    if (!sectionId) {
      overviewRequestRef.current += 1;
      dailyAttendanceRequestRef.current += 1;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverview(null);
    setOverviewError(null);
    setDailyRoster([]);
    setDailyAttendanceError(null);
    loadOverview();
    void loadDailyAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, adviserDailyAttendanceService, sectionId, date]);

  async function recordOfficialAttendance(learnerId: string, status: AttendanceStatus) {
    setSavingLearnerId(learnerId);
    setDailyAttendanceError(null);
    try {
      const recorded = await adviserDailyAttendanceService.recordAttendance(
        sectionId,
        learnerId,
        date,
        status,
      );
      if (!recorded) {
        setDailyAttendanceError(
          "Attendance was not saved because the learner is no longer active in this advisory section for this date.",
        );
        return;
      }
      await loadDailyAttendance();
    } catch {
      setDailyAttendanceError(
        "Could not save official attendance. Your advisory assignment, learner enrollment, or permission may have changed.",
      );
    } finally {
      setSavingLearnerId(null);
    }
  }

  async function markUnmarkedPresent() {
    setBulkSaving(true);
    setDailyAttendanceError(null);
    try {
      setDailyRoster(await adviserDailyAttendanceService.bulkMarkPresent(sectionId, date));
    } catch {
      setDailyAttendanceError(
        "Could not mark unrecorded learners Present. Your advisory assignment or permission may have changed.",
      );
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <Page
      title="My Advisory"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Record official daily attendance, review the monthly official-attendance preview, then
            review Subject Attendance signals separately.
          </p>
        ) : undefined
      }
    >
      <p className="field-hint">
        Official daily attendance and Subject Attendance are separate records. Subject signals are
        not SF2.
      </p>
      <div className="form-row">
        <div className="field">
          <label htmlFor="adviser-view-date">As of</label>
          <input
            id="adviser-view-date"
            type="date"
            value={date}
            max={todayAsIsoDate()}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        {sections.length > 0 && (
          <div className="field">
            <label htmlFor="adviser-view-section">Advisory section</label>
            <select
              id="adviser-view-section"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  Grade {section.gradeLevel} — {section.name} ({section.schoolYear})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {sectionsError && (
        <Alert tone="error">
          <p>{sectionsError}</p>
          <button type="button" onClick={loadSections}>
            Retry
          </button>
        </Alert>
      )}
      {sectionsLoading ? (
        <Loading label="Loading My Advisory sections…" />
      ) : sectionsError ? null : sections.length === 0 ? (
        <EmptyState>
          No advisory section is assigned to you for this date. A School Head can assign the section
          adviser.
        </EmptyState>
      ) : (
        <>
          {dailyAttendanceError && (
            <Alert tone="error">
              <p>{dailyAttendanceError}</p>
              <button type="button" onClick={() => void loadDailyAttendance()}>
                Retry
              </button>
            </Alert>
          )}
          {dailyAttendanceLoading ? (
            <Loading label="Loading official daily attendance…" />
          ) : dailyAttendanceError ? null : (
            <>
              <section aria-labelledby="advisory-roster-heading">
                <h2 id="advisory-roster-heading">Advisory roster</h2>
                <p className="attendance-count" role="status">
                  <strong>{dailyRoster.length}</strong> learner
                  {dailyRoster.length === 1 ? "" : "s"} enrolled in{" "}
                  {selectedSection?.name ?? "this section"} as of {date}.
                </p>
                <p className="field-hint">
                  This roster comes from current section enrollment. Official daily attendance below
                  is separate from read-only Subject Attendance signals.
                </p>
              </section>
              <section aria-labelledby="official-daily-attendance-heading">
                <h2 id="official-daily-attendance-heading">Official daily attendance</h2>
                <p className="field-hint">
                  Record the advisory section&apos;s official Present, Absent, or Tardy mark for
                  this date. Existing marks are never overwritten by “Mark unmarked Present.”
                </p>
                {dailyRoster.length === 0 ? (
                  <EmptyState>
                    No active learners are available for official attendance on this date.
                  </EmptyState>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void markUnmarkedPresent()}
                      disabled={bulkSaving || savingLearnerId !== null}
                    >
                      {bulkSaving ? "Marking…" : "Mark unmarked Present"}
                    </button>
                    <table className="attendance-roster">
                      <caption className="visually-hidden">
                        Official daily attendance for{" "}
                        {selectedSection?.name ?? "this advisory section"} on {date}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Learner</th>
                          <th scope="col">Official mark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRoster.map((row) => {
                          const learnerName = `${row.givenName} ${row.familyName}`;
                          return (
                            <tr key={row.learnerId}>
                              <th scope="row">{learnerName}</th>
                              <td>
                                <select
                                  aria-label={`Official attendance for ${learnerName}`}
                                  value={row.status ?? ""}
                                  disabled={bulkSaving || savingLearnerId !== null}
                                  onChange={(event) =>
                                    void recordOfficialAttendance(
                                      row.learnerId,
                                      event.target.value as AttendanceStatus,
                                    )
                                  }
                                >
                                  <option value="" disabled>
                                    Not marked
                                  </option>
                                  {(["present", "absent", "tardy"] as const).map((status) => (
                                    <option key={status} value={status}>
                                      {attendanceLabel(status)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </section>
            </>
          )}
          {selectedSection && (
            <AdviserMonthlyAttendancePanel
              service={adviserMonthlyAttendanceService}
              sectionId={selectedSection.id}
              asOfDate={date}
              sectionName={selectedSection.name}
            />
          )}
          <section aria-labelledby="advisory-subject-signals-heading">
            <h2 id="advisory-subject-signals-heading">Subject Attendance signals</h2>
            <p className="field-hint">
              Read-only follow-up evidence from subject teachers. These signals never become
              official daily attendance or SF2 automatically.
            </p>
            {overviewError && (
              <Alert tone="error">
                <p>{overviewError}</p>
                <button type="button" onClick={loadOverview}>
                  Retry subject signals
                </button>
              </Alert>
            )}
            {overviewLoading ? (
              <Loading label="Loading Subject Attendance signals…" />
            ) : overviewError ? null : !overview ? null : overview.rows.length === 0 ? (
              <EmptyState>
                No enrolled learners have Subject Attendance signals on this date.
              </EmptyState>
            ) : (
              <>
                <p className="attendance-count">
                  <strong>{overview.heldSessionCount}</strong> subject session
                  {overview.heldSessionCount === 1 ? "" : "s"} held across{" "}
                  <strong>{overview.subjectCount}</strong> subject
                  {overview.subjectCount === 1 ? "" : "s"}
                </p>
                <table className="attendance-roster">
                  <caption className="visually-hidden">
                    Current advisory roster with read-only Subject Attendance signals for{" "}
                    {overview.sectionName} as of {overview.asOfDate}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Learner</th>
                      <th scope="col">Present</th>
                      <th scope="col">Absent</th>
                      <th scope="col">Late</th>
                      <th scope="col">Excused</th>
                      <th scope="col">Subjects with absences</th>
                      <th scope="col">Highest current subject absence streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rows.map((row) => (
                      <tr key={row.membershipId}>
                        <th scope="row">
                          {row.givenName} {row.familyName}
                        </th>
                        <td>{row.presentCount}</td>
                        <td>{row.absentCount}</td>
                        <td>{row.lateCount}</td>
                        <td>{row.excusedCount}</td>
                        <td>
                          {row.subjectsWithAbsences.length > 0
                            ? row.subjectsWithAbsences.join(", ")
                            : "None"}
                        </td>
                        <td>{row.highestCurrentSubjectAbsenceStreak}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
