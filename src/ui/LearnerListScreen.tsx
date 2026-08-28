import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EnrollmentHistoryApplicationService } from "../application/enrollment-history-service";
import type { ExportApplicationService } from "../application/export-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { EnrollmentHistoryEntry } from "../domain/enrollment-history";
import { ValidationError } from "../domain/errors";
import type { LearnerRosterExportResult } from "../domain/export";
import type { Learner } from "../domain/learner";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editFirstFieldRef = useRef<HTMLInputElement>(null);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [lrn, setLrn] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
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
  const [openHistory, setOpenHistory] = useState<OpenHistory | null>(null);
  const historyRequestId = useRef(0);
  const filteredLearners = learners.filter((learner) => matchesSearch(learner, searchQuery));

  useEffect(() => {
    // See LoginScreen's equivalent effect — moves focus here whenever
    // this screen mounts (e.g. right after signing in).
    headingRef.current?.focus();
  }, []);

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setSubmitting(true);
    try {
      const learner = await learnerService.enrollLearner(
        givenName,
        familyName,
        lrn.trim() === "" ? undefined : lrn,
        sex === "" ? undefined : sex,
      );
      setLearners((current) => [...current, learner]);
      setConfirmation(`${learner.givenName} ${learner.familyName} was enrolled.`);
      setGivenName("");
      setFamilyName("");
      setLrn("");
      setSex("");
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not enroll this learner.");
    } finally {
      setSubmitting(false);
    }
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
    setError(null);
    setConfirmation(null);
    setExportResult(null);
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

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
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
    <section aria-label="Learners">
      <h2 ref={headingRef} tabIndex={-1}>
        Learners
      </h2>

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

          <button type="button" disabled={exporting} onClick={handleExportRoster}>
            {exporting ? "Exporting…" : "Export learner list (CSV)"}
          </button>

          {exportResult && (
            <Alert tone="success">
              <p>
                Saved to <code>{exportResult.filePath}</code>.
              </p>
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
        <p>No learners enrolled yet.</p>
      ) : filteredLearners.length === 0 ? (
        <p>No learners match &ldquo;{searchQuery.trim()}&rdquo;.</p>
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
                  <button type="submit" className="button-primary" disabled={savingEdit}>
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
                  </span>
                </div>

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
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Enrolling…" : "Enroll learner"}
        </button>
      </form>
    </section>
  );
}
