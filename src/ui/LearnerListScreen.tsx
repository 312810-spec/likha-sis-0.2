import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EnrollmentHistoryApplicationService } from "../application/enrollment-history-service";
import type { ExportApplicationService } from "../application/export-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { EnrollmentHistoryEntry } from "../domain/enrollment-history";
import { ValidationError } from "../domain/errors";
import type { LearnerRosterExportResult, Sf10ExportResult } from "../domain/export";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LearnerListScreenProps {
  learnerService: LearnerApplicationService;
  exportService: ExportApplicationService;
  enrollmentHistoryService: EnrollmentHistoryApplicationService;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return iso;
  return `${Number(day)} ${monthName} ${year}`;
}

interface OpenHistory {
  learnerId: string;
  learnerName: string;
  entries: EnrollmentHistoryEntry[] | null;
  loading: boolean;
  error: boolean;
}

/** Case-insensitive substring match against given name, family name, or
 * LRN — client-side, since the full roster is already loaded (proven to
 * stay fast at 500 rows by `LearnerApplicationService`'s own test suite)
 * and this is a "find one learner in a long list" filter, not a new
 * query surface. */
function matchesSearch(learner: Learner, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return true;
  return (
    learner.givenName.toLowerCase().includes(trimmed) ||
    learner.familyName.toLowerCase().includes(trimmed) ||
    (learner.lrn?.includes(trimmed) ?? false)
  );
}

