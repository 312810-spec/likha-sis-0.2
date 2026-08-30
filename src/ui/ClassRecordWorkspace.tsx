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
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { StatusChip } from "./components/StatusChip";
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

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editMaxScore, setEditMaxScore] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [confirmingDeleteItemId, setConfirmingDeleteItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [roster, setRoster] = useState<LearnerScoreRosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [savingLearnerIds, setSavingLearnerIds] = useState<ReadonlySet<string>>(new Set());
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
  // Per-learner write "generation": incremented every time a new write
  // starts for that learner, whether via the score input's commit path
  // or the Excused/N/A exception buttons -- these are two separate call
  // sites that don't otherwise guard each other. A write's response is
  // applied only if it is still the latest generation for that learner
  // when it settles, so an older, slower write (from either path) can
  // never overwrite a newer one's result.
  const writeGenerationRef = useRef<Map<string, number>>(new Map());
  // Request identity for the roster fetch: guards against an in-flight
  // fetch whose selected item has since changed from applying its result
  // to the now-current item.
  const rosterRequestRef = useRef(0);

  const [termGrades, setTermGrades] = useState<Record<string, ComputedTermGrade | null>>({});
  const [termGradesLoading, setTermGradesLoading] = useState(false);
  const [justUpdatedLearnerId, setJustUpdatedLearnerId] = useState<string | null>(null);
  const updateFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Opening the edit form for an item moves focus into it; closing it
  // (Cancel or a successful Save, neither of which removes the item)
  // returns focus to that same item's select button, so a keyboard/
  // screen-reader user never loses their place in the list — the item's
  // own controls unmount and remount around this transition, so nothing
  // is left to hold focus on its own.
  const previousEditingItemId = useRef<string | null>(null);
  useEffect(() => {
    if (editingItemId !== null) {
      document.getElementById(`edit-name-${editingItemId}`)?.focus();
    } else if (previousEditingItemId.current !== null) {
      document.getElementById(`select-item-${previousEditingItemId.current}`)?.focus();
    }
    previousEditingItemId.current = editingItemId;
  }, [editingItemId]);

  // Same reasoning for the two-step delete confirmation, with one extra
  // case: a successful delete removes the item's own controls entirely,
  // so there is nothing to return focus to — fall back to the workspace
  // heading (the same stable anchor the initial mount-focus effect above
  // already uses) rather than silently dropping to <body>.
  const previousConfirmingDeleteItemId = useRef<string | null>(null);
  useEffect(() => {
    if (confirmingDeleteItemId !== null) {
      document.getElementById(`confirm-delete-${confirmingDeleteItemId}`)?.focus();
    } else if (previousConfirmingDeleteItemId.current !== null) {
      const restoreTarget = document.getElementById(
        `delete-item-${previousConfirmingDeleteItemId.current}`,
      );
      if (restoreTarget) {
        restoreTarget.focus();
      } else {
        headingRef.current?.focus();
      }
    }
    previousConfirmingDeleteItemId.current = confirmingDeleteItemId;
  }, [confirmingDeleteItemId]);

  useEffect(() => {
    return () => {
      if (updateFlashTimeoutRef.current) clearTimeout(updateFlashTimeoutRef.current);
    };
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

  function loadRoster() {
    if (!selectedItemId) return;
    const requestId = ++rosterRequestRef.current;
    setRosterLoading(true);
    setRosterError(null);
    learnerScoreService
      .rosterForItem(selectedItemId)
      .then((result) => {
        if (rosterRequestRef.current !== requestId) return;
        setRoster(result ?? []);
      })
      .catch(() => {
        if (rosterRequestRef.current !== requestId) return;
        setRosterError("Could not load the roster for this item.");
      })
      .finally(() => {
        if (rosterRequestRef.current !== requestId) return;
        setRosterLoading(false);
      });
  }

  useEffect(() => {
    // Clear the previous item's roster immediately -- a failed load must
    // never leave a different assessment item's roster rendered as if it
    // belongs to the newly selected item.
    setRoster([]);
    setRowErrors({});
    setTermGrades({});
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function startEditingItem(item: AssessmentItemDetail) {
    setItemActionError(null);
    setConfirmingDeleteItemId(null);
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditCategoryId(item.categoryId);
    setEditMaxScore(String(item.maxScore));
  }

  /** Saves an in-progress item edit. An already-scored item only ever
   * calls `renameItem` (always safe -- see `assessment_item::rename`'s
   * doc comment) regardless of what the now-hidden category/max-score
   * fields hold, since those controls are not rendered for a scored item
   * in the first place. An unscored item calls the full `updateItem`,
   * which the Rust layer itself re-verifies is still unscored and
   * resolves to a valid leaf category before accepting the change. */
  async function handleSaveEdit(item: AssessmentItemDetail) {
    const isScored = item.recordedCount > 0;
    setSavingEdit(true);
    setItemActionError(null);
    try {
      const updated = isScored
        ? await assessmentService.renameItem(item.id, editName)
        : await assessmentService.updateItem(
            item.id,
            editName,
            editCategoryId,
            Number(editMaxScore),
          );
      if (updated === null) {
        setItemActionError(
          isScored
            ? "Could not rename this item."
            : "Could not save changes — this item may already have recorded scores.",
        );
      } else {
        const refreshed = await assessmentService.listItemsByClassRecord(classRecordId);
        setItems(refreshed);
        setEditingItemId(null);
      }
    } catch (err) {
      setItemActionError(err instanceof ValidationError ? err.message : "Could not save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  /** Deletes an item after the two-step confirmation below has already
   * armed for this item's id. Only ever reachable for an unscored item --
   * the confirm/delete controls are not rendered once `recordedCount > 0`. */
  async function handleDeleteItem(item: AssessmentItemDetail) {
    setDeletingItemId(item.id);
    setItemActionError(null);
    try {
      const deleted = await assessmentService.deleteItem(item.id);
      if (!deleted) {
        setItemActionError("Could not delete this item — it may already have recorded scores.");
        setConfirmingDeleteItemId(null);
      } else {
        const refreshed = await assessmentService.listItemsByClassRecord(classRecordId);
        setItems(refreshed);
        if (selectedItemId === item.id) setSelectedItemId(null);
        setConfirmingDeleteItemId(null);
      }
    } catch (err) {
      setItemActionError(
        err instanceof ValidationError ? err.message : "Could not delete this item.",
      );
    } finally {
      setDeletingItemId(null);
    }
  }

  function draftScoreFor(learnerId: string, currentScore: number | null): string {
    return scoreDrafts[learnerId] ?? (currentScore === null ? "" : String(currentScore));
  }

  /** After grades have been shown at least once this session, keep the
   * one affected learner's grade from silently going stale when their
   * score changes -- cheap (one round trip for one learner, not the
   * whole roster) and safe (compute_term_grade is deterministic). If
   * grades were never shown, there is nothing to keep fresh, so this is
   * a genuine no-op, not a hidden background cost every score-entry
   * teacher pays. See ADR-0034 for the full reasoning. */
  function maybeRefreshTermGrade(learnerId: string) {
    if (Object.keys(termGrades).length === 0) return;
    void learnerScoreService
      .computeTermGrade(classRecordId, learnerId)
      .then((grade) => {
        setTermGrades((current) => ({ ...current, [learnerId]: grade }));
        setJustUpdatedLearnerId(learnerId);
        if (updateFlashTimeoutRef.current) clearTimeout(updateFlashTimeoutRef.current);
        updateFlashTimeoutRef.current = setTimeout(() => setJustUpdatedLearnerId(null), 2500);
      })
      .catch(() => {
        // Best-effort background refresh -- a failure here must not
        // surface as a page-level error over an otherwise-successful
        // score save. The teacher can always click "Show term grades"
        // again for an explicit retry.
      });
  }

  /** Saves one learner's status/score. Errors are surfaced inline on that
   * learner's row (not the page-level banner) so a mistake on one row
   * during rapid entry never interrupts the rest of the roster. Returns
   * whether the save succeeded, so callers can decide whether it's safe
   * to move keyboard focus away from a row that still needs fixing. Both
   * the score-input commit path and the Excused/N/A exception buttons
   * call this — the per-learner write-generation guard below protects
   * both equally, since neither path otherwise knows about the other. */
  async function handleRecord(
    learnerId: string,
    status: LearnerScoreStatus,
    scoreText: string | null,
  ): Promise<boolean> {
    if (!selectedItemId) return false;
    const selectedItem = items.find((i) => i.id === selectedItemId);
    if (!selectedItem) return false;

    // Selecting the already-active exception status is a no-op, not a
    // write (the score-input path has its own analogous check in
    // commitScoreDraft, since "scored" always carries a value to compare).
    const currentEntry = roster.find((entry) => entry.learnerId === learnerId);
    if (status !== "scored" && currentEntry && currentEntry.status === status) {
      return true;
    }

    setRowErrors((current) => ({ ...current, [learnerId]: "" }));
    const generation = (writeGenerationRef.current.get(learnerId) ?? 0) + 1;
    writeGenerationRef.current.set(learnerId, generation);
    setSavingLearnerIds((current) => new Set(current).add(learnerId));
    try {
      const score = status === "scored" ? Number(scoreText) : null;
      const recorded = await learnerScoreService.recordScore(
        selectedItemId,
        learnerId,
        status,
        score,
        selectedItem.maxScore,
      );
      // An older write's response must never overwrite a newer one's
      // result -- only apply this response if nothing newer started for
      // this learner while it was in flight.
      if (writeGenerationRef.current.get(learnerId) !== generation) return false;
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
      maybeRefreshTermGrade(learnerId);
      return true;
    } catch (err) {
      if (writeGenerationRef.current.get(learnerId) !== generation) return false;
      setRowErrors((current) => ({
        ...current,
        [learnerId]: err instanceof ValidationError ? err.message : "Could not save this score.",
      }));
      return false;
    } finally {
      if (writeGenerationRef.current.get(learnerId) === generation) {
        setSavingLearnerIds((current) => {
          const next = new Set(current);
          next.delete(learnerId);
          return next;
        });
      }
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
   * for it once they believe entry for this grading period is complete.
   * Once shown, an individual score change afterward keeps just that one
   * learner's grade fresh automatically — see `maybeRefreshTermGrade`. */
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
  const recordedCount = roster.filter((entry) => entry.status !== null).length;
  const remainingCount = roster.length - recordedCount;

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

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

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

      {itemActionError && <Alert tone="error">{itemActionError}</Alert>}

      {itemsLoading ? (
        <Loading label="Loading items…" />
      ) : items.length === 0 ? (
        <EmptyState>No assessment items yet. Add one above.</EmptyState>
      ) : (
        <ul className="assessment-item-list">
          {items.map((item) => {
            const isScored = item.recordedCount > 0;
            const isEditing = editingItemId === item.id;
            const isConfirmingDelete = confirmingDeleteItemId === item.id;
            return (
              <li key={item.id}>
                {isEditing ? (
                  <div className="item-edit-form">
                    {isScored && (
                      <p className="field-hint" id={`edit-scored-hint-${item.id}`}>
                        This activity already contains learner scores. Its maximum score and
                        category can&rsquo;t be changed here because doing so could change
                        previously calculated grades. Its name can still be corrected.
                      </p>
                    )}
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor={`edit-name-${item.id}`}>Item name</label>
                        <input
                          id={`edit-name-${item.id}`}
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          aria-describedby={isScored ? `edit-scored-hint-${item.id}` : undefined}
                        />
                      </div>
                      {!isScored && (
                        <>
                          <div className="field">
                            <label htmlFor={`edit-category-${item.id}`}>Category</label>
                            <select
                              id={`edit-category-${item.id}`}
                              value={editCategoryId}
                              onChange={(event) => setEditCategoryId(event.target.value)}
                            >
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                              {!categories.some((category) => category.id === editCategoryId) && (
                                <option value={editCategoryId}>{item.categoryName}</option>
                              )}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor={`edit-max-${item.id}`}>Max score</label>
                            <input
                              id={`edit-max-${item.id}`}
                              type="number"
                              min="1"
                              value={editMaxScore}
                              onChange={(event) => setEditMaxScore(event.target.value)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={savingEdit || editName.trim().length === 0}
                      onClick={() => void handleSaveEdit(item)}
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingItemId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      id={`select-item-${item.id}`}
                      aria-pressed={selectedItemId === item.id}
                      onClick={() => {
                        setError(null);
                        setSelectedItemId(item.id);
                      }}
                    >
                      {item.categoryName} — {item.name} (max {item.maxScore})
                      {item.totalEligible > 0 &&
                        ` · ${item.recordedCount} of ${item.totalEligible} recorded`}
                    </button>
                    <div role="group" aria-label={`Actions for ${item.name}`}>
                      <button type="button" onClick={() => startEditingItem(item)}>
                        Edit
                      </button>
                      {isScored ? (
                        <span className="field-hint">
                          Can&rsquo;t delete — already has recorded scores.
                        </span>
                      ) : isConfirmingDelete ? (
                        <>
                          <span className="field-hint">
                            Delete this item? This can&rsquo;t be undone.
                          </span>
                          <button
                            type="button"
                            id={`confirm-delete-${item.id}`}
                            disabled={deletingItemId === item.id}
                            onClick={() => void handleDeleteItem(item)}
                          >
                            {deletingItemId === item.id ? "Deleting…" : "Confirm delete"}
                          </button>
                          <button type="button" onClick={() => setConfirmingDeleteItemId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          id={`delete-item-${item.id}`}
                          onClick={() => setConfirmingDeleteItemId(item.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {selectedItem && (
        <>
          <h3>{selectedItem.name} scores</h3>

          {rosterError && (
            <Alert tone="error">
              <p>{rosterError}</p>
              <button type="button" onClick={loadRoster}>
                Retry
              </button>
            </Alert>
          )}

          {rosterLoading ? (
            <Loading label="Loading roster…" />
          ) : rosterError ? null : roster.length === 0 ? (
            <EmptyState>No learners eligible for this item's grading period.</EmptyState>
          ) : (
            <>
              <p className="attendance-count">
                <strong>
                  {recordedCount} of {roster.length} recorded
                </strong>{" "}
                · {remainingCount} remaining
              </p>
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
                      const isSaving = savingLearnerIds.has(entry.learnerId);
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
                                  void commitScoreDraft(
                                    entry,
                                    neighborLearnerId(entry.learnerId, 1),
                                  );
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
                            {entry.status === null && !isSaving && (
                              <StatusChip tone="neutral">Not recorded</StatusChip>
                            )}
                            {isSaving && (
                              <span className="field-hint" role="status">
                                Saving…
                              </span>
                            )}
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
                                  onClick={() =>
                                    void handleRecord(entry.learnerId, status, null).then(
                                      (saved) => {
                                        if (saved) {
                                          focusScoreInput(neighborLearnerId(entry.learnerId, 1));
                                        }
                                      },
                                    )
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
            </>
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
                  never estimates a grade from incomplete scores. Once shown, correcting a score
                  keeps that learner's grade current automatically.
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
                                {justUpdatedLearnerId === entry.learnerId && (
                                  <span className="field-hint" role="status">
                                    {" "}
                                    (just updated)
                                  </span>
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
                <Alert tone="success">
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
                </Alert>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
