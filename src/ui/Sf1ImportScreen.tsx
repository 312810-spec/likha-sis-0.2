import { useEffect, useRef, useState } from "react";
import type { SectionApplicationService } from "../application/section-service";
import type { Sf1ImportApplicationService } from "../application/sf1-import-service";
import { ValidationError } from "../domain/errors";
import type { Section } from "../domain/section";
import type { DuplicateDecision, Sf1ImportPreview, Sf1ImportSummary } from "../domain/sf1-import";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { PageHeader } from "./components/PageHeader";
import { Sf1DuplicateReview } from "./components/Sf1DuplicateReview";
import { StatusChip } from "./components/StatusChip";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Sf1ImportScreenProps {
  sf1ImportService: Sf1ImportApplicationService;
  sectionService: SectionApplicationService;
  onImportComplete?: () => void;
}

type Phase = "setup" | "parsing" | "preview" | "committing" | "success" | "failure";

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * `err` is always either a `ValidationError` (this app's own pre-flight
 * check) or a rejected Tauri command carrying one of `AppError`'s fixed,
 * generic category strings (see `src-tauri/src/error.rs` — never raw
 * parser/database text). We can't recover more detail than the backend
 * chose to expose, but we CAN phrase the one category we do know about
 * ("import_error" -- a workbook file that couldn't be read as a valid
 * SF1 spreadsheet) more usefully than a blanket fallback, since that's
 * the failure a teacher is most likely to actually hit and be able to
 * act on themselves.
 */