export function LearnerListScreen({
  learnerService,
  exportService,
  enrollmentHistoryService,
}: LearnerListScreenProps) {
  const { mode } = useTeacherMode();
  const editFirstFieldRef = useRef<HTMLInputElement>(null);
  const duplicateWarningRef = useRef<HTMLDivElement>(null);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [lrn, setLrn] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<Learner[] | null>(null);
  const [lrnConflict, setLrnConflict] = useState<Learner | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGivenName, setEditGivenName] = useState("");
  const [editFamilyName, setEditFamilyName] = useState("");
  const [editLrn, setEditLrn] = useState("");
  const [editSex, setEditSex] = useState<"" | "M" | "F">("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<LearnerRosterExportResult | null>(null);
  const [revealingRoster, setRevealingRoster] = useState(false);
  const [revealRosterError, setRevealRosterError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<OpenHistory | null>(null);
  const historyRequestId = useRef(0);
  const [sf10ExportingId, setSf10ExportingId] = useState<string | null>(null);
  const [sf10Results, setSf10Results] = useState<Record<string, Sf10ExportResult>>({});
  const [sf10Errors, setSf10Errors] = useState<Record<string, string>>({});
  const [revealingSf10Id, setRevealingSf10Id] = useState<string | null>(null);
  const [revealSf10Errors, setRevealSf10Errors] = useState<Record<string, string>>({});
  const filteredLearners = learners.filter((learner) => matchesSearch(learner, searchQuery));

  useEffect(() => {
    // Entering edit mode removes the row's "Edit" button from the DOM and
    // replaces it with a form — without this, focus would silently fall
    // back to the document body, a real keyboard/screen-reader dead end
    // (found by self-review after the independent teacher-ux/accessibility
    // reviewer runs failed to return retrievable findings this session).
    if (editingId) {
      editFirstFieldRef.current?.focus();
    }
  }, [editingId]);

  useEffect(() => {
    // Moves focus to the duplicate/conflict warning as soon as it
    // appears, so keyboard and screen-reader users land directly on it
    // instead of it silently appearing below an unmoved focus point.
    if (duplicateCandidates || lrnConflict) {
      duplicateWarningRef.current?.focus();
    }
  }, [duplicateCandidates, lrnConflict]);

  useEffect(() => {
    let cancelled = false;
    learnerService
      .listLearners()
      .then((result) => {
        if (!cancelled) setLearners(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load learners.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [learnerService]);

  useEffect(
    () => () => {
      historyRequestId.current += 1;
    },
    [],
  );

  async function loadHistory(learner: Learner) {
    const requestId = historyRequestId.current + 1;
    historyRequestId.current = requestId;
    const learnerName = `${learner.givenName} ${learner.familyName}`;
    setOpenHistory({
      learnerId: learner.id,
      learnerName,
      entries: null,
      loading: true,
      error: false,
    });
    try {
      const entries = await enrollmentHistoryService.listForLearner(learner.id);
      if (historyRequestId.current === requestId) {
        setOpenHistory({
          learnerId: learner.id,
          learnerName,
          entries,
          loading: false,
          error: false,
        });
      }
    } catch {
      if (historyRequestId.current === requestId) {
        setOpenHistory({
          learnerId: learner.id,
          learnerName,
          entries: null,
          loading: false,
          error: true,
        });
      }
    }
  }

  function handleToggleHistory(learner: Learner) {
    if (openHistory?.learnerId === learner.id) {
      historyRequestId.current += 1;
      setOpenHistory(null);
      return;
    }
    void loadHistory(learner);
  }

  /** Applies a `CreateLearnerResult` shared by both the initial submit
   * and the confirmed "create separate learner anyway" retry -- keeping
   * the three-way branch (created / conflict / candidates) in one
   * place. Never clears form values except on `created`, so a teacher
   * reviewing a warning never loses what they typed. */
  function applyCreateLearnerResult(result: CreateLearnerResult) {
    if (result.kind === "created") {
      setLearners((current) => [...current, result.learner]);
      setConfirmation(`${result.learner.givenName} ${result.learner.familyName} was enrolled.`);
      setDuplicateCandidates(null);
      setLrnConflict(null);
      setGivenName("");
      setFamilyName("");
      setLrn("");
      setSex("");
    } else if (result.kind === "lrnConflict") {
      setDuplicateCandidates(null);
      setLrnConflict(result.existing);
    } else {
      setLrnConflict(null);
      setDuplicateCandidates(result.candidates);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setConfirmation(null);
    setSubmitting(true);
    try {
      const result = await learnerService.createLearnerWithDuplicateCheck(
        givenName,
        familyName,
        lrn.trim() === "" ? undefined : lrn,
        sex === "" ? undefined : sex,
      );
      applyCreateLearnerResult(result);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not enroll this learner.");
    } finally {
      setSubmitting(false);
    }
  }

  /** A teacher's explicit "create separate learner anyway" after
   * reviewing `duplicateCandidates` -- re-checks the school's current
   * records rather than trusting the earlier response, so a real LRN
   * conflict that appeared meanwhile is still caught (see
   * `learner::create_with_duplicate_check`'s doc comment). Never used to
   * override an `lrnConflict`, which is not overridable at all. */
  async function handleConfirmCreateSeparate() {
    if (submitting) return;
    setError(null);
    setConfirmation(null);
    setSubmitting(true);
    try {
      const result = await learnerService.createLearnerWithDuplicateCheck(
        givenName,
        familyName,
        lrn.trim() === "" ? undefined : lrn,
        sex === "" ? undefined : sex,
        true,
      );
      applyCreateLearnerResult(result);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not enroll this learner.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelDuplicateReview() {
    setDuplicateCandidates(null);
    setLrnConflict(null);
  }

  function handleStartEdit(learner: Learner) {
    setError(null);
    setConfirmation(null);
    historyRequestId.current += 1;
    setOpenHistory(null);
    setEditingId(learner.id);
    setEditGivenName(learner.givenName);
    setEditFamilyName(learner.familyName);
    setEditLrn(learner.lrn ?? "");
    setEditSex(learner.sex ?? "");
  }

  function handleCancelEdit() {
    setEditingId(null);
  }

  async function handleExportRoster() {
    if (exporting) return;
    setError(null);
    setConfirmation(null);
    setExportResult(null);
    setRevealRosterError(null);
    setExporting(true);
    try {
      const result = await exportService.exportLearnerRoster();
      if (result === null) {
        setError("Could not export — this school could not be found.");
      } else {
        setExportResult(result);
      }
    } catch {
      setError("Could not export the learner list.");
    } finally {
      setExporting(false);
    }
  }

  async function handleRevealRoster() {
    if (revealingRoster || !exportResult) return;
    setRevealRosterError(null);
    setRevealingRoster(true);
    try {
      await exportService.revealExportedFile(exportResult.filePath);
    } catch {
      setRevealRosterError("Could not open the folder for this file.");
    } finally {
      setRevealingRoster(false);
    }
  }

  async function handleExportSf10(learner: Learner) {
    if (sf10ExportingId) return;
    setSf10Errors((current) => {
      if (!(learner.id in current)) return current;
      const next = { ...current };
      delete next[learner.id];
      return next;
    });
    setSf10Results((current) => {
      if (!(learner.id in current)) return current;
      const next = { ...current };
      delete next[learner.id];
      return next;
    });
    setRevealSf10Errors((current) => {
      if (!(learner.id in current)) return current;
      const next = { ...current };
      delete next[learner.id];
      return next;
    });
    setSf10ExportingId(learner.id);
    try {
      const result = await exportService.exportLearnerPermanentRecordSf10(learner.id);
      if (result === null) {
        setSf10Errors((current) => ({
          ...current,
          [learner.id]: "Could not export — this learner could not be found.",
        }));
      } else {
        setSf10Results((current) => ({ ...current, [learner.id]: result }));
      }
    } catch (err) {
      setSf10Errors((current) => ({
        ...current,
        [learner.id]:
          err instanceof ValidationError
            ? err.message
            : "Could not export the permanent record — you may not have permission to generate it.",
      }));
    } finally {
      setSf10ExportingId(null);
    }
  }

  async function handleRevealSf10(learner: Learner) {
    const result = sf10Results[learner.id];
    if (revealingSf10Id || !result) return;
    setRevealSf10Errors((current) => {
      if (!(learner.id in current)) return current;
      const next = { ...current };
      delete next[learner.id];
      return next;
    });
    setRevealingSf10Id(learner.id);
    try {
      await exportService.revealExportedFile(result.filePath);
    } catch {
      setRevealSf10Errors((current) => ({
        ...current,
        [learner.id]: "Could not open the folder for this file.",
      }));
    } finally {
      setRevealingSf10Id(null);
    }
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId || savingEdit) return;
    setError(null);
    setConfirmation(null);
    setSavingEdit(true);
    try {
      const updated = await learnerService.updateLearnerProfile(
        editingId,
        editGivenName,
        editFamilyName,
        editLrn.trim() === "" ? undefined : editLrn,
        editSex === "" ? undefined : editSex,
      );
      if (updated) {
        setLearners((current) => current.map((l) => (l.id === updated.id ? updated : l)));
        setConfirmation(`${updated.givenName} ${updated.familyName}'s profile was updated.`);
        setEditingId(null);
      } else {
        setError("Could not find this learner to update.");
      }
    } catch (err) {
      setError(
        err instanceof ValidationError ? err.message : "Could not update this learner's profile.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Page title="Learners">
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {!loading && learners.length > 0 && (
        <>
          <div className="field">
            <label htmlFor="learner-search">Search learners</label>
            <input
              id="learner-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name or LRN"
              disabled={editingId !== null}
            />
          </div>

          <button type="button" aria-disabled={exporting} onClick={handleExportRoster}>
            {exporting ? "Exporting…" : "Export learner list (CSV)"}
          </button>

          {exportResult && (
            <Alert tone="success">
              <p>
                Saved to <code>{exportResult.filePath}</code>.
              </p>
              <button type="button" aria-disabled={revealingRoster} onClick={handleRevealRoster}>
                {revealingRoster ? "Opening…" : "Open folder"}
              </button>
              {revealRosterError && <p role="alert">{revealRosterError}</p>}
              <p>This file is for your own records — it does not include:</p>
              <ul>
                {exportResult.disclosure.omittedFields.map((omitted) => (
                  <li key={omitted.field}>
                    <strong>{omitted.field}</strong> — {omitted.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </>
      )}

      {loading ? (
        <Loading label="Loading learners…" />
      ) : learners.length === 0 ? (
        <EmptyState>No learners enrolled yet.</EmptyState>
      ) : filteredLearners.length === 0 ? (
        <EmptyState>No learners match &ldquo;{searchQuery.trim()}&rdquo;.</EmptyState>
      ) : (
        <ul className="learner-list">
          {filteredLearners.map((learner) =>
            editingId === learner.id ? (
              <li key={learner.id}>
                <form
                  onSubmit={handleSaveEdit}
                  aria-label={`Edit ${learner.givenName} ${learner.familyName}`}
                >
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor={`edit-given-name-${learner.id}`}>Given name</label>
                      <input
                        ref={editFirstFieldRef}
                        id={`edit-given-name-${learner.id}`}
                        type="text"
                        value={editGivenName}
                        onChange={(event) => setEditGivenName(event.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`edit-family-name-${learner.id}`}>Family name</label>
                      <input
                        id={`edit-family-name-${learner.id}`}
                        type="text"
                        value={editFamilyName}
                        onChange={(event) => setEditFamilyName(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor={`edit-lrn-${learner.id}`}>LRN (optional)</label>
                      <input
                        id={`edit-lrn-${learner.id}`}
                        type="text"
                        inputMode="numeric"
                        value={editLrn}
                        onChange={(event) => setEditLrn(event.target.value)}
                        placeholder="12-digit Learner Reference Number"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`edit-sex-${learner.id}`}>Sex (optional)</label>
                      <select
                        id={`edit-sex-${learner.id}`}
                        value={editSex}
                        onChange={(event) => setEditSex(event.target.value as "" | "M" | "F")}
                      >
                        <option value="">Not specified</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="button-primary" aria-disabled={savingEdit}>
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button type="button" disabled={savingEdit} onClick={handleCancelEdit}>
                    Cancel
                  </button>
                </form>
              </li>
            ) : (
              <li key={learner.id}>
                <div className="learner-list-row">
                  <span>
                    {learner.givenName} {learner.familyName}
                    {learner.lrn && <span className="learner-lrn"> — LRN {learner.lrn}</span>}
                  </span>
                  <span className="learner-row-actions">
                    <button
                      type="button"
                      disabled={editingId !== null}
                      aria-expanded={openHistory?.learnerId === learner.id}
                      aria-controls={`enrollment-history-${learner.id}`}
                      aria-label={`${
                        openHistory?.learnerId === learner.id ? "Hide" : "View"
                      } enrollment history for ${learner.givenName} ${learner.familyName}`}
                      onClick={() => handleToggleHistory(learner)}
                    >
                      {openHistory?.learnerId === learner.id ? "Hide history" : "View history"}
                    </button>
                    <button
                      type="button"
                      disabled={editingId !== null}
                      onClick={() => handleStartEdit(learner)}
                      aria-label={`Edit ${learner.givenName} ${learner.familyName}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-disabled={editingId !== null || sf10ExportingId !== null}
                      onClick={() => handleExportSf10(learner)}
                      aria-label={`Export permanent record (SF10) for ${learner.givenName} ${learner.familyName}`}
                    >
                      {sf10ExportingId === learner.id
                        ? "Exporting…"
                        : "Export SF10 (Permanent Record)"}
                    </button>
                  </span>
                </div>

                {sf10Errors[learner.id] && <Alert tone="error">{sf10Errors[learner.id]}</Alert>}
                {(() => {
                  const sf10Result = sf10Results[learner.id];
                  if (!sf10Result) return null;
                  return (
                    <Alert tone="success">
                      <p>
                        Saved to <code>{sf10Result.filePath}</code>.
                      </p>
                      <button
                        type="button"
                        aria-disabled={revealingSf10Id === learner.id}
                        onClick={() => handleRevealSf10(learner)}
                      >
                        {revealingSf10Id === learner.id ? "Opening…" : "Open folder"}
                      </button>
                      {revealSf10Errors[learner.id] && (
                        <p role="alert">{revealSf10Errors[learner.id]}</p>
                      )}
                      <p>
                        This file is a content-based summary of this learner&rsquo;s academic
                        history across every school year on record — it is <strong>not</strong> the
                        official DepEd SF10 template and does <strong>not</strong> include:
                      </p>
                      <ul>
                        {sf10Result.disclosure.omittedFields.map((omitted) => (
                          <li key={omitted.field}>
                            <strong>{omitted.field}</strong> — {omitted.reason}
                          </li>
                        ))}
                      </ul>
                    </Alert>
                  );
                })()}

                {openHistory?.learnerId === learner.id && (
                  <section
                    id={`enrollment-history-${learner.id}`}
                    className="enrollment-history"
                    aria-label={`Enrollment history for ${openHistory.learnerName}`}
                  >
                    <h3>Enrollment history</h3>
                    {mode === "guided" && (
                      <p className="field-hint">
                        This read-only record shows each section placement from oldest to newest.
                      </p>
                    )}
                    {openHistory.loading && (
                      <Loading
                        label={`Loading enrollment history for ${openHistory.learnerName}…`}
                      />
                    )}
                    {openHistory.error && (
                      <Alert tone="error">
                        <p>Could not load this learner&rsquo;s enrollment history.</p>
                        <button type="button" onClick={() => void loadHistory(learner)}>
                          Try again
                        </button>
                      </Alert>
                    )}
                    {openHistory.entries?.length === 0 && (
                      <p>No section placements have been recorded for this learner.</p>
                    )}
                    {openHistory.entries && openHistory.entries.length > 0 && (
                      <ol className="enrollment-history-list">
                        {openHistory.entries.map((entry) => (
                          <li key={entry.membershipId}>
                            <strong>
                              {entry.sectionName ?? "Section record unavailable"}
                              {entry.gradeLevel ? ` · Grade ${entry.gradeLevel}` : ""}
                            </strong>
                            {entry.schoolYear && (
                              <span className="field-hint">School year {entry.schoolYear}</span>
                            )}
                            <span>
                              Started {formatIsoDate(entry.startsOn)} ·{" "}
                              {entry.endsOn
                                ? `Ended ${formatIsoDate(entry.endsOn)}`
                                : "Current placement"}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={handleSubmit} aria-label="Enroll a learner">
        <h3>Enroll a learner</h3>
        {mode === "guided" && (
          <p className="field-hint">
            Enter the learner's full legal given and family names as they appear on official school
            records.
          </p>
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="learner-given-name">Given name</label>
            <input
              id="learner-given-name"
              type="text"
              value={givenName}
              onChange={(event) => setGivenName(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="learner-family-name">Family name</label>
            <input
              id="learner-family-name"
              type="text"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              required
            />
          </div>
        </div>
        {mode === "guided" && (
          <p className="field-hint">
            LRN and Sex are optional here, but the DepEd attendance (SF2) and report card exports
            need them — enter them now if you have them on hand, or add them later.
          </p>
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="learner-lrn">LRN (optional)</label>
            <input
              id="learner-lrn"
              type="text"
              inputMode="numeric"
              value={lrn}
              onChange={(event) => setLrn(event.target.value)}
              placeholder="12-digit Learner Reference Number"
            />
          </div>
          <div className="field">
            <label htmlFor="learner-sex">Sex (optional)</label>
            <select
              id="learner-sex"
              value={sex}
              onChange={(event) => setSex(event.target.value as "" | "M" | "F")}
            >
              <option value="">Not specified</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
        </div>
        {lrnConflict && (
          <div
            ref={duplicateWarningRef}
            className="learner-duplicate-warning"
            role="alert"
            tabIndex={-1}
            aria-label="LRN already in use"
          >
            <p>
              LRN <strong>{lrn.trim()}</strong> already belongs to{" "}
              <strong>
                {lrnConflict.givenName} {lrnConflict.familyName}
              </strong>{" "}
              in this school.
            </p>
            <p className="field-hint">
              Each Learner Reference Number can only belong to one learner. Correct the LRN above,
              or edit {lrnConflict.givenName}&rsquo;s existing record instead of creating a new one.
            </p>
            <button type="button" onClick={handleCancelDuplicateReview}>
              Edit the form
            </button>
          </div>
        )}

        {duplicateCandidates && (
          <div
            ref={duplicateWarningRef}
            className="learner-duplicate-warning"
            role="alert"
            tabIndex={-1}
            aria-label="Possible duplicate learner"
          >
            <p>
              LIKHA found{" "}
              {duplicateCandidates.length === 1
                ? "a learner"
                : `${duplicateCandidates.length} learners`}{" "}
              already in this school with a matching name{lrn.trim() !== "" ? " or LRN" : ""}:
            </p>
            <ul>
              {duplicateCandidates.map((candidate) => (
                <li key={candidate.id}>
                  {candidate.givenName} {candidate.familyName}
                  {candidate.lrn && ` — LRN ${candidate.lrn}`}
                </li>
              ))}
            </ul>
            {mode === "guided" ? (
              <p className="field-hint">
                If this is the same learner, cancel and use their existing record instead of
                creating a new one. If this is a different learner, you can safely continue — LIKHA
                never merges or changes any existing record.
              </p>
            ) : (
              <p className="field-hint">
                LIKHA never merges or changes an existing record automatically.
              </p>
            )}
            <div className="form-row">
              <button
                type="button"
                className="button-primary"
                onClick={handleConfirmCreateSeparate}
                aria-disabled={submitting}
              >
                {submitting ? "Creating…" : "Create separate learner"}
              </button>
              <button type="button" onClick={handleCancelDuplicateReview} disabled={submitting}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!duplicateCandidates && !lrnConflict && (
          <button type="submit" className="button-primary" aria-disabled={submitting}>
            {submitting ? "Enrolling…" : "Enroll learner"}
          </button>
        )}
      </form>
    </Page>
  );
}
