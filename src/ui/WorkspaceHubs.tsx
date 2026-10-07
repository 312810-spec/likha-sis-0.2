import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import type { ScheduleMeeting } from "../domain/schedule-meeting";
import { WEEKDAY_LABELS } from "../domain/schedule-meeting";
import {
  canNavigateTab,
  visibleNavGroups,
  type SignedInTab,
} from "./components/workbench-nav-data";
import { Page } from "./components/Page";
import { Alert } from "./components/Alert";
import { Skeleton } from "./components/Skeleton";
import { EmptyState } from "./components/EmptyState";
import type { TeacherClassWorkContext } from "./work-context";

export function MoreScreen({
  onNavigate,
  roles,
}: {
  onNavigate: (tab: SignedInTab) => void;
  roles?: readonly string[];
}) {
  return (
    <Page title="More">
      <p className="field-hint">School records, teaching tools, and device settings.</p>
      <div className="workspace-directory">
        <section>
          <h3>My teaching</h3>
          <div className="workspace-links">
            {[
              { id: "class-records", label: "Class Record" },
              { id: "calendar", label: "Calendar" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id as SignedInTab)}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
        {visibleNavGroups(roles).map((group) => (
          <section key={group.label}>
            <h3>{group.label}</h3>
            <div className="workspace-links">
              {group.tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => onNavigate(tab.id)}>
                  <span>{tab.label}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}

export function SchoolFormsScreen({
  onNavigate,
  roles,
}: {
  onNavigate: (tab: SignedInTab) => void;
  roles?: readonly string[];
}) {
  return (
    <Page title="School Forms">
      <p className="field-hint">Choose a record to review before creating an export.</p>
      <div className="workspace-form-list">
        <section>
          <h3>Attendance</h3>
          <div className="workspace-link-row">
            <div>
              <strong>SF2 · Daily attendance</strong>
              <p>Open your advisory to record attendance and review its monthly preview.</p>
            </div>
            <button type="button" onClick={() => onNavigate("adviser-view")}>
              Open My Advisory
            </button>
          </div>
          <p className="field-hint">
            The available CSV is SF2-inspired. Review its populated and omitted fields before use;
            it is not a submission-ready official SF2.
          </p>
        </section>
        <section>
          <h3>Grades</h3>
          <div className="workspace-link-row">
            <div>
              <strong>Report card</strong>
              <p>
                Choose a class and grading period to review grades and available report-card
                exports.
              </p>
            </div>
            <button type="button" onClick={() => onNavigate("class-records")}>
              Open Class Record
            </button>
          </div>
          <p className="field-hint">
            Available report cards are review exports, not official SF9 forms.
          </p>
        </section>
        <section>
          <h3>Drafts and evidence</h3>
          <p>
            Prepare school form drafts and TANAW samples, attach evidence, and track school review.
            SF8 remains inactive.
          </p>
          <button type="button" onClick={() => onNavigate("review-workspace")}>
            Open forms and TANAW review
          </button>
        </section>
        {canNavigateTab("sf1-import", roles) && (
          <section>
            <h3>Learners</h3>
            <div className="workspace-link-row">
              <div>
                <strong>SF1 · School register</strong>
                <p>Import learners from an SF1 file and review matches before saving.</p>
              </div>
              <button type="button" onClick={() => onNavigate("sf1-import")}>
                Import learners
              </button>
            </div>
            <div className="workspace-link-row">
              <div>
                <strong>Class roster</strong>
                <p>Review enrollment and available roster exports.</p>
              </div>
              <button type="button" onClick={() => onNavigate("sections")}>
                Open sections
              </button>
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
interface ScheduledClass {
  assignment: TeachingAssignmentSummary;
  meeting: ScheduleMeeting;
}
export function CalendarScreen({
  subjectAttendanceService,
  teacherUserId,
  onOpenClass,
}: {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  teacherUserId: string;
  onOpenClass: (context: TeacherClassWorkContext) => void;
}) {
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [rows, setRows] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    let cancelled = false;
    // Synchronize the authorized schedule read model with the current actor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setRows([]);
    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then(async (assignments) => {
        const meetings = await Promise.all(
          assignments.map(async (assignment) =>
            (await subjectAttendanceService.listMeetings(assignment.id)).map((meeting) => ({
              assignment,
              meeting,
            })),
          ),
        );
        if (!cancelled && request.current === id)
          setRows(
            meetings.flat().sort((a, b) => a.meeting.startsAt.localeCompare(b.meeting.startsAt)),
          );
      })
      .catch(() => {
        if (!cancelled && request.current === id)
          setError("Could not load your class schedule. Try again.");
      })
      .finally(() => {
        if (!cancelled && request.current === id) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teacherUserId, subjectAttendanceService, reload]);
  const chosen = new Date(`${date}T12:00:00`);
  const weekday = chosen.getDay();
  const occurrences = rows.filter((row) => row.meeting.weekday === weekday);
  const move = (days: number) => {
    const next = new Date(chosen);
    next.setDate(next.getDate() + days);
    setDate(isoDate(next));
  };
  return (
    <Page title="Calendar">
      <p className="field-hint">
        Your assigned weekly class schedule. School holidays and cancellations are not included.
      </p>
      <div className="calendar-controls">
        <button type="button" onClick={() => move(-1)} disabled={!date}>
          Previous day
        </button>
        <label className="field">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <button type="button" onClick={() => move(1)} disabled={!date}>
          Next day
        </button>
        <button type="button" onClick={() => setDate(isoDate(new Date()))}>
          Today
        </button>
      </div>
      <h3>
        {WEEKDAY_LABELS[weekday]} ·{" "}
        {chosen.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
      </h3>
      {loading ? (
        <Skeleton label="Loading class schedule…" lines={4} />
      ) : error ? (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Retry schedule
          </button>
        </Alert>
      ) : occurrences.length === 0 ? (
        <EmptyState
          title="No scheduled classes for this day"
          description="Choose another date to view your saved weekly class schedule."
        />
      ) : (
        <ol className="calendar-agenda">
          {occurrences.map(({ assignment, meeting }) => (
            <li key={meeting.id}>
              <span className="calendar-time">
                {meeting.startsAt}–{meeting.endsAt}
              </span>
              <div>
                <strong>{assignment.subjectName}</strong>
                <p>
                  {assignment.sectionName}
                  {meeting.room ? ` · ${meeting.room}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenClass({
                    teachingAssignmentId: assignment.id,
                    subjectName: assignment.subjectName,
                    sectionName: assignment.sectionName,
                    startsAt: meeting.startsAt,
                    endsAt: meeting.endsAt,
                    room: meeting.room,
                  })
                }
              >
                Open class
              </button>
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}
