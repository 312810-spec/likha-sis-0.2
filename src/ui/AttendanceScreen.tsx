import { useEffect, useRef, useState } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { SectionApplicationService } from "../application/section-service";
import { ATTENDANCE_STATUSES } from "../domain/attendance";
import type { AttendanceRosterEntry, AttendanceStatus } from "../domain/attendance";
import { ValidationError } from "../domain/errors";
import type { Section } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { StatusChip } from "./components/StatusChip";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AttendanceScreenProps {
  attendanceService: AttendanceApplicationService;
  sectionService: SectionApplicationService;
  /** A section to select by default instead of the first loaded section
   * -- set when a teacher arrives here via TeacherWorkspaceScreen's
   * "mark/continue/review attendance" action for a specific section.
   * Verified against the actually-loaded section list before use (never
   * trusted blindly): if this section no longer exists, this screen
   * falls back to its ordinary default (the first loaded section) exactly
   * as if no value had been supplied, rather than silently selecting the
   * wrong section or leaving nothing selected. See
   * docs/adr/0032-teacher-workspace-polish.md. */
  initialSectionId?: string;
  /** Opens Monthly Summary with the currently selected section and the
   * year/month of the currently selected date already preserved -- a
   * narrowly-typed callback/state handoff, not a router or global store,
   * matching ADR-0032's section-preselection pattern. Omitted (e.g. in
   * older tests) simply hides the transition action. */
  onViewMonthlySummary?: (sectionId: string, year: number, month: number) => void;
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

function buttonKey(learnerId: string, status: AttendanceStatus): string {
  return `${learnerId}:${status}`;
}

export function AttendanceScreen({
  attendanceService,
  sectionService,
  initialSectionId,
  onViewMonthlySummary,
}: AttendanceScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [date, setDate] = useState(todayAsIsoDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [roster, setRoster] = useState<AttendanceRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [savingLearnerIds, setSavingLearnerIds] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<
    Record<string, { message: string; status: AttendanceStatus }>
  >({});
  const [bulkMarking, setBulkMarking] = useState(false);
  // Dedicated (not `rosterError`) so its Retry action targets exactly
  // what failed -- `rosterError`'s own Retry button calls `loadRoster`,
  // which would silently just reload the roster instead of actually
  // retrying "Mark all present" if the two shared one state.
  const [bulkMarkError, setBulkMarkError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Per-learner write "generation": incremented every time a new write
  // starts for that learner. An in-flight write's response is applied
  // only if it is still the latest generation for that learner when it
  // settles -- this is what stops an older, slower write's response from
  // overwriting a newer one, regardless of network/response ordering.
  const writeGenerationRef = useRef<Map<string, number>>(new Map());
  // Request identity for the section-list and roster fetches: guards
  // against an in-flight request whose context (section/date) has since
  // changed from applying its result to the now-current context.
  const sectionsRequestRef = useRef(0);
  const rosterRequestRef = useRef(0);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Every page-level "Retry" button below sits inside an error Alert that
  // its own retry function unmounts as its first synchronous step (the
  // error state is cleared before the async retry even starts) -- so the
  // button being clicked is removed from the document before its own
  // click handler finishes, and focus would otherwise drop to <body> per
  // the HTML spec's remove-focused-element behavior. Moving focus to the
  // heading first, synchronously, avoids that: by the time the button is
  // actually removed, it's no longer the focused element.
  function retryWithHeadingFocus(retryFn: () => void) {
    headingRef.current?.focus();
    retryFn();
  }

  function loadSections() {
    const requestId = ++sectionsRequestRef.current;
    setSectionsLoading(true);
    setSectionsError(null);
    sectionService
      .listSections()
      .then((result) => {
        if (sectionsRequestRef.current !== requestId) return;
        setSections(result);
        // Prefer the workspace-supplied section, but only if it's still
        // real -- never trust it blindly, and never leave the screen
        // silently on the wrong section if it was deleted/renamed since.
        const preselected =
          initialSectionId && result.some((section) => section.id === initialSectionId)
            ? initialSectionId
            : result[0]?.id;
        if (preselected) setSectionId(preselected);
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
    loadSections();
    // initialSectionId is intentionally a mount-time-only default, not a
    // live binding: if a teacher changes the section dropdown by hand, a
    // later change to initialSectionId (e.g. a stale prop from a parent
    // re-render) must not silently override their own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionService]);

  function loadRoster() {
    if (!sectionId) return;
    const requestId = ++rosterRequestRef.current;
    setLoading(true);
    setRosterError(null);
    attendanceService
      .rosterForDate(sectionId, date)
      .then((result) => {
        if (rosterRequestRef.current !== requestId) return;
        setRoster(result);
      })
      .catch(() => {
        if (rosterRequestRef.current !== requestId) return;
        setRosterError("Could not load the attendance roster for this date.");
      })
      .finally(() => {
        if (rosterRequestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // Clear the previous section/date's roster immediately, before the
    // new request even settles -- a failed load must never leave a
    // different context's roster rendered as if it belongs to the newly
    // selected section/date.
    setRoster([]);
    setRowErrors({});
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceService, sectionId, date]);

  function handleDateChange(newDate: string) {
    setConfirmation(null);
    setDate(newDate);
  }

  function handleSectionChange(newSectionId: string) {
    setConfirmation(null);
    setSectionId(newSectionId);
  }

  async function handleMark(learnerId: string, status: AttendanceStatus) {
    const entry = roster.find((candidate) => candidate.learnerId === learnerId);
    // Selecting the already-active status is a no-op, not a write -- both
    // to avoid an unnecessary round trip and so a stray duplicate click
    // can never surface a false "saving" state.
    if (entry && entry.status === status) return;

    setConfirmation(null);
    setRowErrors((current) => {
      if (!(learnerId in current)) return current;
      const next = { ...current };
      delete next[learnerId];
      return next;
    });
    const generation = (writeGenerationRef.current.get(learnerId) ?? 0) + 1;
    writeGenerationRef.current.set(learnerId, generation);
    setSavingLearnerIds((current) => new Set(current).add(learnerId));

    try {
      await attendanceService.recordAttendance(sectionId, learnerId, date, status);
      // An older write's response must never overwrite a newer one's
      // result -- only apply this response if nothing newer started for
      // this learner while it was in flight.
      if (writeGenerationRef.current.get(learnerId) !== generation) return;
      setRoster((current) =>
        current.map((candidate) =>
          candidate.learnerId === learnerId
            ? { ...candidate, status, recordedAt: new Date().toISOString() }
            : candidate,
        ),
      );
    } catch (err) {
      if (writeGenerationRef.current.get(learnerId) !== generation) return;
      setRowErrors((current) => ({
        ...current,
        [learnerId]: {
          message: err instanceof ValidationError ? err.message : "Could not save this mark.",
          status,
        },
      }));
    } finally {
      if (writeGenerationRef.current.get(learnerId) === generation) {
        setSavingLearnerIds((current) => {
          const next = new Set(current);
          next.delete(learnerId);
          return next;
        });
      }
    }
  }

  async function handleMarkAllPresent() {
    setBulkMarkError(null);
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
      setBulkMarkError(
        err instanceof ValidationError ? err.message : "Could not mark the roster present.",
      );
    } finally {
      setBulkMarking(false);
    }
  }

  function handleRosterKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    learnerId: string,
    status: AttendanceStatus,
  ) {
    const key = event.key;
    if (key === "p" || key === "P") {
      event.preventDefault();
      void handleMark(learnerId, "present");
    } else if (key === "a" || key === "A") {
      event.preventDefault();
      void handleMark(learnerId, "absent");
    } else if (key === "t" || key === "T") {
      event.preventDefault();
      void handleMark(learnerId, "tardy");
    } else if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const index = roster.findIndex((candidate) => candidate.learnerId === learnerId);
      const target = roster[key === "ArrowDown" ? index + 1 : index - 1];
      if (!target) return;
      buttonRefs.current.get(buttonKey(target.learnerId, status))?.focus();
    }
  }

  const markedCount = roster.filter((entry) => entry.status !== null).length;
  const remainingCount = roster.length - markedCount;

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

      {sectionsError && (
        <Alert tone="error">
          <p>{sectionsError}</p>
          <button type="button" onClick={() => retryWithHeadingFocus(loadSections)}>
            Retry
          </button>
        </Alert>
      )}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {sectionsLoading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        sectionsError ? null : (
          <EmptyState>No sections created yet. Create a section under "Sections" first.</EmptyState>
        )
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

          {onViewMonthlySummary && sectionId && (
            <button
              type="button"
              onClick={() => {
                const yearPart = Number(date.slice(0, 4));
                const monthPart = Number(date.slice(5, 7));
                onViewMonthlySummary(sectionId, yearPart, monthPart);
              }}
            >
              View monthly summary
            </button>
          )}

          {rosterError && (
            <Alert tone="error">
              <p>{rosterError}</p>
              <button type="button" onClick={() => retryWithHeadingFocus(loadRoster)}>
                Retry
              </button>
            </Alert>
          )}

          {loading ? (
            <Loading label="Loading roster…" />
          ) : rosterError ? null : roster.length === 0 ? (
            <EmptyState>No learners enrolled in this section yet.</EmptyState>
          ) : (
            <>
              <p className="attendance-count">
                <strong>
                  {markedCount} of {roster.length} marked
                </strong>{" "}
                · {remainingCount} remaining
              </p>
              {mode === "guided" && (
                <p className="field-hint">
                  Most days, most of the class is present. Use "Mark all present" to fill in
                  everyone who doesn't have a mark yet — it never changes a mark you've already
                  made, so it's always safe to use. Then adjust the few who are Absent or Tardy.
                </p>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={bulkMarking || roster.every((entry) => entry.status !== null)}
                onClick={handleMarkAllPresent}
                aria-describedby="bulk-mark-hint"
              >
                {bulkMarking ? "Marking…" : "Mark all present"}
              </button>
              {bulkMarkError && (
                <Alert tone="error">
                  <p>{bulkMarkError}</p>
                  <button type="button" onClick={() => retryWithHeadingFocus(handleMarkAllPresent)}>
                    Retry
                  </button>
                </Alert>
              )}
              <p className="field-hint" id="bulk-mark-hint">
                Only fills in learners with no mark yet — never changes a mark you've already made.
              </p>
              <p className="field-hint">
                Keyboard: P Present · A Absent · T Tardy · ↑/↓ move between learners (while focus is
                on a status button).
              </p>
              <table className="attendance-roster">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((entry) => {
                    const rowError = rowErrors[entry.learnerId];
                    const isSaving = savingLearnerIds.has(entry.learnerId);
                    return (
                      <tr key={entry.learnerId}>
                        <th scope="row">
                          {entry.givenName} {entry.familyName}
                        </th>
                        <td>
                          <div
                            role="group"
                            aria-label={`Attendance status for ${entry.givenName} ${entry.familyName}`}
                            aria-describedby={rowError ? `row-error-${entry.learnerId}` : undefined}
                          >
                            {ATTENDANCE_STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                ref={(el) => {
                                  const key = buttonKey(entry.learnerId, status);
                                  if (el) buttonRefs.current.set(key, el);
                                  else buttonRefs.current.delete(key);
                                }}
                                aria-pressed={entry.status === status}
                                disabled={bulkMarking}
                                onClick={() => handleMark(entry.learnerId, status)}
                                onKeyDown={(event) =>
                                  handleRosterKeyDown(event, entry.learnerId, status)
                                }
                              >
                                {STATUS_LABELS[status]}
                              </button>
                            ))}
                          </div>
                          {entry.status === null && !isSaving && (
                            <StatusChip tone="neutral">Not marked</StatusChip>
                          )}
                          {isSaving && (
                            <span className="field-hint" role="status">
                              Saving…
                            </span>
                          )}
                          {rowError && (
                            <Alert tone="error" inline>
                              <span id={`row-error-${entry.learnerId}`}>{rowError.message}</span>{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  // handleMark clears this row's error (and
                                  // this Retry button along with it) as its
                                  // first synchronous step -- move focus to
                                  // the still-mounted status button for
                                  // this row/status *before* that happens,
                                  // or focus drops to <body> per the HTML
                                  // spec's remove-focused-element behavior.
                                  buttonRefs.current
                                    .get(buttonKey(entry.learnerId, rowError.status))
                                    ?.focus();
                                  void handleMark(entry.learnerId, rowError.status);
                                }}
                              >
                                Retry
                              </button>
                            </Alert>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}
