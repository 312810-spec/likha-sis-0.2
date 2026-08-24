import { useEffect, useMemo, useRef, useState } from "react";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ExportApplicationService } from "../application/export-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItemDetail,
} from "../domain/assessment";
import { ValidationError } from "../domain/errors";
import type { ReportCardExportResult } from "../domain/export";
import type {
  ComputedTermGrade,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../domain/learner-score";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ClassRecordWorkspaceProps {
  classRecordId: string;
  /** The DepEd weighting policy this class record was explicitly opened
   * under (see `ClassRecordsScreen`'s create form) — shown so a teacher
   * always knows which weighting a computed grade reflects, never left
   * to guess. `null` only if the caller couldn't resolve it. */
  weightPolicyName: string | null;
  assessmentService: AssessmentApplicationService;
  learnerScoreService: LearnerScoreApplicationService;
  exportService: ExportApplicationService;
}

const STATUS_LABELS: Record<LearnerScoreStatus, string> = {
  scored: "Scored",
  excused: "Excused",
  not_applicable: "N/A",
};

/** Formats an ISO timestamp as a short local time for the "Saved HH:MM"
 * note. Returns `null` for anything that doesn't parse as a real date
 * rather than surfacing "Invalid Date" to a teacher. */
function formatSavedTime(updatedAt: string): string | null {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ClassRecordWorkspace({
  classRecordId,
  weightPolicyName,
  assessmentService,
  learnerScoreService,
  exportService,
}: ClassRecordWorkspaceProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [items, setItems] = useState<AssessmentItemDetail[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [categorySets, setCategorySets] = useState<AssessmentCategorySet[]>([]);
  const [categorySetId, setCategorySetId] = useState("");
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [itemName, setItemName] = useState("");
  const [maxScore, setMaxScore] = useState("20");
  const [creatingItem, setCreatingItem] = useState(false);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [roster, setRoster] = useState<LearnerScoreRosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [savingLearnerId, setSavingLearnerId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Moving focus programmatically (after Enter/arrow-navigation) fires a
  // synchronous native `blur` on the field being left, which re-enters
  // commitScoreDraft for that same learner before this first call's
  // `finally` has run — a plain React-state dirty-check can't reliably
  // catch that re-entrancy, since the state update from the first commit
  // may not have re-rendered yet. An imperative ref-based guard closes
  // that window regardless of render timing.
  const committingRef = useRef<Set<string>>(new Set());

  const [termGrades, setTermGrades] = useState<Record<string, ComputedTermGrade | null>>({});
  const [termGradesLoading, setTermGradesLoading] = useState(false);
  const [reportCardResult, setReportCardResult] = useState<ReportCardExportResult | null>(null);
  const [exportingReportCard, setExportingReportCard] = useState(false);

  const rosterOrder = useMemo(() => roster.map((r) => r.learnerId), [roster]);
  function neighborLearnerId(learnerId: string, direction: 1 | -1): string | undefined {
    const index = rosterOrder.indexOf(learnerId);
    if (index === -1) return undefined;
    return rosterOrder[index + direction];
  }
  function focusScoreInput(learnerId: string | undefined) {
    if (!learnerId) return;
    scoreInputRefs.current[learnerId]?.focus();
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      assessmentService.listItemsByClassRecord(classRecordId),
      assessmentService.listCategorySets(),
    ])
      .then(([itemList, sets]) => {
        if (cancelled) return;
        setItems(itemList);
        setCategorySets(sets);
        const defaultSet = sets.find((s) => s.isDefault) ?? sets[0];
        if (defaultSet) setCategorySetId(defaultSet.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this class record's assessment items.");
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentService, classRecordId]);

  useEffect(() => {
    if (!categorySetId) return;
    let cancelled = false;
    assessmentService
      .listCategoriesForSet(categorySetId)
      .then((result) => {
        if (cancelled) return;
        setCategories(result);
        if (result[0]) setCategoryId(result[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load categories for this set.");
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentService, categorySetId]);

  useEffect(() => {
    if (!selectedItemId) return;
    let cancelled = false;
    learnerScoreService
      .rosterForItem(selectedItemId)
      .then((result) => {
        if (cancelled) return;
        setRoster(result ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the roster for this item.");
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [learnerScoreService, selectedItemId]);

  async function handleCreateItem() {
    setError(null);
    setConfirmation(null);
    setCreatingItem(true);
    try {
      const created = await assessmentService.createItem(
        classRecordId,
        categoryId,
        itemName,
        Number(maxScore),
      );
      if (created === null) {
        setError("Could not create this item — check the category and class record.");
      } else {
        const refreshed = await assessmentService.listItemsByClassRecord(classRecordId);
        setItems(refreshed);
        setItemName("");
        setConfirmation(`${created.name} added.`);
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not create this item.");
    } finally {
      setCreatingItem(false);
    }
  }

  function draftScoreFor(learnerId: string, currentScore: number | null): string {
    return scoreDrafts[learnerId] ?? (currentScore === null ? "" : String(currentScore));
  }

  /** Saves one learner's status/score. Errors are surfaced inline on that
   * learner's row (not the page-level banner) so a mistake on one row
   * during rapid entry never interrupts the rest of the roster. Returns
   * whether the save succeeded, so callers can decide whether it's safe
   * to move keyboard focus away from a row that still needs fixing. */
  async function handleRecord(
    learnerId: string,
    status: LearnerScoreStatus,
    scoreText: string | null,
  ): Promise<boolean> {
    if (!selectedItemId) return false;
    const selectedItem = items.find((i) => i.id === selectedItemId);
    if (!selectedItem) return false;
    setRowErrors((current) => ({ ...current, [learnerId]: "" }));
    setSavingLearnerId(learnerId);
    try {
      const score = status === "scored" ? Number(scoreText) : null;
      const recorded = await learnerScoreService.recordScore(
        selectedItemId,
        learnerId,
        status,
        score,
        selectedItem.maxScore,
      );
      if (recorded === null) {
        setRowErrors((current) => ({ ...current, [learnerId]: "Could not save this score." }));
        return false;
      }
      setRoster((current) =>
        current.map((entry) =>
          entry.learnerId === learnerId
            ? { ...entry, status, score: recorded.score, updatedAt: recorded.updatedAt }
            : entry,
        ),
      );
      setScoreDrafts((current) => {
        const next = { ...current };
        delete next[learnerId];
        return next;
      });
      return true;
    } catch (err) {
      setRowErrors((current) => ({
        ...current,
        [learnerId]: err instanceof ValidationError ? err.message : "Could not save this score.",
      }));
      return false;
    } finally {
      setSavingLearnerId(null);
    }
  }

  /** Commits a learner's in-progress score-input text on Enter/blur/arrow
   * navigation. Two safety properties, both deliberate: (1) a value that
   * is unchanged from what's already saved is never re-sent — avoids a
   * no-op write bumping `updatedAt` and misleading the "Saved HH:MM" note;
   * (2) an emptied field is never committed — clearing the box does not
   * erase a previously recorded score, since that isn't a real status
   * this domain has (excused/not-applicable must be chosen explicitly via
   * their own buttons, not implied by a blank box). Only moves focus to
   * `moveFocusTo` when the save actually succeeded, so a validation error
   * keeps focus on the row that needs fixing. */
  async function commitScoreDraft(entry: LearnerScoreRosterEntry, moveFocusTo?: string) {
    if (committingRef.current.has(entry.learnerId)) {
      return;
    }
    const text = draftScoreFor(entry.learnerId, entry.score).trim();
    const previousText = entry.score === null ? "" : String(entry.score);
    if (text === previousText || text === "") {
      focusScoreInput(moveFocusTo);
      return;
    }
    committingRef.current.add(entry.learnerId);
    try {
      const saved = await handleRecord(entry.learnerId, "scored", text);
      if (saved) {
        focusScoreInput(moveFocusTo);
      }
    } finally {
      committingRef.current.delete(entry.learnerId);
    }
  }

  /** Computes each currently-loaded roster learner's DepEd term grade,
   * on demand rather than automatically — this is a per-learner Tauri
   * round trip, and re-running it on every item selection or keystroke
   * would be wasteful for a class of many learners and would show a
   * number that's misleadingly still updating mid-entry. A teacher asks
   * for it once they believe entry for this grading period is complete. */
  async function handleShowTermGrades() {
    setTermGradesLoading(true);
    try {
      const entries = await Promise.all(
        roster.map(async (entry) => {
          const grade = await learnerScoreService.computeTermGrade(classRecordId, entry.learnerId);
          return [entry.learnerId, grade] as const;
        }),
      );
      setTermGrades(Object.fromEntries(entries));
    } catch {
      setError("Could not compute term grades.");
    } finally {
      setTermGradesLoading(false);
    }
  }

  async function handleExportReportCard() {
    setError(null);
    setExportingReportCard(true);
    try {
      const result = await exportService.exportClassRecordReportCard(classRecordId);
      if (result === null) {
        setError("Could not export — this class record could not be found.");
      } else {
        setReportCardResult(result);
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not export the report card.");
    } finally {
      setExportingReportCard(false);
    }
  }

  const selectedItem = items.find((i) => i.id === selectedItemId);

  return (
    <section aria-label="Class Record Workspace">
      <h2 ref={headingRef} tabIndex={-1}>
        Class Record Workspace
      </h2>

      {mode === "guided" && (
        <p className="field-hint">
          Add assessment items (e.g. quizzes, tasks), then select one below to enter each learner's
          score. In the score column, press Enter or the Down arrow to save and move to the next
          learner, and Escape to undo an unsaved change.
        </p>
      )}

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

      <div className="form-row">
        <div className="field">
          <label htmlFor="workspace-category-set">Category set</label>
          <select
            id="workspace-category-set"
            value={categorySetId}
            onChange={(event) => setCategorySetId(event.target.value)}
          >
            {categorySets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
                {set.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="workspace-category">Category</label>
          <select
            id="workspace-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="workspace-item-name">Item name</label>
          <input
            id="workspace-item-name"
            type="text"
            placeholder="e.g. Quiz 1"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="workspace-max-score">Max score</label>
          <input
            id="workspace-max-score"
            type="number"
            min="1"
            value={maxScore}
            onChange={(event) => setMaxScore(event.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        disabled={creatingItem || itemName.trim().length === 0 || !categoryId}
        onClick={handleCreateItem}
      >
        {creatingItem ? "Adding…" : "Add item"}
      </button>

      {itemsLoading ? (
        <p role="status">Loading items…</p>
      ) : items.length === 0 ? (
        <p>No assessment items yet. Add one above.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selectedItemId === item.id}
                onClick={() => {
                  setError(null);
                  setRosterLoading(true);
                  setSelectedItemId(item.id);
                }}
              >
                {item.categoryName} — {item.name} (max {item.maxScore})
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedItem && (
        <>
          <h3>{selectedItem.name} scores</h3>
          {rosterLoading ? (
            <p role="status">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p>No learners eligible for this item's grading period.</p>
          ) : (
            <div className="score-entry-scroll">
              <table className="attendance-roster score-entry">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Score</th>
                    <th scope="col">Exception</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((entry) => {
                    const savedNote =
                      entry.updatedAt && !rowErrors[entry.learnerId]
                        ? formatSavedTime(entry.updatedAt)
                        : null;
                    return (
                      <tr key={entry.learnerId}>
                        <th scope="row">
                          {entry.givenName} {entry.familyName}
                        </th>
                        <td>
                          <label htmlFor={`score-${entry.learnerId}`} className="visually-hidden">
                            Score for {entry.givenName} {entry.familyName}
                          </label>
                          <input
                            id={`score-${entry.learnerId}`}
                            ref={(el) => {
                              scoreInputRefs.current[entry.learnerId] = el;
                            }}
                            className="score-entry-input"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max={selectedItem.maxScore}
                            aria-invalid={Boolean(rowErrors[entry.learnerId])}
                            aria-describedby={
                              rowErrors[entry.learnerId]
                                ? `score-error-${entry.learnerId}`
                                : undefined
                            }
                            placeholder={
                              entry.status === "excused"
                                ? "Excused"
                                : entry.status === "not_applicable"
                                  ? "N/A"
                                  : "—"
                            }
                            value={draftScoreFor(entry.learnerId, entry.score)}
                            onChange={(event) =>
                              setScoreDrafts((current) => ({
                                ...current,
                                [entry.learnerId]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === "ArrowDown") {
                                event.preventDefault();
                                void commitScoreDraft(entry, neighborLearnerId(entry.learnerId, 1));
                              } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                void commitScoreDraft(
                                  entry,
                                  neighborLearnerId(entry.learnerId, -1),
                                );
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                setScoreDrafts((current) => {
                                  const next = { ...current };
                                  delete next[entry.learnerId];
                                  return next;
                                });
                              }
                            }}
                            onBlur={() => void commitScoreDraft(entry)}
                          />
                          {rowErrors[entry.learnerId] && (
                            <p
                              id={`score-error-${entry.learnerId}`}
                              className="field-error"
                              role="alert"
                            >
                              {rowErrors[entry.learnerId]}
                            </p>
                          )}
                          {savedNote && <p className="score-saved-note">Saved {savedNote}</p>}
                        </td>
                        <td>
                          <div
                            role="group"
                            aria-label={`Exception status for ${entry.givenName} ${entry.familyName}`}
                          >
                            {(["excused", "not_applicable"] as const).map((status) => (
                              <button
                                key={status}
                                type="button"
                                aria-pressed={entry.status === status}
                                disabled={savingLearnerId === entry.learnerId}
                                onClick={() =>
                                  void handleRecord(entry.learnerId, status, null).then((saved) => {
                                    if (saved) {
                                      focusScoreInput(neighborLearnerId(entry.learnerId, 1));
                                    }
                                  })
                                }
                              >
                                {STATUS_LABELS[status]}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {roster.length > 0 && (
            <div className="term-grades">
              <p className="field-hint">
                Grading weighting: <strong>{weightPolicyName ?? "unknown"}</strong>
              </p>
              <button type="button" disabled={termGradesLoading} onClick={handleShowTermGrades}>
                {termGradesLoading ? "Computing…" : "Show term grades"}
              </button>
              {mode === "guided" && (
                <p className="field-hint">
                  Term grade uses the weighting above (DepEd Order No. 015, s. 2026) across every
                  category in this class record, not just the item selected above. A learner shows
                  "Not yet available" until every category has at least one scored item — this app
                  never estimates a grade from incomplete scores.
                </p>
              )}
              {Object.keys(termGrades).length > 0 && (
                <table className="attendance-roster">
                  <caption className="visually-hidden">Computed term grades</caption>
                  <thead>
                    <tr>
                      <th scope="col">Learner</th>
                      <th scope="col">Term Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((entry) => {
                      const grade = termGrades[entry.learnerId];
                      return (
                        <tr key={entry.learnerId}>
                          <th scope="row">
                            {entry.givenName} {entry.familyName}
                          </th>
                          <td>
                            {grade === undefined ? (
                              "—"
                            ) : grade === null ? (
                              "Not yet available"
                            ) : (
                              <>
                                {grade.termGrade}
                                {grade.wasFloored && (
                                  <span className="field-hint"> (raised to the minimum of 60)</span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <button
                type="button"
                className="button-primary"
                disabled={exportingReportCard}
                onClick={handleExportReportCard}
              >
                {exportingReportCard ? "Exporting…" : "Export report card (CSV)"}
              </button>
              <p className="field-hint">
                This export uses the <strong>{weightPolicyName ?? "unknown"}</strong> weighting
                chosen for this class record. Only two DepEd weighting groups are available so far —
                if this subject is Senior High School, Grade 12, or Key Stage 1, neither option is
                DepEd-compliant for it yet.
              </p>

              {reportCardResult && (
                <div className="confirmation-banner" role="status">
                  <p>
                    Saved to <code>{reportCardResult.filePath}</code>.
                  </p>
                  <p>
                    This report card is inspired by DepEd's grade computation rules, not a
                    submission-ready official-form reproduction. It does <strong>not</strong>{" "}
                    include:
                  </p>
                  <ul>
                    {reportCardResult.disclosure.omittedFields.map((omitted) => (
                      <li key={omitted.field}>
                        <strong>{omitted.field}</strong> — {omitted.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
