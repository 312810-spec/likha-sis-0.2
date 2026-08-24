import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type { LearnerApplicationService } from "../application/learner-service";
import { ValidationError } from "../domain/errors";
import type { LearnerRosterExportResult } from "../domain/export";
import type { Learner } from "../domain/learner";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LearnerListScreenProps {
  learnerService: LearnerApplicationService;
  exportService: ExportApplicationService;
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

export function LearnerListScreen({ learnerService, exportService }: LearnerListScreenProps) {
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

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="confirmation-banner" role="status">
          {confirmation}
        </div>
      )}

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
            <div className="confirmation-banner" role="status">
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
            </div>
          )}
        </>
      )}

      {loading ? (
        <p role="status">Loading learners…</p>
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
                {learner.givenName} {learner.familyName}
                {learner.lrn && <span className="learner-lrn"> — LRN {learner.lrn}</span>}
                <button
                  type="button"
                  disabled={editingId !== null}
                  onClick={() => handleStartEdit(learner)}
                  aria-label={`Edit ${learner.givenName} ${learner.familyName}`}
                >
                  Edit
                </button>
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
