import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassroomDraftApplicationService } from "../application/classroom-draft-service";
import type {
  ClassroomDraft,
  ClassroomDraftFields,
} from "../domain/ports/classroom-draft-repository";
import type { ClassOccurrenceApplicationService } from "../application/class-occurrence-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  ClassOccurrence,
  LearnerFollowupMarker,
  OccurrenceOutcome,
  OccurrenceStatus,
} from "../domain/class-occurrence";
import type {
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
} from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { StatusChip, type StatusChipTone } from "./components/StatusChip";
import { useTeacherMode } from "./theme/useTeacherMode";
import { useSessionDraft } from "./useSessionDraft";
import { sessionDraftEpoch } from "./session-draft-store";
import { classroomWritePending, enqueueClassroomWrite } from "./classroom-write-queue";
import type { TeacherClassWorkContext } from "./work-context";

interface ClassroomModeScreenProps {
  teachingAssignmentId: string;
  classContext: TeacherClassWorkContext;
  classOccurrenceService: ClassOccurrenceApplicationService;
  classroomDraftService?: ClassroomDraftApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  /** Opens Subject Attendance for this class, already selected -- the same
   * narrow callback shape `MyDayScreen`'s own `onCheckAttendance`
   * established. */
  onCheckAttendance: (teachingAssignmentId: string) => void;
  /** Returns to the My Day class workspace. Clearing the handoff unmounts
   * this screen, so My Day's own mount-time fetch runs on return and the
   * attention rail cannot stay stale -- the M04 finding about
   * `ClassWorkspaceScreen` rendering without a tab change. */
  onBackToClass: () => void;
}

/**
 * The four states M06's acceptance clause names, as a teacher reads them.
 * The text always carries the meaning (WCAG 1.4.1): tone is an additive
 * visual cue, never the only signal that two occurrences differ.
 */
const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  planned: "Planned",
  changed: "Changed",
  cancelled: "Cancelled",
  delivered: "Delivered",
};

const STATUS_TONE: Record<OccurrenceStatus, StatusChipTone> = {
  planned: "neutral",
  changed: "warning",
  cancelled: "danger",
  delivered: "success",
};

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The capture fields a teacher can edit while a class is in flight. The slot
 * fields are normalized to `null` when blank: an empty string is not the same
 * as "not recorded", and `null` is what keeps a cleared slot from counting as
 * a deviation from the plan.
 */
interface CaptureDraft {
  actualStartsAt: string;
  actualEndsAt: string;
  actualRoom: string;
  learningTarget: string;
  quickEvidence: string;
  notes: string;
}

function draftFrom(occurrence: ClassOccurrence | null): CaptureDraft {
  return {
    actualStartsAt: occurrence?.actualStartsAt ?? "",
    actualEndsAt: occurrence?.actualEndsAt ?? "",
    actualRoom: occurrence?.actualRoom ?? "",
    learningTarget: occurrence?.learningTarget ?? "",
    quickEvidence: occurrence?.quickEvidence ?? "",
    notes: occurrence?.notes ?? "",
  };
}

