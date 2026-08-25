import { useEffect, useRef, useState } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { SectionApplicationService } from "../application/section-service";
import { ATTENDANCE_STATUSES } from "../domain/attendance";
import type { AttendanceRosterEntry, AttendanceStatus } from "../domain/attendance";
import { ValidationError } from "../domain/errors";
import type { Section } from "../domain/section";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AttendanceScreenProps {
  attendanceService: AttendanceApplicationService;
  sectionService: SectionApplicationService;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  tardy: "Tardy",
};

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AttendanceScreen({ attendanceService, sectionService }: AttendanceScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [date, setDate] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [roster, setRoster] = useState<AttendanceRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingLearnerId, setSavingLearnerId] = useState<string | null>(null);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    sectionService
      .listSections()
      .then((result) => {
        if (cancelled) return;
        setSections(result);
        if (result[0]) setSectionId(result[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load sections.");
      })
      .finally(() => {
        if (!cancelled) setSectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionService]);

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;
    attendanceService
      .rosterForDate(sectionId, date)
      .then((result) => {
        if (!cancelled) setRoster(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the attendance roster for this date.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attendanceService, sectionId, date]);

  function handleDateChange(newDate: string) {
    setError(null);
    setLoading(true);
    setDate(newDate);
  }

  function handleSectionChange(newSectionId: string) {
    setError(null);
    setLoading(true);
    setSectionId(newSectionId);
  }

  async function handleMark(learnerId: string, status: AttendanceStatus) {
    setError(null);
    setConfirmation(null);
    setSavingLearnerId(learnerId);
    try {
      await attendanceService.recordAttendance(sectionId, learnerId, date, status);
      setRoster((current) =>
        current.map((entry) =>
          entry.learnerId === learnerId
            ? { ...entry, status, recordedAt: new Date().toISOString() }
            : entry,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ValidationError ? err.message : "Could not save this attendance mark.",
      );
    } finally {
      setSavingLearnerId(null);
    }
  }

  async function handleMarkAllPresent() {
    setError(null);
    setConfirmation(null);
    setBulkMarking(true);
    try {
      const unmarkedCount = roster.filter((entry) => entry.status === null).length;
      const updated = await attendanceService.bulkMarkPresent(sectionId, date);
      setRoster(updated);
      setConfirmation(
        unmarkedCount === 0
          ? "Everyone already had a mark for this date — nothing changed."
          : `Marked ${unmarkedCount} learner${unmarkedCount === 1 ? "" : "s"} Present. Existing marks were left as-is.`,
      );
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not mark the roster present.");
    } finally {
      setBulkMarking(false);
    }
  }

  return (
    <section aria-label="Attendance">
      <h2 ref={headingRef} tabIndex={-1}>
        Attendance
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Pick a section and date, then mark each learner Present, Absent, or Tardy. You can change
          a mark at any time on the same day.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {sectionsLoading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <p>No sections created yet. Create a section under "Sections" first.</p>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="attendance-section">Section</label>
              <select
                id="attendance-section"
                value={sectionId}
                onChange={(event) => handleSectionChange(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name} — Grade {section.gradeLevel}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="attendance-date">Date</label>
              <input
                id="attendance-date"
                type="date"
                value={date}
                max={todayAsIsoDate()}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <Loading label="Loading roster…" />
          ) : roster.length === 0 ? (
            <p>No learners enrolled in this section yet.</p>
          ) : (
            <>
              {mode === "guided" && (
                <p className="field-hint">
                  Most days, most of the class is present. Use "Mark all present" to fill in
                  everyone who doesn't have a mark yet, then adjust the few who are Absent or Tardy
                  — it never changes a mark you've already made.
                </p>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={bulkMarking || roster.every((entry) => entry.status !== null)}
                onClick={handleMarkAllPresent}
              >
                {bulkMarking ? "Marking…" : "Mark all present"}
              </button>
              <table className="attendance-roster">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((entry) => (
                    <tr key={entry.learnerId}>
                      <th scope="row">
                        {entry.givenName} {entry.familyName}
                      </th>
                      <td>
                        <div
                          role="group"
                          aria-label={`Attendance status for ${entry.givenName} ${entry.familyName}`}
                        >
                          {ATTENDANCE_STATUSES.map((status) => (
                            <button
                              key={status}
                              type="button"
                              aria-pressed={entry.status === status}
                              disabled={savingLearnerId === entry.learnerId}
                              onClick={() => handleMark(entry.learnerId, status)}
                            >
                              {STATUS_LABELS[status]}
                            </button>
                          ))}
                        </div>
                      </td>
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
