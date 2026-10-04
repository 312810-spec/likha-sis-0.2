import { useEffect, useState } from "react";
import type { SchedulePlanApplicationService } from "../application/schedule-plan-service";
import type { PublishedTeacherMeeting } from "../domain/schedule-plan";
import { Page } from "./components/Page";
import { Alert } from "./components/Alert";
import "./schedule-planner.css";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function PublishedScheduleScreen({
  service,
  onOpenClass,
}: {
  service: SchedulePlanApplicationService;
  onOpenClass?: (teachingAssignmentId: string) => void;
}) {
  const [date, setDate] = useState(localDate);
  const [meetings, setMeetings] = useState<PublishedTeacherMeeting[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    service
      .listMine(date)
      .then((rows) => {
        if (active) {
          setMeetings(rows);
          setError("");
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Could not read your saved schedule. Reopen this page to retry.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [service, date]);
  return (
    <Page
      title="My published schedule"
      actions={
        <button type="button" onClick={() => window.print()}>
          Print schedule
        </button>
      }
      hint={
        <p>
          This device shows the last transferred published version. An upcoming change appears after
          it is published and transferred. The schedule does not mark attendance automatically.
        </p>
      }
    >
      <label className="field">
        Schedule effective on
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setLoading(true);
          }}
        />
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <p role="status">Loading your schedule…</p>
      ) : (
        !error &&
        (meetings.length ? (
          <>
            <p>
              {meetings[0].planLabel} · Published {meetings[0].publishedAt} · Applies{" "}
              {meetings[0].effectiveFrom} through {meetings[0].effectiveUntil}
            </p>
            <div className="schedule-table-wrap">
              <table>
                <caption>Your weekly class meetings</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Time</th>
                    <th scope="col">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <tr key={`${m.planId}-${m.courseId}-${m.weekday}-${m.startsAt}`}>
                      <th scope="row">{DAYS[m.weekday]}</th>
                      <td>
                        {m.startsAt}–{m.endsAt}
                      </td>
                      <td>
                        {onOpenClass ? (
                          <button type="button" onClick={() => onOpenClass(m.teachingAssignmentId)}>
                            Open assigned class
                          </button>
                        ) : (
                          "Assigned class"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>
            No published class meetings are saved for you on this date. Ask the school scheduler
            whether a version has been published and transferred.
          </p>
        ))
      )}
    </Page>
  );
}
