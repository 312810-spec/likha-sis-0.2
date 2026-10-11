import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ClassOccurrenceApplicationService } from "../application/class-occurrence-service";
import type { LearnerSupportApplicationService } from "../application/learner-support-service";
import type { LearnerSupportCase, LearnerSupportStatus } from "../domain/learner-support";
import { useSessionDraft } from "./useSessionDraft";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { StatusChip } from "./components/StatusChip";
import type { StatusChipTone } from "./components/StatusChip";
import { useTeacherMode } from "./theme/useTeacherMode";

/** The marker a teacher chose to act on, if any. Everything here is display
 * context the screen itself cannot re-derive: the authoritative ids are the
 * `classOccurrenceId` prop and the `sectionMembershipId` this carries, and
 * the trusted boundary re-validates both on every write. */
export interface SupportTargetMarker {
  sectionMembershipId: string;
  learnerGivenName: string;
  learnerFamilyName: string;
  reason: string;
}

interface LearningSupportScreenProps {
  learnerSupportService: LearnerSupportApplicationService;
  classOccurrenceService: ClassOccurrenceApplicationService;
  classOccurrenceId: string;
  /** Display context only — the occurrence's own row is authoritative. */
  subjectName: string;
  sectionName: string;
  occurrenceDate: string;
  /** A standing follow-up marker the teacher asked to act on. Present on
   * arrival, cleared once a plan has been written for it. */
  targetMarker?: SupportTargetMarker | null;
  onBack: () => void;
}

/**
 * CTOS M08 — the middle of the required loop:
 *
 * ```text
 * Evidence → identified need → goal → intervention → participation →
 * follow-up → outcome
 * ```
 *
 * The evidence end is the class occurrence this screen is scoped to; the
 * follow-up end is the marker that sent the teacher here. This screen is
 * everything between: the plan, the participation, and the outcome, each
 * written only when a teacher presses the button that writes it.
 *
 * "AI can suggest or summarize, but official saved state remains
 * teacher-confirmed" (CTOS.md §M08): the marker's reason is offered as a
 * *draft* of the need, pre-filled into an editable field and saved only on
 * an explicit submit. Nothing here auto-advances a case.
 */
