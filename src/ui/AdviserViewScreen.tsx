import { useEffect, useRef, useState } from "react";
import type { SectionApplicationService } from "../application/section-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { Section } from "../domain/section";
import type { AdviserAssignmentMonitor } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AdviserViewScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  sectionService: SectionApplicationService;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Wave 3F: `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s Adviser View --
 * read-only Subject Attendance signals (each subject's own Subject
 * Monitor) across every subject taught in one section, for that
 * section's adviser. Reuses `auth::authorize_adviser_of_section`
 * (Section Advisory Foundation, Wave 3E) server-side: this screen shows
 * every section in the school in its picker, the same "security must
 * not rely on UI hiding" pattern `TeachingAssignmentsScreen`'s teacher
 * picker and `TeacherLoadScreen`'s colleague picker already established
 * -- a teacher who is not this section's adviser (and not a School
 * Head) simply gets the backend's own denial surfaced as a local
 * message, exactly like `TeacherLoadScreen`'s refused colleague view. */
export function AdviserViewScreen({
  subjectAttendanceService,
  sectionService,
}: AdviserViewScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(todayAsIsoDate);

  const [rows, setRows] = useState<AdviserAssignmentMonitor[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const sectionsRequestRef = useRef(0);
  const rowsRequestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function loadSections() {
    const requestId = ++sectionsRequestRef.current;
    setSectionsLoading(true);
    setSectionsError(null);
    sectionService
      .listSections()
      .then((result) => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections(result);
        setSectionId((current) => current || (result[0]?.id ?? ""));
      })
      .catch(() => {
        if (sectionsRequestRef.current !== requestId) return;
        setSectionsError("Could not load sections.");
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
  }, [sectionService]);

  function loadRows() {
    if (!sectionId) return;
    const requestId = ++rowsRequestRef.current;
    setRowsLoading(true);
    setRowsError(null);
    subjectAttendanceService
      .adviserSectionMonitor(sectionId, date)
      .then((result) => {
        if (rowsRequestRef.current !== requestId) return;
        setRows(result);
      })
      .catch(() => {
        if (rowsRequestRef.current !== requestId) return;
        setRowsError(
          "Could not load this section's adviser view — you may not have permission to view it.",
        );
      })
      .finally(() => {
        if (rowsRequestRef.current !== requestId) return;
        setRowsLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(null);
    setRowsError(null);
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, sectionId, date]);

  const selectedSection = sections.find((s) => s.id === sectionId) ?? null;

  return (
    <section aria-label="Adviser View">
      <h2 ref={headingRef} tabIndex={-1}>
        Adviser View
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Every subject's attendance pattern for your advisory section, in one place — for
          follow-up, not for changing anyone's official attendance record.
        </p>
      )}
      <p className="field-hint">Subject attendance — not SF2.</p>

      {sectionsError && (
        <Alert tone="error">
          <p>{sectionsError}</p>
          <button type="button" onClick={loadSections}>
            Retry
          </button>
        </Alert>
      )}

      {sectionsLoading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        sectionsError ? null : (
          <EmptyState>No sections exist yet.</EmptyState>
        )
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="adviser-view-section">Section</label>
              <select
                id="adviser-view-section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name} — Grade {section.gradeLevel} ({section.schoolYear})
                  </option>
                ))}
              </select>
            </div>
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
          </div>

          {selectedSection && mode === "guided" && (
            <p className="field-hint">
              {selectedSection.name}, Grade {selectedSection.gradeLevel}.
            </p>
          )}

          {rowsError && (
            <Alert tone="error">
              <p>{rowsError}</p>
              <button type="button" onClick={loadRows}>
                Retry
              </button>
            </Alert>
          )}

          {rowsLoading ? (
            <Loading label="Loading adviser view…" />
          ) : rowsError ? null : !rows ? null : rows.length === 0 ? (
            <EmptyState>No subjects are taught in this section yet.</EmptyState>
          ) : (
            rows.map((row) => (
              <div key={row.teachingAssignmentId} className="section-roster-action-panel">
                <h3>{row.subjectName}</h3>
                <p className="attendance-count">
                  <strong>{row.monitor.heldSessionCount}</strong> session
                  {row.monitor.heldSessionCount === 1 ? "" : "s"} held so far
                </p>
                {row.monitor.rows.length === 0 ? (
                  <EmptyState>No learners enrolled in this section on this date.</EmptyState>
                ) : (
                  <table className="attendance-roster">
                    <thead>
                      <tr>
                        <th scope="col">Learner</th>
                        <th scope="col">Present</th>
                        <th scope="col">Absent</th>
                        <th scope="col">Late</th>
                        <th scope="col">Excused</th>
                        <th scope="col">Current absence streak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.monitor.rows.map((learnerRow) => (
                        <tr key={learnerRow.membershipId}>
                          <th scope="row">
                            {learnerRow.givenName} {learnerRow.familyName}
                          </th>
                          <td>{learnerRow.presentCount}</td>
                          <td>{learnerRow.absentCount}</td>
                          <td>{learnerRow.lateCount}</td>
                          <td>{learnerRow.excusedCount}</td>
                          <td>{learnerRow.currentConsecutiveAbsences}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}
