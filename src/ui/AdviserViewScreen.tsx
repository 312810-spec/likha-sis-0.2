import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { Section } from "../domain/section";
import type { AdviserAttendanceOverview } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AdviserViewScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
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
 * that relationship; this screen's filtered picker is usability, not a
 * security boundary. */
export function AdviserViewScreen({ subjectAttendanceService }: AdviserViewScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function loadSections() {
    const requestId = ++sectionsRequestRef.current;
    setSectionsLoading(true);
    setSectionsError(null);
    subjectAttendanceService
      .listAdviserViewSections(date)
      .then((result) => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections(result);
        setSectionId((current) =>
          result.some((section) => section.id === current) ? current : (result[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections([]);
        setSectionId("");
        setSectionsError("Could not load the sections available to Adviser View.");
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
          "Could not open this Adviser View. Your advisory assignment or permission may have changed.",
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
    <section aria-label="Adviser View">
      <h2 ref={headingRef} tabIndex={-1}>
        Adviser View
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Review subject-attendance patterns across your advisory class. These signals are for
          follow-up only: you cannot edit a subject teacher&apos;s record here, and nothing on this
          screen changes official attendance.
        </p>
      )}
      <p className="field-hint">Subject attendance — not SF2.</p>

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
        <Loading label="Loading Adviser View sections…" />
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
            <Loading label="Loading subject-attendance signals…" />
          ) : overviewError ? null : !overview ? null : overview.rows.length === 0 ? (
            <EmptyState>No learners enrolled in this section on this date.</EmptyState>
          ) : (
            <>
              <p className="attendance-count" role="status">
                <strong>{overview.heldSessionCount}</strong> subject session
                {overview.heldSessionCount === 1 ? "" : "s"} held across{" "}
                <strong>{overview.subjectCount}</strong> subject
                {overview.subjectCount === 1 ? "" : "s"}
              </p>
              <table className="attendance-roster">
                <caption className="visually-hidden">
                  Read-only Subject Attendance signals for {overview.sectionName} as of{" "}
                  {overview.asOfDate}
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
        </>
      )}
    </section>
  );
}