export function LearningSupportScreen({
  learnerSupportService,
  classOccurrenceService,
  classOccurrenceId,
  subjectName,
  sectionName,
  occurrenceDate,
  targetMarker = null,
  onBack,
}: LearningSupportScreenProps) {
  const { mode } = useTeacherMode();
  const [cases, setCases] = useState<LearnerSupportCase[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The marker still awaiting a plan. Cleared locally the moment a plan is
   * written, without waiting for the reload — so the form disappears even
   * if the list fetch that follows it is slow. */
  const [pendingMarker, setPendingMarker] = useState(targetMarker);
  const requestRef = useRef(0);
  const [fresh, setFresh] = useState(false);
  const [readVersion, setReadVersion] = useState(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setFresh(false);
    setError(null);
    learnerSupportService
      .listForOccurrence(classOccurrenceId)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setCases(result);
        setFresh(true);
        setReadVersion((value) => value + 1);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load the support cases for this class.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCases(null);
    setNotice(null);
    setPendingMarker(targetMarker);
    load();
    return () => {
      requestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerSupportService, classOccurrenceId]);

  return (
    <Page
      title="Learning support"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Plan what to do for a learner from this class, then keep the plan until you know what
            came of it. Nothing here is saved until you press its button.
          </p>
        ) : undefined
      }
      actions={
        <button type="button" onClick={onBack}>
          Back to Today
        </button>
      }
    >
      <p className="field-hint">
        {subjectName} — {sectionName} · {occurrenceDate}
      </p>

      {notice && (
        <Alert tone="success">
          <p>{notice}</p>
        </Alert>
      )}
      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Reload cases
          </button>
        </Alert>
      )}

      {pendingMarker && (
        <PlanForm
          key={`${classOccurrenceId}:${pendingMarker.sectionMembershipId}`}
          learnerSupportService={learnerSupportService}
          classOccurrenceService={classOccurrenceService}
          classOccurrenceId={classOccurrenceId}
          marker={pendingMarker}
          cases={cases ?? []}
          fresh={fresh && !loading}
          readVersion={readVersion}
          onReload={load}
          onPlanned={() => {
            setNotice("Support plan saved on this device and follow-up marker cleared.");
            setPendingMarker(null);
            load();
          }}
        />
      )}

      {loading && !cases ? (
        <Loading label="Loading support cases…" />
      ) : !cases ? null : cases.length === 0 ? (
        !pendingMarker ? (
          <EmptyState>
            No support plans have been opened for this class yet. Mark a learner for follow-up in
            Classroom Mode to start one.
          </EmptyState>
        ) : null
      ) : (
        <ul className="workspace-priority-rail">
          {cases.map((supportCase) => (
            <li
              key={`${classOccurrenceId}:${supportCase.id}:${supportCase.status}`}
              className={
                supportCase.status === "resolved"
                  ? "workspace-priority-item is-complete"
                  : "workspace-priority-item is-partial"
              }
            >
              <CaseRow
                learnerSupportService={learnerSupportService}
                supportCase={supportCase}
                onAdvanced={(message) => {
                  if (message) setNotice(message);
                  load();
                }}
                fresh={fresh && !loading}
                readVersion={readVersion}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

interface PlanFormProps {
  learnerSupportService: LearnerSupportApplicationService;
  classOccurrenceService: ClassOccurrenceApplicationService;
  classOccurrenceId: string;
  marker: SupportTargetMarker;
  onPlanned: () => void;
  cases: LearnerSupportCase[];
  fresh: boolean;
  readVersion: number;
  onReload: () => void;
}

/** The loop's "identified need → goal → intervention" steps, drafted from
 * the marker's reason and saved on one explicit submit. */
function PlanForm({
  learnerSupportService,
  classOccurrenceService,
  classOccurrenceId,
  marker,
  onPlanned,
  cases,
  fresh,
  readVersion,
  onReload,
}: PlanFormProps) {
  const draftKey = `support-plan:${classOccurrenceId}:${marker.sectionMembershipId}`;
  const [need, setNeed] = useSessionDraft(`${draftKey}:need`, () => marker.reason);
  const [goal, setGoal] = useSessionDraft(`${draftKey}:goal`, () => "");
  const [intervention, setIntervention] = useSessionDraft(`${draftKey}:intervention`, () => "");
  const [savedId, setSavedId] = useSessionDraft<string | null>(`${draftKey}:saved-id`, () => null);
  const [uncertainVersion, setUncertainVersion] = useState<number | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = need.trim().length > 0 && goal.trim().length > 0 && intervention.trim().length > 0;

  async function clearMarker() {
    setBusy(true);
    setError(null);
    try {
      const cleared = await classOccurrenceService.clearFollowup(
        classOccurrenceId,
        marker.sectionMembershipId,
      );
      if (!alive.current) return;
      if (!cleared || !cleared.clearedAt) throw new Error("Marker clearing not confirmed");
      setNeed(marker.reason);
      setGoal("");
      setIntervention("");
      setSavedId(null);
      onPlanned();
    } catch {
      if (!alive.current) return;
      setError(
        "The support plan is saved. The follow-up marker could not be cleared. Retry clearing the marker without creating another plan.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !fresh || !ready || (uncertainVersion !== null && readVersion <= uncertainVersion))
      return;
    if (savedId) {
      await clearMarker();
      return;
    }
    const matches = cases.filter(
      (item) =>
        item.status !== "resolved" &&
        item.sectionMembershipId === marker.sectionMembershipId &&
        item.need.trim() === need.trim() &&
        item.goal.trim() === goal.trim() &&
        item.intervention.trim() === intervention.trim(),
    );
    if (matches.length > 1) {
      setError(
        "Several matching support plans already exist. Review the cases before making another plan.",
      );
      return;
    }
    const matchingPlan = matches[0];
    if (matchingPlan && reviewId !== matchingPlan.id) {
      setReviewId(matchingPlan.id);
      setError(
        "A matching active support plan already exists. Review it below, then choose whether to use the saved plan and clear the marker.",
      );
      return;
    }
    if (matchingPlan) {
      setSavedId(matchingPlan.id);
      await clearMarker();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const opened = await learnerSupportService.openCase(
        classOccurrenceId,
        marker.sectionMembershipId,
        need.trim(),
        goal.trim(),
        intervention.trim(),
      );
      if (!alive.current) return;
      if (!opened) {
        setUncertainVersion(readVersion);
        setError(
          "Saving was not confirmed. Reload cases to check what was recorded before trying again.",
        );
        return;
      }
      setSavedId(opened.id);
      await clearMarker();
    } catch {
      if (!alive.current) return;
      setUncertainVersion(readVersion);
      setError(
        "Saving was not confirmed. A plan may already exist. Reload cases before trying again; your entries are retained.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <form className="card support-plan-form" onSubmit={handleSubmit}>
      <h3>
        Plan support for {marker.learnerGivenName} {marker.learnerFamilyName}
      </h3>
      <p className="field-hint">
        Follow-up marked: “{marker.reason}”. The reason drafts the need below — edit it or replace
        it.
      </p>
      <label className="field">
        <span>Identified need</span>
        <textarea
          value={need}
          onChange={(event) => {
            setNeed(event.target.value);
            setReviewId(null);
          }}
          disabled={busy || savedId !== null}
          rows={2}
        />
      </label>
      <label className="field">
        <span>Goal</span>
        <textarea
          value={goal}
          placeholder="What should change for this learner?"
          onChange={(event) => {
            setGoal(event.target.value);
            setReviewId(null);
          }}
          disabled={busy || savedId !== null}
          rows={2}
        />
      </label>
      <label className="field">
        <span>Intervention</span>
        <textarea
          value={intervention}
          placeholder="What will you do?"
          onChange={(event) => {
            setIntervention(event.target.value);
            setReviewId(null);
          }}
          disabled={busy || savedId !== null}
          rows={2}
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button-primary"
        disabled={
          busy || !ready || !fresh || (uncertainVersion !== null && readVersion <= uncertainVersion)
        }
      >
        {savedId
          ? "Retry clearing marker"
          : reviewId
            ? "Use saved plan and clear marker"
            : "Save plan and clear the marker"}
      </button>
      {uncertainVersion !== null && (
        <button type="button" onClick={onReload} disabled={busy}>
          Reload cases
        </button>
      )}
      {savedId && <p role="status">Support plan saved on this device.</p>}
    </form>
  );
}

interface CaseRowProps {
  learnerSupportService: LearnerSupportApplicationService;
  supportCase: LearnerSupportCase;
  onAdvanced: (message?: string) => void;
  fresh: boolean;
  readVersion: number;
}

/** One case, showing where it sits on the loop's spine and the one action
 * its status permits next. */
function CaseRow({
  learnerSupportService,
  supportCase,
  onAdvanced,
  fresh,
  readVersion,
}: CaseRowProps) {
  const [draft, setDraft] = useSessionDraft(
    `support-case:${supportCase.classOccurrenceId}:${supportCase.id}:${supportCase.status}`,
    () => "",
  );
  const [uncertainVersion, setUncertainVersion] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(field: "participation" | "outcome") {
    if (
      busy ||
      !fresh ||
      !draft.trim() ||
      (uncertainVersion !== null && readVersion <= uncertainVersion)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const updated =
        field === "participation"
          ? await learnerSupportService.recordParticipation(supportCase.id, draft.trim())
          : await learnerSupportService.resolve(supportCase.id, draft.trim());
      if (!alive.current) return;
      if (!updated) {
        setUncertainVersion(readVersion);
        setError(
          "This step was not confirmed. Reload cases to see the current status before another change.",
        );
        return;
      }
      setDraft("");
      onAdvanced(
        field === "participation"
          ? "Participation saved on this device."
          : "Outcome saved on this device; support plan resolved.",
      );
    } catch {
      if (!alive.current) return;
      setUncertainVersion(readVersion);
      setError(
        "Saving was not confirmed. This step may already be recorded. Reload cases before trying again; your entry is retained.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="workspace-priority-main">
      <span className="workspace-priority-section">
        {supportCase.learnerGivenName} {supportCase.learnerFamilyName}
      </span>
      <span className="support-plan-field">
        <span className="support-plan-label">Need</span>
        {supportCase.need}
      </span>
      <span className="support-plan-field">
        <span className="support-plan-label">Goal</span>
        {supportCase.goal}
      </span>
      <span className="support-plan-field">
        <span className="support-plan-label">Intervention</span>
        {supportCase.intervention}
      </span>
      {supportCase.participation && (
        <span className="support-plan-field">
          <span className="support-plan-label">Participation</span>
          {supportCase.participation}
        </span>
      )}
      {supportCase.outcome && (
        <span className="support-plan-field">
          <span className="support-plan-label">Outcome</span>
          {supportCase.outcome}
        </span>
      )}
      <span className="support-plan-status">
        <StatusChip tone={toneFor(supportCase.status)}>{labelFor(supportCase.status)}</StatusChip>
      </span>
      {supportCase.status === "open" && (
        <div className="support-step-form">
          <label className="field">
            <span className="field-hint">What did the learner do during the intervention?</span>
            <textarea
              value={draft}
              placeholder="Record participation to start this plan"
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              rows={2}
            />
          </label>
          <button
            type="button"
            className="button-primary"
            disabled={
              busy ||
              !fresh ||
              draft.trim().length === 0 ||
              (uncertainVersion !== null && readVersion <= uncertainVersion)
            }
            onClick={() => submit("participation")}
          >
            Record participation
          </button>
        </div>
      )}
      {supportCase.status === "in_progress" && (
        <div className="support-step-form">
          <label className="field">
            <span className="field-hint">What came of it?</span>
            <textarea
              value={draft}
              placeholder="Record the outcome to close this plan"
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              rows={2}
            />
          </label>
          <button
            type="button"
            className="button-primary"
            disabled={
              busy ||
              !fresh ||
              draft.trim().length === 0 ||
              (uncertainVersion !== null && readVersion <= uncertainVersion)
            }
            onClick={() => submit("outcome")}
          >
            Record outcome
          </button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {uncertainVersion !== null && (
        <button type="button" onClick={() => onAdvanced()} disabled={busy}>
          Reload cases
        </button>
      )}
    </div>
  );
}

function toneFor(status: LearnerSupportStatus): StatusChipTone {
  if (status === "open") return "warning";
  if (status === "in_progress") return "productive";
  return "success";
}

function labelFor(status: LearnerSupportStatus): string {
  if (status === "open") return "Plan open";
  if (status === "in_progress") return "In progress";
  return "Resolved";
}
