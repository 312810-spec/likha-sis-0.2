import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ClassOccurrenceApplicationService } from "../application/class-occurrence-service";
import type { LearnerSupportApplicationService } from "../application/learner-support-service";
import type { LearnerSupportCase, LearnerSupportStatus } from "../domain/learner-support";
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
  /** The marker still awaiting a plan. Cleared locally the moment a plan is
   * written, without waiting for the reload — so the form disappears even
   * if the list fetch that follows it is slow. */
  const [pendingMarker, setPendingMarker] = useState(targetMarker);
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    learnerSupportService
      .listForOccurrence(classOccurrenceId)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setCases(result);
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
    load();
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
          Back to My Day
        </button>
      }
    >
      <p className="field-hint">
        {subjectName} — {sectionName} · {occurrenceDate}
      </p>

      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}

      {pendingMarker && (
        <PlanForm
          key={pendingMarker.sectionMembershipId}
          learnerSupportService={learnerSupportService}
          classOccurrenceService={classOccurrenceService}
          classOccurrenceId={classOccurrenceId}
          marker={pendingMarker}
          onPlanned={() => {
            setPendingMarker(null);
            load();
          }}
        />
      )}

      {loading ? (
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
              key={supportCase.id}
              className={
                supportCase.status === "resolved"
                  ? "workspace-priority-item is-complete"
                  : "workspace-priority-item is-partial"
              }
            >
              <CaseRow
                learnerSupportService={learnerSupportService}
                supportCase={supportCase}
                onAdvanced={load}
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
}

/** The loop's "identified need → goal → intervention" steps, drafted from
 * the marker's reason and saved on one explicit submit. */
function PlanForm({
  learnerSupportService,
  classOccurrenceService,
  classOccurrenceId,
  marker,
  onPlanned,
}: PlanFormProps) {
  const [need, setNeed] = useState(marker.reason);
  const [goal, setGoal] = useState("");
  const [intervention, setIntervention] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = need.trim().length > 0 && goal.trim().length > 0 && intervention.trim().length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
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
      if (!opened) {
        setError(
          "Could not open this plan — the class may have changed, or this learner may no longer be on the roster.",
        );
        return;
      }
      // The plan is saved before the marker is cleared, in that order, so a
      // failed clear can never lose the plan it was raised for. The marker
      // is cleared rather than deleted, so the day's history keeps it.
      await classOccurrenceService.clearFollowup(classOccurrenceId, marker.sectionMembershipId);
      onPlanned();
    } catch {
      setError("Could not save this plan. Nothing was recorded — try again.");
    } finally {
      setBusy(false);
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
          onChange={(event) => setNeed(event.target.value)}
          disabled={busy}
          rows={2}
        />
      </label>
      <label className="field">
        <span>Goal</span>
        <textarea
          value={goal}
          placeholder="What should change for this learner?"
          onChange={(event) => setGoal(event.target.value)}
          disabled={busy}
          rows={2}
        />
      </label>
      <label className="field">
        <span>Intervention</span>
        <textarea
          value={intervention}
          placeholder="What will you do?"
          onChange={(event) => setIntervention(event.target.value)}
          disabled={busy}
          rows={2}
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={busy || !ready}>
        Save plan and clear the marker
      </button>
    </form>
  );
}

interface CaseRowProps {
  learnerSupportService: LearnerSupportApplicationService;
  supportCase: LearnerSupportCase;
  onAdvanced: () => void;
}

/** One case, showing where it sits on the loop's spine and the one action
 * its status permits next. */
function CaseRow({ learnerSupportService, supportCase, onAdvanced }: CaseRowProps) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(field: "participation" | "outcome") {
    setBusy(true);
    setError(null);
    try {
      const updated =
        field === "participation"
          ? await learnerSupportService.recordParticipation(supportCase.id, draft.trim())
          : await learnerSupportService.resolve(supportCase.id, draft.trim());
      if (!updated) {
        setError("This plan is no longer at that step — reload the list to see where it is.");
        return;
      }
      setDraft("");
      onAdvanced();
    } catch {
      setError("Could not save that. Nothing was recorded — try again.");
    } finally {
      setBusy(false);
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
        <label className="field support-step-form">
          <span className="field-hint">What did the learner do during the intervention?</span>
          <textarea
            value={draft}
            placeholder="Record participation to start this plan"
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            rows={2}
          />
          <button
            type="button"
            className="button-primary"
            disabled={busy || draft.trim().length === 0}
            onClick={() => submit("participation")}
          >
            Record participation
          </button>
        </label>
      )}
      {supportCase.status === "in_progress" && (
        <label className="field support-step-form">
          <span className="field-hint">What came of it?</span>
          <textarea
            value={draft}
            placeholder="Record the outcome to close this plan"
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            rows={2}
          />
          <button
            type="button"
            className="button-primary"
            disabled={busy || draft.trim().length === 0}
            onClick={() => submit("outcome")}
          >
            Record outcome
          </button>
        </label>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
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
