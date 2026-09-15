import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { SubjectAttendanceMonitorRow } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ClassLearnersPanelProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  teachingAssignmentId: string;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ClassLearnersPanel({
  subjectAttendanceService,
  teachingAssignmentId,
}: ClassLearnersPanelProps) {
  const { mode } = useTeacherMode();
  const [rows, setRows] = useState<SubjectAttendanceMonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null);
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    subjectAttendanceService
      .monitor(teachingAssignmentId, todayAsIsoDate())
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setRows(result?.rows ?? []);
        setSelectedLearnerId((current) =>
          current && result?.rows.some((row) => row.learnerId === current) ? current : null,
        );
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load this class's learners.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // Same initial external-service synchronization pattern used by MyDayScreen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, teachingAssignmentId]);

  const selected = rows.find((row) => row.learnerId === selectedLearnerId) ?? null;

  return (
    <section aria-labelledby="class-learners-heading">
      <div className="section-heading-row">
        <div>
          <h3 id="class-learners-heading">Learners</h3>
          {mode === "guided" ? (
            <p className="field-hint">
              This list comes from the class you are authorized to teach. Open a learner to see
              class-relevant attendance information without leaving the class workspace.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      ) : null}

      {loading ? (
        <Loading label="Loading class learners…" />
      ) : error ? null : selected ? (
        <div className="section-roster-action-panel" aria-label="Selected learner">
          <button type="button" onClick={() => setSelectedLearnerId(null)}>
            Back to learners
          </button>
          <h4>
            {selected.givenName} {selected.familyName}
          </h4>
          <p className="field-hint">Class attendance signals as of today</p>
          <dl>
            <div>
              <dt>Present</dt>
              <dd>{selected.presentCount}</dd>
            </div>
            <div>
              <dt>Absent</dt>
              <dd>{selected.absentCount}</dd>
            </div>
            <div>
              <dt>Late</dt>
              <dd>{selected.lateCount}</dd>
            </div>
            <div>
              <dt>Excused</dt>
              <dd>{selected.excusedCount}</dd>
            </div>
            <div>
              <dt>Current consecutive absences</dt>
              <dd>{selected.currentConsecutiveAbsences}</dd>
            </div>
          </dl>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>No learners are currently in this class roster.</EmptyState>
      ) : (
        <ul className="workspace-priority-rail" aria-label="Class learners">
          {rows.map((row) => (
            <li key={row.membershipId} className="workspace-priority-item">
              <div className="workspace-priority-main">
                <span className="workspace-priority-section">
                  {row.familyName}, {row.givenName}
                </span>
                <span className="field-hint">
                  {row.absentCount} absent · {row.lateCount} late · {row.excusedCount} excused
                </span>
              </div>
              <button type="button" onClick={() => setSelectedLearnerId(row.learnerId)}>
                Open learner
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
