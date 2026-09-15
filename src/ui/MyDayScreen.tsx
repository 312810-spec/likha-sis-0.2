import { useEffect, useRef, useState } from "react";
import type { MyDayApplicationService } from "../application/my-day-service";
import type { MyDaySummary } from "../domain/my-day";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { ClassWorkspaceScreen } from "./ClassWorkspaceScreen";
import { useTeacherMode } from "./theme/useTeacherMode";
import type { TeacherClassWorkContext } from "./work-context";

interface MyDayScreenProps {
  myDayService: MyDayApplicationService;
  selectedClassContext?: TeacherClassWorkContext | null;
  onOpenClassContext: (context: TeacherClassWorkContext) => void;
  onBackToToday: () => void;
  onCheckAttendance: (teachingAssignmentId: string) => void;
  onOpenClassRecords: (teachingAssignmentId: string) => void;
  /** Opens the sync conflict review queue -- see `ConflictReviewScreen`. */
  onReviewConflicts: () => void;
}

/** `0 = Sunday … 6 = Saturday`, matching `domain/schedule-meeting.ts`'s
 * established convention and JavaScript's own `Date.prototype.getDay()`. */
function todayWeekdayAndIsoDate(): { weekday: number; date: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return { weekday: now.getDay(), date: `${year}-${month}-${day}` };
}

/**
 * "My Day" — the read model that begins LIKHA's Golden Journey. Class
 * context is owned above this screen so the same bounded assignment can move
 * into connected attendance and class-record work without becoming an
 * authorization source itself.
 */
export function MyDayScreen({
  myDayService,
  selectedClassContext = null,
  onOpenClassContext,
  onBackToToday,
  onCheckAttendance,
  onOpenClassRecords,
  onReviewConflicts,
}: MyDayScreenProps) {
  const { mode } = useTeacherMode();
  const [summary, setSummary] = useState<MyDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    const { weekday, date } = todayWeekdayAndIsoDate();

    myDayService
      .getSummary(weekday, date)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setSummary(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load My Day.");
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
  }, [myDayService]);

  if (selectedClassContext) {
    return (
      <ClassWorkspaceScreen
        context={selectedClassContext}
        onCheckAttendance={onCheckAttendance}
        onOpenClassRecords={onOpenClassRecords}
        onBackToToday={onBackToToday}
      />
    );
  }

  return (
    <Page
      title="My Day"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Today&rsquo;s classes in order, plus anything from today that still needs your attention
            — attendance not yet checked, and sync conflicts waiting on your review.
          </p>
        ) : undefined
      }
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
        <Loading label="Loading My Day…" />
      ) : error || !summary ? null : (
        <>
          <h3>Today&rsquo;s schedule</h3>
          {summary.schedule.length === 0 ? (
            <EmptyState>No classes scheduled for you today.</EmptyState>
          ) : (
            <ul className="workspace-priority-rail">
              {summary.schedule.map((item, index) => (
                <li
                  key={`${item.teachingAssignmentId}-${item.startsAt}-${index}`}
                  className="workspace-priority-item"
                >
                  <div className="workspace-priority-main">
                    <span className="workspace-priority-section">
                      {item.subjectName} — {item.sectionName}
                    </span>
                    <span className="field-hint">
                      {item.startsAt}–{item.endsAt}
                      {item.room ? ` · ${item.room}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() =>
                      onOpenClassContext({
                        teachingAssignmentId: item.teachingAssignmentId,
                        subjectName: item.subjectName,
                        sectionName: item.sectionName,
                        startsAt: item.startsAt,
                        endsAt: item.endsAt,
                        room: item.room,
                      })
                    }
                  >
                    Open class
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3>Needs your attention today</h3>
          {summary.pendingAttendance.length === 0 && summary.pendingConflicts.length === 0 ? (
            <EmptyState>Nothing pending — you&rsquo;re all caught up for today.</EmptyState>
          ) : (
            <ul className="workspace-priority-rail">
              {summary.pendingAttendance.map((task) => (
                <li
                  key={task.teachingAssignmentId}
                  className="workspace-priority-item is-not-started"
                >
                  <div className="workspace-priority-main">
                    <span className="workspace-priority-section">
                      {task.subjectName} — {task.sectionName}
                    </span>
                    <span className="field-hint">attendance not yet checked</span>
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onCheckAttendance(task.teachingAssignmentId)}
                  >
                    Check attendance
                  </button>
                </li>
              ))}
              {summary.pendingConflicts.length > 0 && (
                <li className="workspace-priority-item is-not-started">
                  <div className="workspace-priority-main">
                    <span className="workspace-priority-section">
                      {summary.pendingConflicts.length} sync{" "}
                      {summary.pendingConflicts.length === 1 ? "conflict" : "conflicts"}
                    </span>
                    <span className="field-hint">waiting on your review</span>
                  </div>
                  <button type="button" className="button-primary" onClick={onReviewConflicts}>
                    Review conflicts
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
