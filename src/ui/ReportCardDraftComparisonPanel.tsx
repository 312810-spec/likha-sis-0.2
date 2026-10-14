import { useEffect, useRef, useState } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type {
  ReportCardDraft,
  ReportCardDraftComparison,
  ReportCardReadiness,
} from "../domain/report-readiness";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Props {
  service: ExportApplicationService;
  draft: ReportCardDraft;
  revision: unknown;
  disabled: boolean;
}
interface Result {
  source: Props;
  kind: "loading" | "missing" | "error" | "comparison";
  comparison?: ReportCardDraftComparison;
}
const FIELD_LABELS: Record<string, string> = {
  classRecordId: "Class record",
  schoolYear: "School year",
  sectionName: "Section",
  subjectName: "Subject",
  gradingPeriodLabel: "Grading period",
  startsOn: "Period start",
  endsOn: "Period end",
  weightPolicyId: "Weight policy identity",
  learnerCount: "Period learner count",
  completeGradeCount: "Complete computed grades",
  provisionalGradeCount: "Provisional grades",
  missingGradeCount: "Unavailable grades",
  missingLrnCount: "Missing LRN count",
  learners: "Learner identities and grade/LRN evidence",
  disclosure: "Export disclosures",
  officialFidelity: "Official-fidelity status",
};
const CONTEXT_FIELDS = [
  "schoolYear",
  "sectionName",
  "subjectName",
  "gradingPeriodLabel",
  "startsOn",
  "endsOn",
  "weightPolicyId",
  "learnerCount",
  "completeGradeCount",
  "provisionalGradeCount",
  "missingGradeCount",
  "missingLrnCount",
] as const;
function value(snapshot: ReportCardReadiness, field: (typeof CONTEXT_FIELDS)[number]) {
  return String(snapshot[field]);
}

/** An on-demand read only; a matching projection is never issuance clearance. */
export function ReportCardDraftComparisonPanel(props: Props) {
  const { service, draft, revision, disabled } = props;
  const { mode } = useTeacherMode();
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef(0);
  const pending = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    return () => {
      alive.current = false;
      pending.current = false;
      request.current += 1;
    };
  }, [service, draft, revision, disabled]);
  const current =
    !disabled &&
    result?.source.service === service &&
    result.source.draft === draft &&
    result.source.revision === revision &&
    result.source.disabled === disabled
      ? result
      : null;
  async function compare() {
    if (disabled || pending.current) return;
    pending.current = true;
    const id = ++request.current;
    setResult({ source: props, kind: "loading" });
    try {
      const comparison = await service.compareReportCardDraft(draft.classRecordId, draft.id);
      if (!alive.current || request.current !== id) return;
      if (
        comparison &&
        (comparison.draftId !== draft.id ||
          comparison.classRecordId !== draft.classRecordId ||
          comparison.current.classRecordId !== draft.classRecordId ||
          comparison.storedSnapshotSha256 !== draft.snapshotSha256 ||
          comparison.current.officialFidelity !== "not_verified" ||
          comparison.comparisonScope !== "reporting_projection_only_not_source_lock_or_approval" ||
          comparison.projectionMatches !== (comparison.changedFields.length === 0))
      )
        throw new Error("Unexpected comparison identity or scope.");
      setResult(
        comparison
          ? { source: props, kind: "comparison", comparison }
          : { source: props, kind: "missing" },
      );
    } catch {
      if (alive.current && request.current === id) setResult({ source: props, kind: "error" });
    } finally {
      if (request.current === id) pending.current = false;
    }
  }
  const comparison = current?.comparison;
  return (
    <section className="report-draft-evidence" aria-label={`Comparison for draft ${draft.id}`}>
      <h4>Compare retained draft with current reporting</h4>
      <p className="muted">
        Read-only projection check, not a raw-source lock, professional review or approval. Refresh
        after external record changes. The retained draft will not change.
      </p>
      {mode === "guided" && (
        <p className="field-hint">
          Raw scores, policy contents or LRN digits can change without changing this projection.
          Matching evidence does not mean a form is ready to issue.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || current?.kind === "loading"}
        onClick={() => void compare()}
      >
        Compare with current reporting
      </button>
      {current?.kind === "loading" && <Loading label="Comparing reporting evidence…" />}
      {current?.kind === "error" && (
        <Alert tone="error">
          Comparison could not be loaded or its identity could not be verified. The retained draft
          was not changed. Try the comparison again.
        </Alert>
      )}
      {current?.kind === "missing" && (
        <Alert tone="warning">
          No comparison is available for this draft and class record. Reload recent drafts before
          trying again.
        </Alert>
      )}
      {comparison && (
        <>
          <p role="status">
            {comparison.projectionMatches
              ? "Current projected evidence matches the retained draft, excluding check time. This is not approval or issuance clearance."
              : "Current projected evidence differs from the retained draft. The original draft remains unchanged."}
          </p>
          <p>Compared at: {comparison.current.checkedAt}. Official fidelity is not verified.</p>
          {!comparison.projectionMatches && (
            <ul aria-label="Changed projection fields">
              {comparison.changedFields.map((field) => (
                <li key={field}>
                  {Object.hasOwn(FIELD_LABELS, field)
                    ? FIELD_LABELS[field]
                    : `Other projection field: ${field}`}
                </li>
              ))}
            </ul>
          )}
          <table className="attendance-roster">
            <caption>Retained and current reporting context</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Retained draft</th>
                <th scope="col">Current projection</th>
              </tr>
            </thead>
            <tbody>
              {CONTEXT_FIELDS.map((field) => (
                <tr key={field}>
                  <th scope="row">{FIELD_LABELS[field]}</th>
                  <td>Retained: {value(draft.snapshot, field)}</td>
                  <td>Current: {value(comparison.current, field)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Current learner evidence and export omissions</summary>
            {comparison.current.learners.length === 0 ? (
              <p>No current period learners. This is not reporting approval.</p>
            ) : (
              <table className="attendance-roster">
                <caption>Current projected learner evidence</caption>
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">LRN</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.current.learners.map((row) => (
                    <tr key={row.learnerId}>
                      <th scope="row">
                        {row.givenName} {row.familyName}
                      </th>
                      <td>Current grade: {row.grade?.termGrade ?? "Unavailable"}</td>
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
            <h5>Current export omissions</h5>
            <ul>
              {comparison.current.disclosure.omittedFields.map((field) => (
                <li key={field.field}>
                  {field.field} — {field.reason}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
