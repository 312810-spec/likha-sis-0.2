import type { LessonPlanFields } from "../domain/lesson-plan";

export interface LessonDraft {
  assignmentId: string;
  planDate: string;
  editingPlanId: string | null;
  fields: LessonPlanFields;
}
interface Workspace {
  active: LessonDraft;
  drafts: Record<string, LessonDraft>;
}
const workspaces = new Map<string, Workspace>();
let epoch = 0;
const listeners = new Map<string, Set<() => void>>();
export function subscribeLessonWorkspace(owner: string, listener: () => void) {
  const group = listeners.get(owner) ?? new Set<() => void>();
  group.add(listener);
  listeners.set(owner, group);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(owner);
  };
}
export function clearLessonDrafts() {
  workspaces.clear();
  epoch += 1;
}
export function lessonDraftEpoch() {
  return epoch;
}
export function readLessonWorkspace(owner: string): Workspace | undefined {
  return workspaces.get(owner);
}
export function retainLessonWorkspace(
  owner: string,
  value: Workspace,
  expectedEpoch: number,
  notify = false,
) {
  if (epoch !== expectedEpoch) return;
  workspaces.set(owner, value);
  if (notify) listeners.get(owner)?.forEach((listener) => listener());
}
export function lessonDraftKey(draft: LessonDraft) {
  return JSON.stringify([draft.assignmentId, draft.editingPlanId ?? draft.planDate]);
}
