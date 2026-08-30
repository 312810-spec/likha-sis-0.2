import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { LearnerPhotoApplicationService } from "../application/learner-photo-service";
import type { SectionApplicationService } from "../application/section-service";
import { ValidationError } from "../domain/errors";
import type { LearnerRosterExportResult } from "../domain/export";
import type { Learner } from "../domain/learner";
import type { LearnerEnrollmentHistoryEntry } from "../domain/section";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LearnerListScreenProps {
  learnerService: LearnerApplicationService;
  exportService: ExportApplicationService;
  learnerPhotoService: LearnerPhotoApplicationService;
  sectionService: SectionApplicationService;
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
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
  learnerPhotoService,
  sectionService,
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
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [editPhotoBusy, setEditPhotoBusy] = useState(false);
  const [historyLearnerId, setHistoryLearnerId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<LearnerEnrollmentHistoryEntry[] | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
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
    setEditPhotoUrl(null);
    learnerPhotoService
      .getPhoto(learner.id)
      .then((photo) => {
        if (photo) {
          const blob = new Blob([photo.bytes.slice()], { type: photo.mimeType });
          setEditPhotoUrl((current) => current ?? URL.createObjectURL(blob));
        }
      })
      .catch(() => {
        // Non-fatal: the edit form still works without a photo preview.
      });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }

  async function handleEditPhotoChange(learnerId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setEditPhotoBusy(true);
    try {
      const bytes = await fileToBytes(file);
      const found = await learnerPhotoService.setPhoto(learnerId, bytes, file.type);
      if (!found) {
        setError("Could not find this learner to attach a photo to.");
        return;
      }
      setEditPhotoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not upload this photo.");
    } finally {
      setEditPhotoBusy(false);
    }
  }

  async function handleRemoveEditPhoto(learnerId: string) {
    setError(null);
    setEditPhotoBusy(true);
    try {
      await learnerPhotoService.clearPhoto(learnerId);
      setEditPhotoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    } catch {
      setError("Could not remove this photo.");
    } finally {
      setEditPhotoBusy(false);
    }
  }

  async function handleToggleHistory(learnerId: string) {
    if (historyLearnerId === learnerId) {
      setHistoryLearnerId(null);
      setHistoryEntries(null);
      return;
    }
    setError(null);
    setHistoryLearnerId(learnerId);
    setHistoryEntries(null);
    setHistoryLoading(true);
    try {
      const entries = await sectionService.learnerEnrollmentHistory(learnerId);
      setHistoryEntries(entries ?? []);
    } catch {
      setError("Could not load this learner's enrollment history.");
    } finally {
      setHistoryLoading(false);
    }
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
        setEditPhotoUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
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
                  <div className="field">
                    <label htmlFor={`edit-photo-${learner.id}`}>Photo (optional)</label>
                    {editPhotoUrl && (
                      <p>
                        <img
                          src={editPhotoUrl}
                          alt={`${learner.givenName} ${learner.familyName}`}
                          style={{ maxWidth: "96px", maxHeight: "96px" }}
                        />
                      </p>
                    )}
                    <input
                      id={`edit-photo-${learner.id}`}
                      type="file"
                      accept="image/png,image/jpeg"
                      disabled={editPhotoBusy}
                      onChange={(event) => handleEditPhotoChange(learner.id, event)}
                    />
                    {editPhotoUrl && (
                      <button
                        type="button"
                        disabled={editPhotoBusy}
                        onClick={() => handleRemoveEditPhoto(learner.id)}
                      >
                        Remove photo
                      </button>
                    )}
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
                <button
                  type="button"
                  disabled={editingId !== null}
                  onClick={() => handleToggleHistory(learner.id)}
                  aria-expanded={historyLearnerId === learner.id}
                  aria-label={
                    historyLearnerId === learner.id
                      ? `Hide enrollment history for ${learner.givenName} ${learner.familyName}`
                      : `Show enrollment history for ${learner.givenName} ${learner.familyName}`
                  }
                >
                  {historyLearnerId === learner.id ? "Hide history" : "Enrollment history"}
                </button>
                {historyLearnerId === learner.id &&
                  (historyLoading ? (
                    <Loading label="Loading enrollment history…" />
                  ) : historyEntries && historyEntries.length === 0 ? (
                    <p>No enrollment history yet.</p>
                  ) : (
                    historyEntries && (
                      <ul aria-label={`Enrollment history entries for ${learner.givenName}`}>
                        {historyEntries.map((entry) => (
                          <li key={entry.membershipId}>
                            {entry.sectionName} (Grade {entry.gradeLevel}, {entry.schoolYear}) —{" "}
                            {entry.startsOn} to {entry.endsOn ?? "present"}
                          </li>
                        ))}
                      </ul>
                    )
                  ))}
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
