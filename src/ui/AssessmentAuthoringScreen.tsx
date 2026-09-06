import { useEffect, useRef, useState } from "react";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItemDetail,
} from "../domain/assessment";
import { ValidationError } from "../domain/errors";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AssessmentAuthoringScreenProps {
  classRecordId: string;
  /** A short label for the class record this authoring session is
   * building items for (e.g. "Mabini — Mathematics — Quarter 1"), shown
   * so a teacher always knows which class record they're building for
   * -- same reasoning as `ClassRecordWorkspace`'s `weightPolicyName`
   * prop. `null` only if the caller couldn't resolve it. */
  classRecordLabel: string | null;
  assessmentService: AssessmentApplicationService;
  onBack: () => void;
}

/**
 * Creation Studio — assessment-item authoring workspace (first of three
 * confirmed Creation Studio sub-scopes; report/output templates and the
 * lesson-plan builder are separate future slices, not built here).
 *
 * Distinct from `ClassRecordWorkspace`'s in-gradebook quick-add flow:
 * this screen exists purely to build out a whole set of assessment items
 * for one class record in one focused sitting (e.g. authoring an entire
 * quiz's worth of items) without the roster/score-entry UI alongside it.
 * It calls the same existing `AssessmentApplicationService` methods that
 * `ClassRecordWorkspace` already uses -- no new backend capability.
 */
export function AssessmentAuthoringScreen({
  classRecordId,
  classRecordLabel,
  assessmentService,
  onBack,
}: AssessmentAuthoringScreenProps) {
  const { mode } = useTeacherMode();

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
  const [addedCount, setAddedCount] = useState(0);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editMaxScore, setEditMaxScore] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [confirmingDeleteItemId, setConfirmingDeleteItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

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

  /** Adds one item and keeps the form open with focus back on the name
   * field -- the whole point of a dedicated authoring screen is building
   * a set of items in one sitting, so a teacher never has to reopen a
   * modal or re-pick the category/max score between items. Category and
   * max score deliberately carry over to the next item (a quiz's items
   * usually share both); only the name field clears. */
  async function handleAddItem() {
    if (creatingItem || itemName.trim().length === 0 || !categoryId) return;
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
        setError("Could not add this item — check the category and class record.");
      } else {
        const refreshed = await assessmentService.listItemsByClassRecord(classRecordId);
        setItems(refreshed);
        setItemName("");
        setAddedCount((count) => count + 1);
        setConfirmation(`${created.name} added.`);
        nameInputRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not add this item.");
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

  /** Same rename-vs-update split as `ClassRecordWorkspace::handleSaveEdit`
   * -- a scored item can only ever have its name corrected, never its
   * category or max score, since either would silently change grades
   * already computed from it. */
  async function handleSaveEdit(item: AssessmentItemDetail) {
    if (savingEdit || editName.trim().length === 0) return;
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
        setConfirmation(`${updated.name} updated.`);
      }
    } catch (err) {
      setItemActionError(err instanceof ValidationError ? err.message : "Could not save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  /** Only ever reachable for an unscored item -- the confirm/delete
   * controls are not rendered once `recordedCount > 0`. */
  async function handleDeleteItem(item: AssessmentItemDetail) {
    if (deletingItemId === item.id) return;
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
        setConfirmingDeleteItemId(null);
        setConfirmation(`${item.name} deleted.`);
      }
    } catch (err) {
      setItemActionError(
        err instanceof ValidationError ? err.message : "Could not delete this item.",
      );
    } finally {
      setDeletingItemId(null);
    }
  }

  return (
    <Page
      title="Creation Studio — Assessment Items"
      actions={
        <button type="button" onClick={onBack}>
          Back to Class Records
        </button>
      }
      hint={
        <>
          {classRecordLabel && (
            <p className="field-hint">
              Building assessment items for <strong>{classRecordLabel}</strong>.
            </p>
          )}
          {mode === "guided" && (
            <p className="field-hint">
              Author a whole quiz or task set here in one sitting: pick a category and max score
              once, then add each item by name — the form stays open so you can keep going without
              leaving this screen. Edit or delete any item below at any time.
            </p>
          )}
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      <div className="form-row">
        <div className="field">
          <label htmlFor="authoring-category-set">Category set</label>
          <select
            id="authoring-category-set"
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
          <label htmlFor="authoring-category">Category</label>
          <select
            id="authoring-category"
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
          <label htmlFor="authoring-item-name">Item name</label>
          <input
            id="authoring-item-name"
            ref={nameInputRef}
            type="text"
            placeholder="e.g. Item 1"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleAddItem();
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="authoring-max-score">Max score</label>
          <input
            id="authoring-max-score"
            type="number"
            min="1"
            value={maxScore}
            onChange={(event) => setMaxScore(event.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        className="button-primary"
        aria-disabled={creatingItem || itemName.trim().length === 0 || !categoryId}
        onClick={() => void handleAddItem()}
      >
        {creatingItem ? "Adding…" : "Add item and continue"}
      </button>
      {addedCount > 0 && (
        <p className="field-hint" role="status">
          {addedCount} item{addedCount === 1 ? "" : "s"} added this session.
        </p>
      )}

      {itemActionError && <Alert tone="error">{itemActionError}</Alert>}

      <h3>Items in this class record</h3>
      {itemsLoading ? (
        <Loading label="Loading items…" />
      ) : items.length === 0 ? (
        <EmptyState>No assessment items yet. Add one above to start building this set.</EmptyState>
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
                      <p className="field-hint">
                        This item already contains learner scores. Its maximum score and category
                        can&rsquo;t be changed here because doing so could change previously
                        calculated grades. Its name can still be corrected.
                      </p>
                    )}
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor={`authoring-edit-name-${item.id}`}>Item name</label>
                        <input
                          id={`authoring-edit-name-${item.id}`}
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      </div>
                      {!isScored && (
                        <>
                          <div className="field">
                            <label htmlFor={`authoring-edit-category-${item.id}`}>Category</label>
                            <select
                              id={`authoring-edit-category-${item.id}`}
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
                            <label htmlFor={`authoring-edit-max-${item.id}`}>Max score</label>
                            <input
                              id={`authoring-edit-max-${item.id}`}
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
                      aria-disabled={savingEdit || editName.trim().length === 0}
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
                    <span>
                      {item.categoryName} — {item.name} (max {item.maxScore})
                      {item.totalEligible > 0 &&
                        ` · ${item.recordedCount} of ${item.totalEligible} recorded`}
                    </span>
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
                            aria-disabled={deletingItemId === item.id}
                            onClick={() => void handleDeleteItem(item)}
                          >
                            {deletingItemId === item.id ? "Deleting…" : "Confirm delete"}
                          </button>
                          <button type="button" onClick={() => setConfirmingDeleteItemId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmingDeleteItemId(item.id)}>
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
    </Page>
  );
}