function slotOrNone(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** True when the draft already matches what is persisted, so a successful
 * save does not itself schedule another save. Compared field-wise and on the
 * normalized slot values, because a blank slot field is persisted as `null`
 * while the input holds an empty string. */
function draftIsPersisted(draft: CaptureDraft, occurrence: ClassOccurrence | null): boolean {
  return (
    (occurrence?.actualStartsAt ?? null) === slotOrNone(draft.actualStartsAt) &&
    (occurrence?.actualEndsAt ?? null) === slotOrNone(draft.actualEndsAt) &&
    (occurrence?.actualRoom ?? null) === slotOrNone(draft.actualRoom) &&
    (occurrence?.learningTarget ?? "") === draft.learningTarget &&
    (occurrence?.quickEvidence ?? "") === draft.quickEvidence &&
    (occurrence?.notes ?? "") === draft.notes
  );
}

/** The local wall-clock calendar date, matching `MyDayScreen`'s and
 * `SubjectAttendanceScreen`'s own "what day is it" convention rather than
 * pulling a server-side clock into this one flow. */
function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Classroom Mode -- CTOS.md §6.3's focused teaching cockpit:
 *
 * ```text
 * Open scheduled class → Start Class → Attendance / current target /
 * quick evidence / notes → Finish Class → Review session summary →
 * Save confirmed class occurrence
 * ```
 *
 * Every transition is decided in Rust and this screen renders the outcome it
 * is given; it never decides for itself that a class may start, finish or be
 * cancelled. The distinction §6.3 requires -- scheduled class / changed or
 * cancelled class / actual delivered occurrence -- is a stored status shown
 * as a chip, not something the reader has to join.
 */
export function ClassroomModeScreen({
  teachingAssignmentId,
  classContext,
  classOccurrenceService,
  classroomDraftService,
  subjectAttendanceService,
  onCheckAttendance,
  onBackToClass,
}: ClassroomModeScreenProps) {
  const { mode } = useTeacherMode();
  const occurrenceDate = todayIsoDate();
  const [occurrence, setOccurrence] = useState<ClassOccurrence | null>(null);
  const [history, setHistory] = useState<ClassOccurrence[]>([]);
  const [session, setSession] = useState<SubjectAttendanceSession | null>(null);
  const [roster, setRoster] = useState<SubjectAttendanceRosterRow[]>([]);
  const [markers, setMarkers] = useState<LearnerFollowupMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<{
    message: string;
    tone: "error" | "warning";
  } | null>(null);
  const [draft, setDraftState] = useState<CaptureDraft>(draftFrom(null));
  const [retained, retain] = useSessionDraft<
    Record<string, { draft: CaptureDraft; summary: string }>
  >(JSON.stringify(["classroom", teachingAssignmentId, occurrenceDate]), {});
  const retainedRef = useRef(retained);
  useEffect(() => {
    retainedRef.current = retained;
  }, [retained]);
  const [restored, setRestored] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [markerError, setMarkerError] = useState<string | null>(null);
  const mounted = useRef(true);
  const contextKey = JSON.stringify([teachingAssignmentId, occurrenceDate, sessionDraftEpoch()]);
  const activeContext = useRef(contextKey);
  useEffect(() => {
    activeContext.current = contextKey;
  }, [contextKey]);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [summary, setSummaryState] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [markingMembershipId, setMarkingMembershipId] = useState<string | null>(null);
  const [pendingReason, setPendingReason] = useState("");
  const requestRef = useRef(0);
  const [discardReview, setDiscardReview] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<ClassroomDraft | null>(null);
  const [recoveryState, setRecoveryState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryAttempt, retryRecovery] = useState(0);
  const [draftEdited, setDraftEdited] = useState(false);
  const recoverySnapshot = JSON.stringify({
    ...draft,
    finishSummary: summary,
    cancelReason,
    pendingReason,
    markingMembershipId,
  });
  const recoverySnapshotRef = useRef(recoverySnapshot);
  useEffect(() => {
    recoverySnapshotRef.current = recoverySnapshot;
  }, [recoverySnapshot]);
  const occurrenceId = occurrence?.id;
  const revision = occurrence?.revision;
  useEffect(() => {
    if (!classroomDraftService || !occurrenceId || revision === undefined) return;
    let cancelled = false;
    const scope = { teachingAssignmentId, occurrenceDate, expectedRevision: revision };
    classroomDraftService
      .load(scope)
      .then((saved) => {
        if (!cancelled) {
          setRecoveryDraft(saved);
          setRecoveryError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRecoveryError("Could not check encrypted recovery drafts.");
      });
    return () => {
      cancelled = true;
    };
  }, [
    classroomDraftService,
    occurrenceId,
    revision,
    teachingAssignmentId,
    occurrenceDate,
    recoveryAttempt,
  ]);
  useEffect(() => {
    if (
      !classroomDraftService ||
      !draftEdited ||
      loading ||
      error ||
      !occurrence ||
      !["planned", "changed"].includes(occurrence.status)
    )
      return;
    const key = contextKey;
    const epoch = sessionDraftEpoch();
    const fields = JSON.parse(recoverySnapshot) as ClassroomDraftFields;
    const scope = { teachingAssignmentId, occurrenceDate, expectedRevision: occurrence.revision };
    // A separate encrypted draft is not a confirmed classroom record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecoveryState("saving");
    void enqueueClassroomWrite(classOccurrenceService, key, () => {
      if (epoch !== sessionDraftEpoch()) throw new Error("Session changed before draft save");
      return classroomDraftService.save(scope, fields);
    })
      .then(() => {
        if (
          mounted.current &&
          activeContext.current === key &&
          recoverySnapshotRef.current === recoverySnapshot
        )
          setRecoveryState("saved");
      })
      .catch(() => {
        if (
          mounted.current &&
          activeContext.current === key &&
          recoverySnapshotRef.current === recoverySnapshot
        )
          setRecoveryState("error");
      });
  }, [
    classroomDraftService,
    classOccurrenceService,
    draftEdited,
    loading,
    error,
    occurrenceId,
    revision,
    occurrence,
    contextKey,
    recoverySnapshot,
    teachingAssignmentId,
    occurrenceDate,
    recoveryAttempt,
  ]);
  async function discardRecovery() {
    if (!classroomDraftService || !occurrence) return;
    try {
      await enqueueClassroomWrite(classOccurrenceService, contextKey, () =>
        classroomDraftService.remove({
          teachingAssignmentId,
          occurrenceDate,
          expectedRevision: occurrence.revision,
        }),
      );
      setRecoveryDraft(null);
      setDiscardReview(false);
      setRecoveryError(null);
    } catch {
      setRecoveryError("Could not discard the encrypted recovery draft.");
    }
  }
  function restoreRecovery() {
    if (!recoveryDraft || !occurrence || !["planned", "changed"].includes(occurrence.status))
      return;
    const fields = recoveryDraft.fields;
    setDraftState(fields);
    setSummaryState(fields.finishSummary);
    setCancelReason(fields.cancelReason);
    setPendingReason(fields.pendingReason);
    setMarkingMembershipId(fields.markingMembershipId);
    setRestored(true);
    setDraftEdited(false);
    setSaveState("idle");
    retain((current) => ({
      ...current,
      [`${occurrence.id}:${occurrence.revision}`]: { draft: fields, summary: fields.finishSummary },
    }));
    setRecoveryDraft(null);
  }
  function setDraft(next: CaptureDraft) {
    setDraftEdited(true);
    setDraftState(next);
    setRestored(false);
    setSaveState("idle");
    if (occurrence)
      retain((current) => ({
        ...current,
        [`${occurrence.id}:${occurrence.revision}`]: { draft: next, summary },
      }));
  }
  function setSummary(next: string) {
    setDraftEdited(true);
    setSummaryState(next);
    if (occurrence)
      retain((current) => ({
        ...current,
        [`${occurrence.id}:${occurrence.revision}`]: { draft, summary: next },
      }));
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Invalidate requests on context change or unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestRef.current;
    };
  }, [contextKey]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    setActionError(null);
    setRosterError(null);
    setMarkerError(null);
    try {
      const [current, occurrences, sessions] = await Promise.all([
        classOccurrenceService.getForDate(teachingAssignmentId, occurrenceDate),
        classOccurrenceService.listForAssignment(teachingAssignmentId),
        subjectAttendanceService.listSessions(teachingAssignmentId),
      ]);
      if (requestId !== requestRef.current) return;
      setDraftEdited(false);
      setOccurrence(current);
      setHistory(occurrences);
      const saved = current ? retainedRef.current[`${current.id}:${current.revision}`] : null;
      const editable = current?.status === "planned" || current?.status === "changed";
      setDraftState(editable && saved ? saved.draft : draftFrom(current));
      setSummaryState(editable && saved ? saved.summary : (current?.summary ?? ""));
      setRestored(Boolean(editable && saved && !draftIsPersisted(saved.draft, current)));
      setSaveState("idle");
      const forToday = sessions.find((row) => row.sessionDate === occurrenceDate) ?? null;
      setSession(forToday);
      setMarkers([]);
      // The roster only exists once an attendance session was opened for
      // this class today; before that there is nobody to mark follow-up on.
      if (!forToday) {
        setRoster([]);
        return;
      }
      try {
        const rows = await subjectAttendanceService.rosterForSession(
          teachingAssignmentId,
          forToday.id,
        );
        if (requestId !== requestRef.current) return;
        setRoster(rows ?? []);
      } catch {
        if (requestId !== requestRef.current) return;
        setRosterError("Could not load this class's roster. Attendance completeness is unknown.");
      }
      if (current) {
        try {
          const list = await classOccurrenceService.listFollowupMarkers(current.id);
          if (requestId !== requestRef.current) return;
          setMarkers(list);
        } catch {
          if (requestId === requestRef.current) setMarkerError("Could not load follow-up markers.");
        }
      }
    } catch {
      if (requestId === requestRef.current) {
        setError("Could not load this class session.");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [
    classOccurrenceService,
    subjectAttendanceService,
    teachingAssignmentId,
    occurrenceDate,
    setLoading,
    setError,
    setActionError,
    setRosterError,
    setMarkerError,
    setOccurrence,
    setHistory,
    setDraftState,
    setSummaryState,
    setRestored,
    setSaveState,
    setSession,
    setMarkers,
    setRoster,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Persists the capture draft. The text fields are sent as-is (an emptied
   * target is a real edit), while a blank slot field is sent as `null` so it
   * reads as "not recorded" rather than as an empty slot that deviates from
   * the plan. */
  const saveDraft = useCallback(
    async (next: CaptureDraft) => {
      if (!occurrence || !["planned", "changed"].includes(occurrence.status)) return false;
      const key = contextKey;
      const epoch = sessionDraftEpoch();
      const revision = occurrence.revision;
      if (draftIsPersisted(next, occurrence) && !classroomWritePending(classOccurrenceService, key))
        return true;
      setSaveState("saving");
      try {
        const updated = await enqueueClassroomWrite(classOccurrenceService, key, () => {
          if (epoch !== sessionDraftEpoch()) throw new Error("Session changed before capture");
          return classOccurrenceService.capture(teachingAssignmentId, occurrenceDate, {
            expectedRevision: revision,
            actualStartsAt: slotOrNone(next.actualStartsAt),
            actualEndsAt: slotOrNone(next.actualEndsAt),
            actualRoom: slotOrNone(next.actualRoom),
            learningTarget: next.learningTarget,
            quickEvidence: next.quickEvidence,
            notes: next.notes,
          });
        });
        if (
          !updated ||
          updated.revision !== revision ||
          !["planned", "changed"].includes(updated.status) ||
          !draftIsPersisted(next, updated)
        )
          throw new Error("Capture was refused or not acknowledged");
        if (mounted.current && activeContext.current === key) {
          setOccurrence(updated);
          setSaveState(draftIsPersisted(draftRef.current, updated) ? "saved" : "idle");
          setRestored(false);
        }
        return true;
      } catch {
        if (mounted.current && activeContext.current === key) setSaveState("error");
        return false;
      }
    },
    [
      classOccurrenceService,
      teachingAssignmentId,
      occurrenceDate,
      occurrence,
      contextKey,
      setOccurrence,
      setRestored,
    ],
  );

  useEffect(() => {
    if (
      loading ||
      error ||
      busy ||
      restored ||
      saveState === "error" ||
      !occurrence ||
      !["planned", "changed"].includes(occurrence.status)
    )
      return;
    if (draftIsPersisted(draft, occurrence)) return;
    const timer = setTimeout(() => {
      void saveDraft(draft);
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, occurrence, loading, error, busy, restored, saveState, saveDraft]);

  async function navigate(action: () => void) {
    if (busy) return;
    if (
      occurrence &&
      ["planned", "changed"].includes(occurrence.status) &&
      (!draftIsPersisted(draft, occurrence) ||
        classroomWritePending(classOccurrenceService, contextKey))
    ) {
      setBusy(true);
      const saved = await saveDraft(draft);
      setBusy(false);
      if (!saved) return;
    }
    action();
  }

  const attendanceState = useMemo(() => {
    if (rosterError) return { kind: "unavailable" as const };
    if (!session) {
      return { kind: "notOpened" as const };
    }
    if (session.status === "no_class") {
      return { kind: "noClass" as const };
    }
    const marked = roster.filter((row) => row.entryStatus !== null).length;
    if (roster.length === 0) {
      return { kind: "emptyRoster" as const };
    }
    return { kind: "counted" as const, marked, total: roster.length };
  }, [session, roster, rosterError]);

  function describeOutcome(outcome: OccurrenceOutcome): {
    message: string;
    tone: "error" | "warning";
  } {
    switch (outcome.outcome) {
      case "started":
      case "updated":
      case "alreadyOpen":
        return { message: "", tone: "warning" };
      case "notYourClass":
        return { message: "This class is not yours to run.", tone: "error" };
      case "unknownAssignment":
        return { message: "This class could not be found.", tone: "error" };
      case "invalidDate":
        return { message: "The session date is not a valid calendar date.", tone: "error" };
      case "alreadyDelivered":
        return {
          message: "This class was already finished. Reopen it to make changes.",
          tone: "warning",
        };
      case "alreadyCancelled":
        return { message: "This class was already cancelled.", tone: "warning" };
      case "notStarted":
        return { message: "This class has not been started yet.", tone: "warning" };
      case "cancelledCannotFinish":
        return {
          message: "A cancelled class cannot be finished. Reopen it first.",
          tone: "warning",
        };
      case "cancelRequiresReason":
        return { message: "Give a reason for the cancellation.", tone: "warning" };
      case "attendanceNotChecked":
        return { message: "Check attendance before finishing this class.", tone: "warning" };
      default:
        return { message: "", tone: "warning" };
    }
  }

  async function handleStart() {
    setBusy(true);
    setActionError(null);
    try {
      const outcome = await classOccurrenceService.start(teachingAssignmentId, occurrenceDate);
      if (outcome.outcome === "started" || outcome.outcome === "alreadyOpen") {
        await load();
      } else {
        setActionError(describeOutcome(outcome));
      }
    } catch {
      setActionError({ message: "Could not start this class.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    setBusy(true);
    setActionError(null);
    try {
      if (!(await saveDraft(draft))) return;
      const outcome = await enqueueClassroomWrite(classOccurrenceService, contextKey, () =>
        classOccurrenceService.finish(teachingAssignmentId, occurrenceDate, summary.trim()),
      );
      if (outcome.outcome === "updated") {
        await load();
      } else {
        setActionError(describeOutcome(outcome));
      }
    } catch {
      setActionError({ message: "Could not finish this class.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    const reason = cancelReason.trim();
    if (reason.length === 0) {
      setActionError(describeOutcome({ outcome: "cancelRequiresReason" }));
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (!(await saveDraft(draft))) return;
      const outcome = await enqueueClassroomWrite(classOccurrenceService, contextKey, () =>
        classOccurrenceService.cancel(teachingAssignmentId, occurrenceDate, reason),
      );
      if (outcome.outcome === "updated") {
        setCancelReason("");
        await load();
      } else {
        setActionError(describeOutcome(outcome));
      }
    } catch {
      setActionError({ message: "Could not cancel this class.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen() {
    setBusy(true);
    setActionError(null);
    try {
      const outcome = await classOccurrenceService.reopen(teachingAssignmentId, occurrenceDate);
      if (outcome.outcome === "updated" || outcome.outcome === "alreadyOpen") {
        await load();
      } else {
        setActionError(describeOutcome(outcome));
      }
    } catch {
      setActionError({ message: "Could not reopen this class.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function refreshMarkers() {
    if (!occurrence) return;
    const key = contextKey;
    try {
      const list = await classOccurrenceService.listFollowupMarkers(occurrence.id);
      if (!mounted.current || activeContext.current !== key) return;
      setMarkers(list);
      setMarkerError(null);
    } catch {
      if (mounted.current && activeContext.current === key)
        setMarkerError(
          "The marker was saved, but the list could not refresh. Refresh it before another change.",
        );
    }
  }
  async function handleMarkFollowup(membershipId: string) {
    const reason = pendingReason.trim();
    if (!reason || !occurrence || busy) return;
    const key = contextKey;
    setBusy(true);
    setActionError(null);
    try {
      const marker = await classOccurrenceService.markFollowup(occurrence.id, membershipId, reason);
      if (!mounted.current || activeContext.current !== key) return;
      if (!marker) {
        setActionError({
          message: "That learner is not on this class's roster today.",
          tone: "warning",
        });
        return;
      }
      setMarkers((current) => [marker, ...current.filter((row) => row.id !== marker.id)]);
      setMarkingMembershipId(null);
      setPendingReason("");
      await refreshMarkers();
    } catch {
      if (mounted.current && activeContext.current === key) {
        setMarkerError("The save result is uncertain. Refresh markers before retrying.");
        setActionError({
          message:
            "Could not confirm the follow-up save. Your reason is kept; refresh markers before retrying.",
          tone: "error",
        });
      }
    } finally {
      if (mounted.current && activeContext.current === key) setBusy(false);
    }
  }
  async function handleClearFollowup(membershipId: string) {
    if (!occurrence || busy) return;
    const key = contextKey;
    setBusy(true);
    setActionError(null);
    try {
      const marker = await classOccurrenceService.clearFollowup(occurrence.id, membershipId);
      if (!mounted.current || activeContext.current !== key) return;
      if (!marker) throw new Error("Marker not acknowledged");
      setMarkers((current) => current.map((row) => (row.id === marker.id ? marker : row)));
      await refreshMarkers();
    } catch {
      if (mounted.current && activeContext.current === key) {
        setMarkerError("The clear result is uncertain. Refresh markers before retrying.");
        setActionError({
          message: "Could not confirm the marker was cleared. Refresh markers before retrying.",
          tone: "error",
        });
      }
    } finally {
      if (mounted.current && activeContext.current === key) setBusy(false);
    }
  }

  const status = occurrence?.status ?? null;
  const inFlight = status === "planned" || status === "changed";
  const scheduledLabel =
    classContext.startsAt && classContext.endsAt
      ? `${classContext.startsAt}–${classContext.endsAt}${classContext.room ? ` · ${classContext.room}` : ""}`
      : null;

  /** Prior recorded sessions. The occurrence in the headline above is
   * excluded so the same row is never described twice; the cockpit's own
   * sections are where the current session is reviewed. */
  const priorHistory = useMemo(
    () => history.filter((row) => row.id !== occurrence?.id),
    [history, occurrence],
  );

  /** Open markers keyed by membership, so a roster row reads the marker that
   * still stands. A cleared marker stays in the list below it but no longer
   * counts as outstanding. */
  const followupByMembership = useMemo(() => {
    const map = new Map<string, LearnerFollowupMarker>();
    for (const marker of markers) {
      if (marker.clearedAt === null) map.set(marker.sectionMembershipId, marker);
    }
    return map;
  }, [markers]);

  return (
    <Page
      title={`${classContext.subjectName} — ${classContext.sectionName}`}
      actions={
        <button type="button" onClick={() => void navigate(onBackToClass)} disabled={busy}>
          Back to class
        </button>
      }
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            This is the classroom cockpit for {occurrenceDate}. Start the class, capture what is
            actually happening, then finish it to confirm the session.
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
        <Loading label="Loading classroom…" />
      ) : error ? null : (
        <>
          {recoveryError && (
            <Alert tone="warning">
              <p>{recoveryError}</p>
              <button type="button" onClick={() => retryRecovery((value) => value + 1)}>
                Retry recovery
              </button>
            </Alert>
          )}
          {recoveryDraft && (
            <Alert tone="warning">
              <p>
                A device recovery draft is available from {recoveryDraft.savedAt}. Review it before
                applying; it is not a confirmed classroom record.
              </p>
              <details>
                <summary>Review recovery draft</summary>
                <dl>
                  <dt>Learning target</dt>
                  <dd>{recoveryDraft.fields.learningTarget || "Blank"}</dd>
                  <dt>Evidence</dt>
                  <dd>{recoveryDraft.fields.quickEvidence || "Blank"}</dd>
                  <dt>Notes</dt>
                  <dd>{recoveryDraft.fields.notes || "Blank"}</dd>
                  <dt>Session summary</dt>
                  <dd>{recoveryDraft.fields.finishSummary || "Blank"}</dd>
                </dl>
              </details>
              {inFlight && (
                <button type="button" onClick={restoreRecovery}>
                  Restore draft for editing
                </button>
              )}
              {discardReview ? (
                <section aria-label="Confirm draft discard">
                  <p>
                    Remove this recovery copy for {classContext.subjectName} ·{" "}
                    {classContext.sectionName} · {occurrenceDate}? The confirmed class record stays
                    unchanged.
                  </p>
                  <button type="button" onClick={() => setDiscardReview(false)}>
                    Keep recovery draft
                  </button>
                  <button type="button" onClick={() => void discardRecovery()}>
                    Confirm discard recovery draft
                  </button>
                </section>
              ) : (
                <button type="button" onClick={() => setDiscardReview(true)}>
                  Discard recovery draft
                </button>
              )}
            </Alert>
          )}
          <div className="classroom-headline">
            <div>
              <p className="folio-eyebrow">Classroom Mode</p>
              <h3>{occurrenceDate}</h3>
              {scheduledLabel && (
                <p className="field-hint" aria-label="Scheduled slot">
                  Scheduled {scheduledLabel}
                </p>
              )}
            </div>
            {status && <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>}
          </div>

          {actionError && (
            <Alert tone={actionError.tone}>
              <p>{actionError.message}</p>
              {actionError.message === "Check attendance before finishing this class." && (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void navigate(() => onCheckAttendance(teachingAssignmentId))}
                  disabled={busy}
                >
                  Check attendance
                </button>
              )}
            </Alert>
          )}

          {status === null ? (
            <section aria-labelledby="classroom-start">
              <div className="class-work-row">
                <div>
                  <h3 id="classroom-start">This class has not been started</h3>
                  <p>
                    No occurrence is recorded for today. Starting it opens the cockpit — nothing is
                    confirmed until you finish the class.
                  </p>
                </div>
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleStart}
                  disabled={busy}
                >
                  Start class
                </button>
              </div>
            </section>
          ) : status === "cancelled" ? (
            <section aria-labelledby="classroom-cancelled">
              <h3 id="classroom-cancelled">This class was cancelled</h3>
              <Alert tone="warning">
                <p>
                  <strong>Reason:</strong> {occurrence?.cancelledReason}
                </p>
              </Alert>
              <div className="class-work-row">
                <div>
                  <h4>Correct this cancellation</h4>
                  <p>
                    Reopen the class to record that it happened after all. Revision{" "}
                    {occurrence?.revision ?? 0}.
                  </p>
                </div>
                <button type="button" onClick={handleReopen} disabled={busy}>
                  Reopen class
                </button>
              </div>
            </section>
          ) : (
            <>
              <section aria-labelledby="classroom-capture">
                <h3 id="classroom-capture">What is happening in this class</h3>
                <div className="classroom-capture-grid">
                  <label className="field">
                    <span>Actual start</span>
                    <input
                      type="time"
                      value={draft.actualStartsAt}
                      onChange={(event) =>
                        setDraft({ ...draft, actualStartsAt: event.target.value })
                      }
                      disabled={busy || !inFlight}
                    />
                  </label>
                  <label className="field">
                    <span>Actual end</span>
                    <input
                      type="time"
                      value={draft.actualEndsAt}
                      onChange={(event) => setDraft({ ...draft, actualEndsAt: event.target.value })}
                      disabled={busy || !inFlight}
                    />
                  </label>
                  <label className="field">
                    <span>Actual room</span>
                    <input
                      type="text"
                      value={draft.actualRoom}
                      placeholder={classContext.room ?? "Not set"}
                      onChange={(event) => setDraft({ ...draft, actualRoom: event.target.value })}
                      disabled={busy || !inFlight}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Current learning target</span>
                  <input
                    type="text"
                    value={draft.learningTarget}
                    placeholder="What this class is working toward"
                    onChange={(event) => setDraft({ ...draft, learningTarget: event.target.value })}
                    disabled={busy || !inFlight}
                  />
                </label>
                <label className="field">
                  <span>Quick evidence</span>
                  <textarea
                    rows={2}
                    value={draft.quickEvidence}
                    placeholder="What you saw — exit slips, responses, work collected"
                    onChange={(event) => setDraft({ ...draft, quickEvidence: event.target.value })}
                    disabled={busy || !inFlight}
                  />
                </label>
                <label className="field">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={draft.notes}
                    placeholder="Anything to remember about this session"
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    disabled={busy || !inFlight}
                  />
                </label>
                <p className="field-hint classroom-save-state" role="status">
                  {saveState === "saving"
                    ? "Saving…"
                    : saveState === "saved"
                      ? "Saved on this device"
                      : saveState === "error"
                        ? "Could not save. Your text is kept for this session; retry before finishing."
                        : restored
                          ? "Recovered unsaved text. Review it and save when ready."
                          : inFlight
                            ? "Changes save as you type."
                            : ""}
                </p>
                {inFlight && (saveState === "error" || restored) && (
                  <button type="button" disabled={busy} onClick={() => void saveDraft(draft)}>
                    Retry save
                  </button>
                )}
              </section>

              {classroomDraftService && (
                <p className="field-hint" role="status">
                  {recoveryState === "saving"
                    ? "Saving encrypted recovery draft…"
                    : recoveryState === "saved"
                      ? "Recovery draft saved on this device. It can be reviewed after restart."
                      : recoveryState === "error"
                        ? "Recovery draft could not save. Keep the app open and retry."
                        : "Recovery drafts stay on this encrypted device for your account."}
                  {recoveryState === "error" && (
                    <button type="button" onClick={() => retryRecovery((value) => value + 1)}>
                      Retry recovery save
                    </button>
                  )}
                </p>
              )}
              <section aria-labelledby="classroom-attendance">
                {rosterError && (
                  <Alert tone="error">
                    <p>{rosterError}</p>
                    <button type="button" onClick={load}>
                      Retry roster
                    </button>
                  </Alert>
                )}
                <h3 id="classroom-attendance">Attendance</h3>
                <div className="class-work-row">
                  <div>
                    {attendanceState.kind === "notOpened" && (
                      <>
                        <h4>Not checked yet</h4>
                        <p>Attendance must be checked before this class can be finished.</p>
                      </>
                    )}
                    {attendanceState.kind === "noClass" && (
                      <>
                        <h4>Marked: no class</h4>
                        <p>An explicit no-class decision was recorded for today.</p>
                      </>
                    )}
                    {attendanceState.kind === "emptyRoster" && (
                      <>
                        <h4>No learners on the roster</h4>
                        <p>
                          Nobody was enrolled in this section today, so there was nobody to mark.
                        </p>
                      </>
                    )}
                    {attendanceState.kind === "counted" && (
                      <>
                        <h4>
                          {attendanceState.marked} of {attendanceState.total} marked
                        </h4>
                        <p>
                          {attendanceState.marked === attendanceState.total
                            ? "Every learner has a mark."
                            : "Some learners still need a mark."}
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void navigate(() => onCheckAttendance(teachingAssignmentId))}
                    disabled={busy}
                  >
                    {attendanceState.kind === "notOpened"
                      ? "Check attendance"
                      : "Review attendance"}
                  </button>
                </div>
              </section>

              {inFlight ? (
                <section aria-labelledby="classroom-finish">
                  <h3 id="classroom-finish">Finish this class</h3>
                  <label className="field">
                    <span>Session summary</span>
                    <textarea
                      rows={3}
                      value={summary}
                      placeholder="What was covered, and how it went"
                      onChange={(event) => setSummary(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <div className="class-work-actions">
                    <button
                      type="button"
                      className="button-primary"
                      onClick={handleFinish}
                      disabled={busy}
                    >
                      Finish class
                    </button>
                  </div>
                  <details className="folio-pending">
                    <summary>Cancel this class instead</summary>
                    <label className="field">
                      <span>Reason for cancelling</span>
                      <input
                        type="text"
                        value={cancelReason}
                        placeholder="Required — e.g. school-wide suspension"
                        onChange={(event) => {
                          setDraftEdited(true);
                          setCancelReason(event.target.value);
                        }}
                        disabled={busy}
                      />
                    </label>
                    <button type="button" onClick={handleCancel} disabled={busy}>
                      Cancel class
                    </button>
                  </details>
                </section>
              ) : (
                <section aria-labelledby="classroom-review">
                  <h3 id="classroom-review">Session summary</h3>
                  {occurrence?.summary ? (
                    <p>{occurrence.summary}</p>
                  ) : (
                    <EmptyState>No summary was recorded for this session.</EmptyState>
                  )}
                  <div className="class-work-row">
                    <div>
                      <h4>Correct this session</h4>
                      <p>
                        Reopening clears the summary and bumps the revision — currently revision{" "}
                        {occurrence?.revision ?? 0}. The attendance entries underneath are not
                        touched.
                      </p>
                    </div>
                    <button type="button" onClick={handleReopen} disabled={busy}>
                      Reopen class
                    </button>
                  </div>
                </section>
              )}

              <section aria-labelledby="classroom-followup">
                <h3 id="classroom-followup">Learner follow-up</h3>
                {markerError && (
                  <Alert tone="warning">
                    <p>{markerError}</p>
                    <button type="button" onClick={() => void refreshMarkers()}>
                      Refresh markers
                    </button>
                  </Alert>
                )}
                {rosterError ? (
                  <p>Follow-up is unavailable until the roster loads.</p>
                ) : roster.length === 0 ? (
                  <EmptyState>
                    {session
                      ? "No learners are on the roster for this class today."
                      : "Check attendance first — follow-up is marked on this class's roster."}
                  </EmptyState>
                ) : (
                  <ul className="workspace-priority-rail">
                    {roster.map((row) => {
                      const marker = followupByMembership.get(row.membershipId);
                      const isMarking = markingMembershipId === row.membershipId;
                      return (
                        <li
                          key={row.membershipId}
                          className={
                            marker
                              ? "workspace-priority-item is-partial"
                              : "workspace-priority-item is-not-started"
                          }
                        >
                          <div className="workspace-priority-main">
                            <span className="workspace-priority-section">
                              {row.givenName} {row.familyName}
                            </span>
                            <span className="field-hint">
                              {marker
                                ? marker.reason
                                : row.entryStatus === null
                                  ? "not yet marked"
                                  : `marked ${row.entryStatus.replace("_", " ")}`}
                            </span>
                            {isMarking && (
                              <label className="field classroom-marker-form">
                                <span className="field-hint">Reason</span>
                                <input
                                  type="text"
                                  value={pendingReason}
                                  placeholder="Why does this learner need follow-up?"
                                  onChange={(event) => {
                                    setDraftEdited(true);
                                    setPendingReason(event.target.value);
                                  }}
                                  disabled={busy}
                                />
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => handleMarkFollowup(row.membershipId)}
                                  disabled={
                                    busy ||
                                    Boolean(markerError) ||
                                    pendingReason.trim().length === 0
                                  }
                                >
                                  Save marker
                                </button>
                              </label>
                            )}
                          </div>
                          {marker ? (
                            <button
                              type="button"
                              onClick={() => handleClearFollowup(row.membershipId)}
                              disabled={busy || Boolean(markerError)}
                            >
                              Clear
                            </button>
                          ) : isMarking ? (
                            <button
                              type="button"
                              onClick={() => {
                                setMarkingMembershipId(null);
                                setPendingReason("");
                              }}
                              disabled={busy}
                            >
                              Done
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setMarkingMembershipId(row.membershipId);
                                setPendingReason("");
                              }}
                              disabled={busy}
                            >
                              Follow up
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}

          {priorHistory.length > 0 && (
            <section aria-labelledby="classroom-history">
              <h3 id="classroom-history">Recorded sessions for this class</h3>
              <p className="field-hint">
                Planned, changed, cancelled and delivered sessions stay distinguishable in the
                record.
              </p>
              <ul className="workspace-priority-rail">
                {priorHistory.map((row) => (
                  <li
                    key={row.id}
                    className={
                      row.status === "delivered"
                        ? "workspace-priority-item is-complete"
                        : row.status === "cancelled"
                          ? "workspace-priority-item is-not-started"
                          : "workspace-priority-item is-partial"
                    }
                  >
                    <div className="workspace-priority-main">
                      <span className="workspace-priority-section">{row.occurrenceDate}</span>
                      <span className="field-hint">
                        {row.status === "cancelled" && row.cancelledReason
                          ? row.cancelledReason
                          : row.status === "delivered" && row.summary
                            ? row.summary
                            : row.actualStartsAt
                              ? `${row.actualStartsAt}${row.actualEndsAt ? `–${row.actualEndsAt}` : ""}${row.actualRoom ? ` · ${row.actualRoom}` : ""}`
                              : "no actual slot recorded"}
                      </span>
                    </div>
                    <StatusChip tone={STATUS_TONE[row.status]}>
                      {STATUS_LABEL[row.status]}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
