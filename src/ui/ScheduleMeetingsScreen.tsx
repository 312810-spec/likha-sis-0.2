import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import { ValidationError } from "../domain/errors";
import { WEEKDAY_LABELS } from "../domain/schedule-meeting";
import type { ScheduleMeeting } from "../domain/schedule-meeting";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ScheduleMeetingsScreenProps {
  teachingAssignmentService: TeachingAssignmentApplicationService;
  /** The class to schedule. Supplied by the Teaching Assignments
   * workflow (App.tsx state handoff), never a URL/route param -- the
   * same narrowly-typed pattern `TeachingAssignmentsScreen`'s own
   * `sectionId`/`sectionName` handoff already uses. `subjectName`/
   * `sectionName` come from the same handoff, since
   * `TeachingAssignmentsScreen` already has both in hand. */
  teachingAssignmentId: string;
  subjectName: string;
  sectionName: string;
  onBack: () => void;
}

const CONFLICT_MESSAGES: Record<string, string> = {
  unknownAssignment: "This class could not be found. Try reloading the page.",
  invalidWeekday: "Weekday must be between Sunday and Saturday.",
  invalidTime: "Start and end time must be valid, with the end time after the start time.",
  teacherConflict: "This teacher already has another class scheduled at this time.",
  sectionConflict: "This section already has another class scheduled at this time.",
  roomConflict: "This room is already booked for another class at this time.",
  duplicate: "This exact meeting has already been scheduled.",
};

/** Wave 2Z: a School Head schedules and unschedules this class's weekly
 * meetings. The first screen in this codebase to *write* a `weekday`
 * value -- see `src/domain/schedule-meeting.ts` for the 0=Sunday..
 * 6=Saturday convention `TodaysClassesScreen` (Wave 2X) already reads. */
export function ScheduleMeetingsScreen({
  teachingAssignmentService,
  teachingAssignmentId,
  subjectName,
  sectionName,
  onBack,
}: ScheduleMeetingsScreenProps) {
  const { mode } = useTeacherMode();

  const [meetings, setMeetings] = useState<ScheduleMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [weekday, setWeekday] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [room, setRoom] = useState("");
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    teachingAssignmentService
      .listMeetings(teachingAssignmentId)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setMeetings(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load this class's schedule.");
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
  }, [teachingAssignmentService, teachingAssignmentId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setCreating(true);
    try {
      const outcome = await teachingAssignmentService.createMeeting(
        teachingAssignmentId,
        Number(weekday),
        startsAt,
        endsAt,
        room,
      );
      if (outcome.outcome === "created") {
        setMeetings((current) => [...current, outcome.meeting]);
        setConfirmation("Meeting scheduled.");
        setStartsAt("");
        setEndsAt("");
        setRoom("");
      } else {
        setError(CONFLICT_MESSAGES[outcome.outcome] ?? "Could not schedule this meeting.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not schedule this meeting.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(meeting: ScheduleMeeting) {
    setError(null);
    setConfirmation(null);
    setRemovingId(meeting.id);
    try {
      const removed = await teachingAssignmentService.removeMeeting(meeting.id);
      if (removed) {
        setMeetings((current) => current.filter((m) => m.id !== meeting.id));
        setConfirmation("Meeting removed.");
      } else {
        setError("Could not remove this meeting.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not remove this meeting.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Page
      title={`${subjectName} — ${sectionName} — schedule`}
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Add each weekly meeting time for this class. A teacher, section, or room can&rsquo;t be
            double-booked for overlapping times.
          </p>
        ) : undefined
      }
    >
      <button type="button" className="section-roster-back" onClick={onBack}>
        <span aria-hidden="true">← </span>Back to teaching assignments
      </button>

      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading this class's schedule…" />
      ) : loadError ? null : (
        <>
          {meetings.length === 0 ? (
            <EmptyState>No meetings scheduled for this class yet.</EmptyState>
          ) : (
            <table className="attendance-roster">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Time</th>
                  <th scope="col">Room</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((meeting) => (
                  <tr key={meeting.id}>
                    <th scope="row">{WEEKDAY_LABELS[meeting.weekday]}</th>
                    <td>
                      {meeting.startsAt}–{meeting.endsAt}
                    </td>
                    <td>{meeting.room ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        disabled={removingId === meeting.id}
                        onClick={() => handleRemove(meeting)}
                        aria-label={`Remove the ${WEEKDAY_LABELS[meeting.weekday]} ${meeting.startsAt} meeting`}
                      >
                        {removingId === meeting.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleCreate} aria-label="Schedule a meeting">
            <h3>Schedule a meeting</h3>
            <div className="form-row">
              <div className="field">
                <label htmlFor="meeting-weekday">Day</label>
                <select
                  id="meeting-weekday"
                  value={weekday}
                  onChange={(event) => setWeekday(event.target.value)}
                >
                  {WEEKDAY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="meeting-starts-at">Start time</label>
                <input
                  id="meeting-starts-at"
                  type="time"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="meeting-ends-at">End time</label>
                <input
                  id="meeting-ends-at"
                  type="time"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="meeting-room">Room (optional)</label>
                <input
                  id="meeting-room"
                  type="text"
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="button-primary" disabled={creating}>
              {creating ? "Scheduling…" : "Schedule meeting"}
            </button>
          </form>
        </>
      )}
    </Page>
  );
}
