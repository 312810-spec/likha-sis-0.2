import { useEffect, useRef, useState } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type { ReportCardReadiness } from "../domain/report-readiness";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Props {
  service: ExportApplicationService;
  classRecordId: string;
  revision: unknown;
  disabled: boolean;
  pendingEdits?: boolean;
}
interface Result {
  service: ExportApplicationService;
  classRecordId: string;
  revision: unknown;
  kind: "loading" | "error" | "missing" | "preview";
  preview?: ReportCardReadiness;
}

/** On-demand full-period read model. Never exports, reviews, approves or issues. */
export function ReportCardReadinessPanel({
  service,
  classRecordId,
  revision,
  disabled,
  pendingEdits = false,
}: Props) {
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
  }, [service, classRecordId, revision, disabled]);
  const current =
    !disabled &&
    result?.service === service &&
    result.classRecordId === classRecordId &&
    result.revision === revision
      ? result
      : null;
  async function check() {
    if (disabled || pending.current) return;
    pending.current = true;
    const id = ++request.current;
    const source = { service, classRecordId, revision };
    setResult({ ...source, kind: "loading" });
    try {
      const preview = await service.previewReportCard(classRecordId);
      if (!alive.current || request.current !== id) return;
      if (preview && preview.classRecordId !== classRecordId) {
        setResult({ ...source, kind: "error" });
      } else {
        setResult(
          preview ? { ...source, kind: "preview", preview } : { ...source, kind: "missing" },
        );
      }
    } catch {
      if (alive.current && request.current === id) setResult({ ...source, kind: "error" });
    } finally {
      if (request.current === id) pending.current = false;
    }
  }
  const preview = current?.preview;
  return (
    <section aria-label="Reporting preparation preview">
      <h3>Reporting preparation preview</h3>
      <p className="muted">
        Read-only check for the full grading-period roster. It does not export a file, approve
        grades or issue an official form. Refresh after external roster or record changes.
      </p>
      <p className="field-hint">
        Based on saved records on this device. Unsaved input is excluded.
      </p>
      {pendingEdits && (
        <p className="score-draft-note" role="status">
          This item has pending edits. Save or cancel them, then run the check again to review the
          saved result.
        </p>
      )}
      {mode === "guided" && (
        <p className="field-hint">
          This may include learners who left during the period. A complete computed grade is not
          evidence that policy applicability, templates or professional approval are verified.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || current?.kind === "loading"}
        onClick={() => void check()}
      >
        {current?.kind === "loading" ? "Checking reporting…" : "Check reporting preparation"}
      </button>
      {current?.kind === "loading" && <Loading label="Loading reporting preview…" />}
      {current?.kind === "error" && (
        <Alert tone="error">
          Reporting preview could not be loaded. No records changed. Try the check again.
        </Alert>
      )}
      {current?.kind === "missing" && (
        <Alert tone="warning">
          No reporting preview is available for this class record. No records changed.
        </Alert>
      )}
      {preview && (
        <>
          <p>
            {preview.schoolYear} · {preview.sectionName} · {preview.subjectName} ·{" "}
            {preview.gradingPeriodLabel}
          </p>
          <p className="muted">
            Period: {preview.startsOn} through {preview.endsOn}. Checked: {preview.checkedAt}.
            Official fidelity is not verified.
          </p>
          <p role="status">
            {preview.learnerCount} period learners: {preview.completeGradeCount} complete computed
            grades, {preview.provisionalGradeCount} provisional, {preview.missingGradeCount}{" "}
            unavailable. {preview.missingLrnCount} missing LRNs.
          </p>
          {preview.learnerCount === 0 && (
            <p>No period learners found. This is not reporting approval.</p>
          )}
          {preview.learners.length > 0 && (
            <table className="attendance-roster">
              <caption>Full-period reporting checks</caption>
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Grade evidence</th>
                  <th scope="col">LRN</th>
                </tr>
              </thead>
              <tbody>
                {preview.learners.map((row) => (
                  <tr key={row.learnerId}>
                    <th scope="row">
                      {row.givenName} {row.familyName}
                    </th>
                    <td>
                      {row.issue ??
                        (row.grade?.complete
                          ? "Complete computed grade; not professional approval."
                          : "Grade evidence unavailable; refresh this check.")}
                    </td>
                    <td>{row.lrnMissing ? "Missing" : "Recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <details>
            <summary>Export fields still omitted</summary>
            <ul>
              {preview.disclosure.omittedFields.map((field) => (
                <li key={field.field}>
                  <strong>{field.field}</strong> — {field.reason}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
