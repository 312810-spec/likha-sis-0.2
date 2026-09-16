import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { Section } from "../domain/section";
import type { AdviserAttendanceOverview } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";
import type { AdvisoryWorkContext } from "./work-context";

interface AdviserViewScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
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

/** Read-only, section-wide Subject Attendance signals for active
 * advisers and School Heads. The Rust command independently enforces
 * that relationship; this screen's filtered picker and advisory context
 * are usability aids, not security boundaries. */
export function AdviserViewScreen({
  subjectAttendanceService,
  initialContext = null,
  onContextChange,
}: AdviserViewScreenProps) {
  const { mode } = useTeacherMode();
  const sectionsRequestRef = useRef(0);
  const overviewRequestRef = useRef(0);

  const [date, setDate] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdviserAttendanceOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

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
        if (sectionsRequestRef.current !== requestId) return;
        setSectionsLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, date]);

  useEffect(() => {
    if (sectionsLoading) return;
    const selectedSection = sections.find((section) => section.id === sectionId);
    const nextSectionId = selectedSection?.id ?? null;
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
        if (overviewRequestRef.current !== requestId) return;
        setOverview(result);
      })
      .catch(() => {
        if (overviewRequestRef.current !== requestId) return;
        setOverview(null);
        setOverviewError(
          "Could not open My Advisory. Your advisory assignment or permission may have changed.",
        );
      })
      .finally(() => {
        if (overviewRequestRef.current !== requestId) return;
        setOverviewLoading(false);
      });
  }

  useEffect(() => {
    if (!sectionId) {
      // Invalidate an in-flight overview if a date change leaves the
      // caller with no authorized section. A late rejection must not
      // replace the correct empty state with a stale permission error.
      overviewRequestRef.current += 1;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverview(null);
    setOverviewError(null);
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, sectionId, date]);

  return (
    <Page
      title="My Advisory"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Review your current advisory roster alongside subject-attendance patterns. These signals
            are for follow-up only: you cannot edit a subject teacher&apos;s record here, and
            nothing on this screen changes official attendance.
          </p>
        ) : undefined
      }
    >
      <p className="field-hint">Advisory roster + Subject Attendance signals — not SF2.</p>

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
          {overviewError && (
            <Alert tone="error">
              <p>{overviewError}</p>
              <button type="button" onClick={loadOverview}>
                Retry
              </button>
            </Alert>
          )}

          {overviewLoading ? (
            <Loading label="Loading advisory roster and subject-attendance signals…" />
          ) : overviewError ? null : !overview ? null : overview.rows.length === 0 ? (
            <EmptyState>No learners are enrolled in this advisory section on this date.</EmptyState>
          ) : (
            <>
              <section aria-labelledby="advisory-roster-heading">
                <h2 id="advisory-roster-heading">Advisory roster</h2>
                <p className="attendance-count" role="status">
                  <strong>{overview.rows.length}</strong> learner
                  {overview.rows.length === 1 ? "" : "s"} enrolled in {overview.sectionName} as of{" "}
                  {overview.asOfDate}.
                </p>
                <p className="field-hint">
                  This roster comes from current section enrollment. The Subject Attendance signals
                  below are read-only follow-up data and do not become SF2.
                </p>
              </section>

              <section aria-labelledby="advisory-subject-signals-heading">
                <h2 id="advisory-subject-signals-heading">Subject Attendance signals</h2>
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
              </section>
            </>
          )}
        </>
      )}
    </Page>
  );
}
