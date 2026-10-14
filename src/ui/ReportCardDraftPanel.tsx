import { useEffect, useId, useRef, useState } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type { ReportCardDraft } from "../domain/report-readiness";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Props {
  service: ExportApplicationService;
  classRecordId: string;
  revision: unknown;
  disabled: boolean;
}
interface State {
  source: Props;
  kind: "capturing" | "loading" | "captured" | "history" | "error" | "missing";
  drafts: ReportCardDraft[];
  captureAttempt: boolean;
}

/** Explicit native capture and retained reads; no approval, export or issuance. */
export function ReportCardDraftPanel(props: Props) {
  const { service, classRecordId, revision, disabled } = props;
  const { mode } = useTeacherMode();
  const hintId = useId();
  const [confirmation, setConfirmation] = useState<Props | null>(null);
  const [state, setState] = useState<State | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    return () => {
      alive.current = false;
      pending.current = false;
      generation.current += 1;
    };
  }, [service, classRecordId, revision, disabled]);
  function matches(source: Props | null) {
    return (
      !disabled &&
      source?.service === service &&
      source.classRecordId === classRecordId &&
      source.revision === revision &&
      source.disabled === disabled
    );
  }
  const current = state && matches(state.source) ? state : null;
  const confirmed = matches(confirmation);
  const busy = current?.kind === "capturing" || current?.kind === "loading";
  async function run(capture: boolean) {
    if (disabled || pending.current || (capture && !confirmed)) return;
    pending.current = true;
    const request = ++generation.current;
    setConfirmation(null);
    setState({
      source: props,
      kind: capture ? "capturing" : "loading",
      drafts: [],
      captureAttempt: capture,
    });
    try {
      const drafts = capture
        ? await service
            .captureReportCardDraft(classRecordId)
            .then((draft) => (draft ? [draft] : []))
        : await service.listRecentReportCardDrafts(classRecordId);
      if (!alive.current || generation.current !== request) return;
      if (
        drafts.some(
          (draft) =>
            draft.classRecordId !== classRecordId ||
            draft.snapshot.classRecordId !== classRecordId ||
            draft.stage !== "draft" ||
            draft.snapshot.officialFidelity !== "not_verified",
        )
      )
        throw new Error("Unexpected draft context.");
      setState({
        source: props,
        kind: capture ? (drafts.length ? "captured" : "missing") : "history",
        drafts,
        captureAttempt: capture,
      });
    } catch {
      if (alive.current && generation.current === request)
        setState({ source: props, kind: "error", drafts: [], captureAttempt: capture });
    } finally {
      if (generation.current === request) pending.current = false;
    }
  }
  return (
    <section className="report-draft-evidence" aria-label="Retained reporting drafts">
      <h3>Retained reporting drafts</h3>
      <p id={hintId} className="muted">
        Capture current device data as an immutable preparation draft. It may differ from an earlier
        preview. Each capture creates a separate draft; it does not approve, issue, export or send a
        form.
      </p>
      {mode === "guided" && (
        <p className="field-hint">
          Use recent history to inspect the saved snapshot, not today's recomputed grades. After a
          failed or interrupted capture, inspect history before attempting another capture.
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled || busy}
          aria-describedby={hintId}
          onChange={(event) => setConfirmation(event.target.checked ? props : null)}
        />
        I understand this retains current data as a draft only.
      </label>
      <button
        type="button"
        disabled={disabled || busy || !confirmed}
        onClick={() => void run(true)}
      >
        Capture preparation draft
      </button>
      <button type="button" disabled={disabled || busy} onClick={() => void run(false)}>
        Load recent drafts
      </button>
      {busy && (
        <Loading
          label={
            current?.kind === "capturing" ? "Saving preparation draft…" : "Loading recent drafts…"
          }
        />
      )}
      {current?.kind === "error" && (
        <Alert tone="error">
          {current.captureAttempt
            ? "Capture could not be confirmed. A draft may have been saved; load recent drafts before attempting another capture."
            : "Recent drafts could not be loaded. Try loading again."}
        </Alert>
      )}
      {current?.kind === "missing" && (
        <Alert tone="warning">
          No draft was returned for this class record. Load recent drafts to check retained
          evidence.
        </Alert>
      )}
      {current?.kind === "captured" && (
        <p role="status">Preparation draft retained on this device. Not reviewed or issued.</p>
      )}
      {current?.kind === "history" && (
        <p role="status">
          Showing {current.drafts.length} recent drafts, newest first, at most 50. This is not
          complete history or approval.
        </p>
      )}
      {current?.drafts.map((draft) => (
        <details key={draft.id}>
          <summary>
            Draft · {draft.createdAt} · {draft.id}
          </summary>
          <p>
            {draft.snapshot.schoolYear} · {draft.snapshot.sectionName} ·{" "}
            {draft.snapshot.subjectName} · {draft.snapshot.gradingPeriodLabel}
          </p>
          <p>
            Period: {draft.snapshot.startsOn} through {draft.snapshot.endsOn}. Original check:{" "}
            {draft.snapshot.checkedAt}.
          </p>
          <p>
            Saved by account {draft.createdByUserId}. Stage: draft. Official fidelity is not
            verified.
          </p>
          <p className="muted">
            Native-verified stored SHA-256: <code>{draft.snapshotSha256}</code>. Draft identity:{" "}
            {draft.id}. Historical evidence; current records may differ.
          </p>
          <p>
            {draft.snapshot.learnerCount} period learners: {draft.snapshot.completeGradeCount}{" "}
            complete computed grades, {draft.snapshot.provisionalGradeCount} provisional,{" "}
            {draft.snapshot.missingGradeCount} unavailable. {draft.snapshot.missingLrnCount} missing
            LRNs.
          </p>
          {draft.snapshot.learners.length > 0 && (
            <table className="attendance-roster">
              <caption>Retained draft learner evidence</caption>
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Saved grade</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">LRN</th>
                </tr>
              </thead>
              <tbody>
                {draft.snapshot.learners.map((row) => (
                  <tr key={row.learnerId}>
                    <th scope="row">
                      {row.givenName} {row.familyName}
                    </th>
                    <td>Saved grade: {row.grade?.termGrade ?? "Unavailable"}</td>
                    <td>
                      {row.issue ??
                        (row.grade?.complete
                          ? "Complete computed grade; not professional approval."
                          : "Grade evidence unavailable.")}
                    </td>
                    <td>LRN: {row.lrnMissing ? "Missing" : "Recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h4>Retained export omissions</h4>
          <ul>
            {draft.snapshot.disclosure.omittedFields.map((field) => (
              <li key={field.field}>
                {field.field} — {field.reason}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