function describeError(err: unknown, context: "reading" | "importing"): string {
  if (err instanceof ValidationError) return err.message;
  if (String(err).includes("import_error")) {
    return context === "reading"
      ? "LIKHA could not read this file as an SF1 workbook. Make sure it's a valid Excel file (.xls or .xlsx) with the expected columns, then choose the file again."
      : "LIKHA could not complete the import because of a problem with the file data. Go back to the preview, choose the file again, and try once more.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * SF1: Enrollment — Wave 2C (ADR-0043). Connects the tested Wave 2B
 * import engine to a teacher-facing workflow: choose a target section,
 * choose an SF1 workbook, review LIKHA's classification, resolve any
 * suspected duplicates, then commit. This screen never re-implements
 * Wave 2B's parsing/validation/matching rules, never supplies its own
 * school scope (that comes from the session on the Rust side, exactly
 * like every other screen), and offers no merge option.
 */
export function Sf1ImportScreen({
  sf1ImportService,
  sectionService,
  onImportComplete,
}: Sf1ImportScreenProps) {
  const { mode } = useTeacherMode();
  const [phase, setPhase] = useState<Phase>("setup");
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [sectionId, setSectionId] = useState("");
  const [startsOn, setStartsOn] = useState(todayAsIsoDate);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<Sf1ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Map<number, DuplicateDecision>>(new Map());
  const [activeReviewRow, setActiveReviewRow] = useState<number | null>(null);
  const [summary, setSummary] = useState<Sf1ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    sectionService
      .listSections()
      .then((result) => {
        if (cancelledRef.current) return;
        setSections(result);
      })
      .catch(() => {
        if (!cancelledRef.current) setError("Could not load sections.");
      })
      .finally(() => {
        if (!cancelledRef.current) setLoadingSections(false);
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [sectionService]);

  function resetToSetup() {
    setPhase("setup");
    setFilePath(null);
    setPreview(null);
    setDecisions(new Map());
    setActiveReviewRow(null);
    setSummary(null);
    setError(null);
  }

  async function handleChooseFile() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const chosenPath = await sf1ImportService.pickWorkbookFile();
      if (chosenPath === null) {
        setBusy(false);
        return;
      }
      setFilePath(chosenPath);
      setPhase("parsing");
      const result = await sf1ImportService.previewImport(chosenPath);
      setPreview(result);
      setDecisions(new Map());
      const firstUnresolved = result.needsReview[0]?.rowNumber ?? null;
      setActiveReviewRow(firstUnresolved);
      setPhase("preview");
    } catch (err) {
      setError(describeError(err, "reading"));
      setPhase("setup");
    } finally {
      setBusy(false);
    }
  }

  function handleDecision(rowNumber: number, decision: DuplicateDecision) {
    if (!preview) return;
    const next = new Map(decisions);
    next.set(rowNumber, decision);
    setDecisions(next);
    const remaining = preview.needsReview.filter((m) => !next.has(m.rowNumber));
    setActiveReviewRow(remaining[0]?.rowNumber ?? null);
  }

  async function handleCommit() {
    if (!preview || busy || sectionId.length === 0) return;
    setError(null);
    setBusy(true);
    setPhase("committing");
    try {
      const plans = sf1ImportService.buildCommitPlan(preview, decisions);
      const result = await sf1ImportService.commitImport(sectionId, startsOn, plans);
      setSummary(result);
      setPhase("success");
      onImportComplete?.();
    } catch (err) {
      setError(describeError(err, "importing"));
      setPhase("failure");
    } finally {
      setBusy(false);
    }
  }

  const unresolvedCount = preview ? sf1ImportService.unresolvedReviewCount(preview, decisions) : 0;
  const errorRowCount = preview ? new Set(preview.errors.map((issue) => issue.rowNumber)).size : 0;
  const readyRowCount = preview
    ? preview.newRows.length +
      preview.exactMatches.length +
      preview.needsReview.filter((m) => decisions.has(m.rowNumber)).length
    : 0;
  const canImport = preview !== null && unresolvedCount === 0 && readyRowCount > 0 && !busy;

  const activeMatch =
    preview && activeReviewRow !== null
      ? preview.needsReview.find((m) => m.rowNumber === activeReviewRow)
      : undefined;
  const activeRow =
    preview && activeReviewRow !== null
      ? preview.rows.find((r) => r.rowNumber === activeReviewRow)
      : undefined;
  const reviewIndex =
    preview && activeReviewRow !== null
      ? preview.needsReview.findIndex((m) => m.rowNumber === activeReviewRow)
      : -1;

  return (
    <section aria-label="SF1: Enrollment">
      <PageHeader
        title="SF1: Enrollment"
        hint={
          mode === "guided" ? (
            <p className="field-hint">
              Import learners from an SF1 Excel workbook you already have, instead of typing each
              one in by hand. LIKHA will show you exactly what it found before anything is saved.
            </p>
          ) : undefined
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {(phase === "setup" || phase === "parsing") && (
        <>
          <h3>Import existing SF1</h3>
          {loadingSections ? (
            <Loading label="Loading sections…" />
          ) : sections.length === 0 ? (
            <EmptyState>
              Create a section first (under Sections), then come back here to import its SF1.
            </EmptyState>
          ) : (
            <div className="form-row">
              <div className="field">
                <label htmlFor="sf1-section">Which section is this SF1 for?</label>
                <select
                  id="sf1-section"
                  value={sectionId}
                  onChange={(event) => setSectionId(event.target.value)}
                  disabled={phase === "parsing"}
                >
                  <option value="" disabled>
                    Select a section
                  </option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name} — Grade {section.gradeLevel} ({section.schoolYear})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sf1-starts-on">Enrollment effective date</label>
                <input
                  id="sf1-starts-on"
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                  disabled={phase === "parsing"}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            className="button-primary"
            onClick={handleChooseFile}
            disabled={sectionId.length === 0 || busy || phase === "parsing"}
          >
            {phase === "parsing" ? "Reading…" : "Choose Excel file"}
          </button>
          {mode !== "efficient" && <p className="field-hint">Excel workbook (.xls or .xlsx)</p>}

          {phase === "parsing" && filePath && (
            <Loading
              label={`Reading ${fileNameFromPath(filePath)} and comparing with existing learners…`}
            />
          )}
        </>
      )}

      {phase === "preview" && preview && (
        <>
          <h3>Import preview</h3>
          <p>
            <span className="sf1-chosen-file">
              {filePath ? fileNameFromPath(filePath) : "SF1 workbook"}
            </span>{" "}
            — {preview.rows.length} learner {preview.rows.length === 1 ? "row" : "rows"} found
          </p>

          <div className="sf1-summary-grid">
            <span className="sf1-summary-item">
              <span className="sf1-summary-count">{preview.newRows.length}</span>
              <StatusChip tone="productive">New</StatusChip>
            </span>
            <span className="sf1-summary-item">
              <span className="sf1-summary-count">{preview.exactMatches.length}</span>
              <StatusChip tone="neutral">Already in LIKHA</StatusChip>
            </span>
            <span className="sf1-summary-item">
              <span className="sf1-summary-count">{preview.needsReview.length}</span>
              <StatusChip tone="warning">Need your review</StatusChip>
            </span>
            <span className="sf1-summary-item">
              <span className="sf1-summary-count">{errorRowCount}</span>
              <StatusChip tone="danger">Has an error</StatusChip>
            </span>
          </div>

          {errorRowCount > 0 && (
            <Alert tone="error">
              <p>
                {errorRowCount} {errorRowCount === 1 ? "row" : "rows"} cannot be imported until
                corrected. These rows will simply be left out of this import.
              </p>
              <ul>
                {preview.errors.map((issue, index) => (
                  <li key={`${issue.rowNumber}-${issue.field}-${index}`}>
                    Row {issue.rowNumber} — {issue.message}. Correct this learner in the Excel file,
                    then choose the file again.
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {preview.warnings.length > 0 && (
            <Alert tone="warning">
              <p>
                {preview.warnings.length}{" "}
                {preview.warnings.length === 1 ? "learner has" : "learners have"} information LIKHA
                could not fully interpret. You can review these before importing, but they will not
                block the import.
              </p>
              <ul>
                {preview.warnings.map((issue, index) => (
                  <li key={`${issue.rowNumber}-${issue.field}-${index}`}>
                    Row {issue.rowNumber} — {issue.message}.
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {preview.needsReview.length > 0 && (
            <>
              <h4>Review duplicates</h4>
              {activeMatch ? (
                <Sf1DuplicateReview
                  key={activeMatch.rowNumber}
                  match={activeMatch}
                  row={activeRow}
                  resolvedCount={preview.needsReview.length - unresolvedCount}
                  totalCount={preview.needsReview.length}
                  onDecide={(decision) => handleDecision(activeMatch.rowNumber, decision)}
                  onPrevious={() => {
                    const previous = preview.needsReview[reviewIndex - 1];
                    if (previous) setActiveReviewRow(previous.rowNumber);
                  }}
                  onNext={() => {
                    const next = preview.needsReview[reviewIndex + 1];
                    if (next) setActiveReviewRow(next.rowNumber);
                  }}
                  hasPrevious={reviewIndex > 0}
                  hasNext={reviewIndex >= 0 && reviewIndex < preview.needsReview.length - 1}
                />
              ) : (
                <Alert tone="success">All duplicates reviewed.</Alert>
              )}

              <ul className="sf1-review-list" aria-label="All rows needing review">
                {preview.needsReview.map((match) => {
                  const decision = decisions.get(match.rowNumber);
                  return (
                    <li key={match.rowNumber}>
                      <span>
                        Row {match.rowNumber}
                        {decision
                          ? decision.type === "useExisting"
                            ? " — same learner"
                            : " — different learner"
                          : " — not yet reviewed"}
                      </span>
                      <button type="button" onClick={() => setActiveReviewRow(match.rowNumber)}>
                        {decision ? "Change decision" : "Review"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h4>Ready to import</h4>
          <p>
            {preview.newRows.length} new learners
            <br />
            {preview.exactMatches.length} existing learners
            <br />
            {preview.needsReview.length} duplicate{" "}
            {preview.needsReview.length === 1 ? "decision" : "decisions"} resolved (
            {preview.needsReview.length - unresolvedCount} of {preview.needsReview.length})
            <br />
            {errorRowCount} blocking {errorRowCount === 1 ? "error" : "errors"}
          </p>
          {unresolvedCount > 0 && (
            <p className="field-hint">
              Resolve the {unresolvedCount} remaining{" "}
              {unresolvedCount === 1 ? "duplicate" : "duplicates"} above before importing.
            </p>
          )}

          <div className="sf1-review-actions">
            <button
              type="button"
              className="button-primary"
              onClick={handleCommit}
              disabled={!canImport}
            >
              Import learners
            </button>
            <button type="button" onClick={resetToSetup} disabled={busy}>
              Back to SF1: Enrollment
            </button>
          </div>
        </>
      )}

      {phase === "committing" && <Loading label="Importing learners…" />}

      {phase === "success" && summary && (
        <>
          <Alert tone="success">SF1 import complete</Alert>
          <p>
            {summary.newLearnersCreated} learners added
            <br />
            {summary.existingLearnersEnrolled} existing learners used
            <br />
            {summary.rowsCommitted} enrollment records confirmed
          </p>
          <div className="sf1-review-actions">
            <button type="button" className="button-primary" onClick={resetToSetup}>
              Import another SF1
            </button>
          </div>
        </>
      )}

      {phase === "failure" && (
        <>
          <Alert tone="error">
            The import could not be completed. No partial learner import was saved.
          </Alert>
          <div className="sf1-review-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setError(null);
                setPhase("preview");
              }}
            >
              Try again
            </button>
            <button type="button" onClick={resetToSetup}>
              Back to SF1: Enrollment
            </button>
          </div>
        </>
      )}
    </section>
  );
}
