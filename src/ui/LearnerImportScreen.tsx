import { useRef, useState, type ChangeEvent } from "react";
import type { LearnerImportApplicationService } from "../application/learner-import-service";
import { ValidationError } from "../domain/errors";
import {
  LEARNER_IMPORT_CSV_HEADER,
  type LearnerImportAction,
  type LearnerImportBatchResult,
  type LearnerImportDecision,
  type LearnerImportLogEntry,
  type LearnerImportPreviewRow,
} from "../domain/learner-import";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LearnerImportScreenProps {
  learnerImportService: LearnerImportApplicationService;
}

type DecisionsByRow = Map<number, LearnerImportDecision>;

/** Rows with their own parse error can never be imported as-is — the
 * teacher fixes the source file and re-uploads. They are shown for
 * visibility but excluded from every decision sent to `commitImport`. */
function isActionable(row: LearnerImportPreviewRow): boolean {
  return row.error === null;
}

export function LearnerImportScreen({ learnerImportService }: LearnerImportScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<LearnerImportPreviewRow[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionsByRow>(new Map());
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<LearnerImportBatchResult | null>(null);
  const [logEntries, setLogEntries] = useState<LearnerImportLogEntry[] | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setResult(null);
    setLogEntries(null);
    setPreviewRows(null);
    setPreviewing(true);
    try {
      const csvText = await file.text();
      const rows = await learnerImportService.previewImport(csvText);
      setPreviewRows(rows);
      const initial: DecisionsByRow = new Map();
      for (const row of rows) {
        if (isActionable(row)) {
          initial.set(row.rowNumber, learnerImportService.defaultDecisionFor(row));
        }
      }
      setDecisions(initial);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not read this CSV file.");
    } finally {
      setPreviewing(false);
    }
  }

  function updateDecision(rowNumber: number, patch: Partial<LearnerImportDecision>) {
    setDecisions((current) => {
      const next = new Map(current);
      const existing = next.get(rowNumber);
      if (existing) next.set(rowNumber, { ...existing, ...patch });
      return next;
    });
  }

  function handleActionChange(row: LearnerImportPreviewRow, action: LearnerImportAction) {
    if (action === "create") {
      // "Confirmed different" — even though a duplicate was flagged,
      // this becomes a brand-new learner, never linked to the flagged one.
      updateDecision(row.rowNumber, {
        action,
        existingLearnerId: null,
        finalGivenName: row.givenName,
        finalFamilyName: row.familyName,
        finalLrn: row.lrn,
        finalSex: row.sex,
      });
    } else if (action === "update") {
      updateDecision(row.rowNumber, {
        action,
        existingLearnerId: row.potentialDuplicate?.id ?? null,
        finalGivenName: row.givenName,
        finalFamilyName: row.familyName,
        finalLrn: row.lrn,
        finalSex: row.sex,
      });
    } else {
      updateDecision(row.rowNumber, {
        action,
        existingLearnerId: row.potentialDuplicate?.id ?? null,
      });
    }
  }

  async function handleCommit() {
    if (!previewRows) return;
    setError(null);
    setResult(null);
    setLogEntries(null);
    setCommitting(true);
    try {
      const toCommit = previewRows.filter(isActionable).map((row) => decisions.get(row.rowNumber));
      const batchDecisions = toCommit.filter((d): d is LearnerImportDecision => d !== undefined);
      const batchResult = await learnerImportService.commitImport(batchDecisions);
      setResult(batchResult);
      setPreviewRows(null);
      setDecisions(new Map());
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not commit this import.");
    } finally {
      setCommitting(false);
    }
  }

  async function handleViewLog() {
    if (!result) return;
    setError(null);
    setLoadingLog(true);
    try {
      const entries = await learnerImportService.getImportLog(result.batchId);
      setLogEntries(entries);
    } catch {
      setError("Could not load the import log.");
    } finally {
      setLoadingLog(false);
    }
  }

  const actionableCount = previewRows?.filter(isActionable).length ?? 0;
  const errorCount = (previewRows?.length ?? 0) - actionableCount;

  return (
    <section aria-label="Bulk learner import">
      <h2 ref={headingRef} tabIndex={-1}>
        Bulk Learner Import
      </h2>

      {mode === "guided" && (
        <p className="field-hint">
          Upload a CSV file with the header <code>{LEARNER_IMPORT_CSV_HEADER.join(",")}</code> (LRN
          and sex are optional). Every row is shown for your review before anything is saved — LIKHA
          never merges records automatically. If a row looks like it might already be enrolled,
          choose whether to update that learner, keep the existing record as-is, or enroll this row
          as a different, new learner.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {result && (
        <Alert tone="success">
          <p>
            Import complete: {result.createdCount} created, {result.updatedCount} updated,{" "}
            {result.skippedCount} skipped.
          </p>
          <button type="button" onClick={handleViewLog} disabled={loadingLog}>
            {loadingLog ? "Loading…" : "View import log"}
          </button>
        </Alert>
      )}

      {logEntries && (
        <div className="table-wrap">
          <table aria-label="Import log">
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Decision</th>
                <th scope="col">Imported name</th>
                <th scope="col">Imported LRN</th>
              </tr>
            </thead>
            <tbody>
              {logEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.rowNumber}</td>
                  <td>{entry.decision}</td>
                  <td>
                    {entry.importedGivenName} {entry.importedFamilyName}
                  </td>
                  <td>{entry.importedLrn ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="field">
        <label htmlFor="learner-import-file">CSV file</label>
        <input
          id="learner-import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={previewing || committing}
        />
      </div>

      {previewing && <Loading label="Reading file…" />}

      {previewRows && previewRows.length === 0 && <p>This file has no data rows.</p>}

      {previewRows && previewRows.length > 0 && (
        <>
          <p>
            {actionableCount} row{actionableCount === 1 ? "" : "s"} ready to review
            {errorCount > 0
              ? `, ${errorCount} row${errorCount === 1 ? "" : "s"} could not be read (fix the file and re-upload)`
              : ""}
            .
          </p>
          <div className="table-wrap">
            <table aria-label="Import preview">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Given name</th>
                  <th scope="col">Family name</th>
                  <th scope="col">LRN</th>
                  <th scope="col">Sex</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  if (!isActionable(row)) {
                    return (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td colSpan={4}>
                          <Alert tone="error">{row.error}</Alert>
                        </td>
                        <td>Not imported</td>
                      </tr>
                    );
                  }
                  const decision = decisions.get(row.rowNumber);
                  const hasDuplicate = row.potentialDuplicate !== null;
                  return (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>
                        <input
                          type="text"
                          aria-label={`Row ${row.rowNumber} given name`}
                          value={decision?.finalGivenName ?? row.givenName}
                          disabled={decision?.action === "skip"}
                          onChange={(event) =>
                            updateDecision(row.rowNumber, { finalGivenName: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          aria-label={`Row ${row.rowNumber} family name`}
                          value={decision?.finalFamilyName ?? row.familyName}
                          disabled={decision?.action === "skip"}
                          onChange={(event) =>
                            updateDecision(row.rowNumber, { finalFamilyName: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Row ${row.rowNumber} LRN`}
                          value={decision?.finalLrn ?? row.lrn ?? ""}
                          disabled={decision?.action === "skip"}
                          onChange={(event) =>
                            updateDecision(row.rowNumber, {
                              finalLrn:
                                event.target.value.trim() === "" ? null : event.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Row ${row.rowNumber} sex`}
                          value={decision?.finalSex ?? row.sex ?? ""}
                          disabled={decision?.action === "skip"}
                          onChange={(event) =>
                            updateDecision(row.rowNumber, {
                              finalSex: event.target.value === "" ? null : event.target.value,
                            })
                          }
                        >
                          <option value="">Not specified</option>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                        </select>
                      </td>
                      <td>
                        {hasDuplicate ? (
                          <div className="field">
                            <label htmlFor={`row-action-${row.rowNumber}`}>
                              Possible match: {row.potentialDuplicate?.givenName}{" "}
                              {row.potentialDuplicate?.familyName}
                              {row.potentialDuplicate?.lrn
                                ? ` (LRN ${row.potentialDuplicate.lrn})`
                                : ""}
                            </label>
                            <select
                              id={`row-action-${row.rowNumber}`}
                              value={decision?.action ?? "skip"}
                              onChange={(event) =>
                                handleActionChange(row, event.target.value as LearnerImportAction)
                              }
                            >
                              <option value="skip">Keep existing record (do nothing)</option>
                              <option value="update">Update the existing record</option>
                              <option value="create">
                                This is a different learner — enroll new
                              </option>
                            </select>
                          </div>
                        ) : (
                          "New learner"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="button-primary"
            onClick={handleCommit}
            disabled={committing || actionableCount === 0}
          >
            {committing
              ? "Importing…"
              : `Import ${actionableCount} row${actionableCount === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </section>
  );
}
