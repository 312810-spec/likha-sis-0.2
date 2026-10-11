import { useEffect, useState } from "react";
import type { MyDayApplicationService } from "../application/my-day-service";
import type { MyDayPendingFollowup, MyDaySummary } from "../domain/my-day";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import type { TeacherClassWorkContext } from "./work-context";

interface ReviewScreenProps {
  myDayService: MyDayApplicationService;
  onOpenAttendance: (assignmentId: string, context?: TeacherClassWorkContext) => void;
  onOpenClassRecord: (
    assignmentId: string,
    recordId: string,
    context?: TeacherClassWorkContext,
  ) => void;
  onOpenFollowup: (marker: MyDayPendingFollowup) => void;
  onOpenConflicts: () => void;
  onOpenTeachingLoad: () => void;
  onOpenForms: () => void;
}

/** A projection of existing trusted read models; no invented completion/approval state. */
export function ReviewScreen({
  myDayService,
  onOpenAttendance,
  onOpenClassRecord,
  onOpenFollowup,
  onOpenConflicts,
  onOpenTeachingLoad,
  onOpenForms,
}: ReviewScreenProps) {
  const [summary, setSummary] = useState<MyDaySummary | null>(null);
  const [error, setError] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    void myDayService
      .getSummary(now.getDay(), date, time)
      .then((value) => {
        if (active) {
          setSummary(value);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setSummary(null);
        }
      });
    return () => {
      active = false;
    };
  }, [myDayService, request]);
  const refresh = () => {
    setSummary(null);
    setError(false);
    setRequest((value) => value + 1);
  };
  const count = summary
    ? summary.pendingAttendance.length +
      summary.pendingScoring.length +
      summary.pendingFollowups.length +
      summary.pendingConflicts.length +
      summary.pendingAssignments.length
    : 0;
  return (
    <Page
      title="Review"
      actions={
        <button type="button" onClick={refresh}>
          Refresh review
        </button>
      }
      hint={
        <p className="page-hint">
          Review the work already recorded for your assigned classes. These checks do not approve
          grades, finalize records, or certify school forms.
        </p>
      }
    >
      {error ? (
        <Alert tone="error">
          Review could not be loaded. Your records have not changed.{" "}
          <button type="button" onClick={refresh}>
            Retry review
          </button>
        </Alert>
      ) : !summary ? (
        <Loading label="Loading work to review…" />
      ) : (
        <>
          {count === 0 ? (
            <EmptyState
              title="No pending items in these checks"
              description="The current read model has no attendance, scoring, follow-up, schedule, or transfer-conflict items. This does not verify all school reporting requirements."
            />
          ) : (
            <p role="status">
              {count} pending {count === 1 ? "item" : "items"} in the available checks.
            </p>
          )}
          {summary.pendingAttendance.length > 0 && (
            <section aria-label="Attendance to check">
              <h3>Attendance to check</h3>
              <ul>
                {summary.pendingAttendance.map((item) => (
                  <li key={item.teachingAssignmentId}>
                    <strong>
                      {item.subjectName} · {item.sectionName}
                    </strong>{" "}
                    — Today’s subject attendance has not been checked.{" "}
                    <button
                      type="button"
                      onClick={() => onOpenAttendance(item.teachingAssignmentId, item)}
                    >
                      Check attendance
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {summary.pendingScoring.length > 0 && (
            <section aria-label="Unfinished scoring">
              <h3>Unfinished scoring</h3>
              <ul>
                {summary.pendingScoring.map((item) => (
                  <li key={item.classRecordId}>
                    <strong>
                      {item.subjectName} · {item.sectionName} · {item.gradingPeriodLabel}
                    </strong>{" "}
                    — {item.recordedCount} of {item.totalCount} scores recorded.{" "}
                    <button
                      type="button"
                      onClick={() =>
                        onOpenClassRecord(item.teachingAssignmentId, item.classRecordId, item)
                      }
                    >
                      Review this record
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {summary.pendingFollowups.length > 0 && (
            <section aria-label="Learner follow-up">
              <h3>Learner follow-up</h3>
              <ul>
                {summary.pendingFollowups.map((item) => (
                  <li key={item.markerId}>
                    <strong>
                      {item.learnerGivenName} {item.learnerFamilyName} · {item.subjectName} ·{" "}
                      {item.sectionName}
                    </strong>{" "}
                    — {item.occurrenceDate}: {item.reason}{" "}
                    <button type="button" onClick={() => onOpenFollowup(item)}>
                      Review follow-up
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {summary.pendingConflicts.length > 0 && (
            <section aria-label="Transfer conflicts">
              <h3>Transfer conflicts</h3>
              <p>
                {summary.pendingConflicts.length} unresolved{" "}
                {summary.pendingConflicts.length === 1 ? "conflict" : "conflicts"}. A local save and
                transfer to the school hub are separate confirmations.
              </p>
              <button type="button" onClick={onOpenConflicts}>
                Review conflicts
              </button>
            </section>
          )}
          {summary.pendingAssignments.length > 0 && (
            <section aria-label="Classes without a schedule">
              <h3>Classes without a schedule</h3>
              <ul>
                {summary.pendingAssignments.map((item) => (
                  <li key={item.teachingAssignmentId}>
                    {item.subjectName} · {item.sectionName}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onOpenTeachingLoad}>
                Review teaching load
              </button>
            </section>
          )}
        </>
      )}
      <section aria-label="Report review">
        <h3>Reports and forms</h3>
        <p>
          Open School Forms to review available source data and each export’s disclosed limitations.
          Generated previews and reference exports need teacher review; this screen does not assert
          official template fidelity or approval.
        </p>
        <button type="button" onClick={onOpenForms}>
          Open School Forms
        </button>
      </section>
    </Page>
  );
}
