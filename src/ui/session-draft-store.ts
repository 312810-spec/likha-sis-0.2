const drafts = new Map<string, unknown>();
let epoch = 0;
export function clearSessionDrafts() {
  drafts.clear();
  epoch += 1;
}
export function sessionDraftEpoch() {
  return epoch;
}
export function readSessionDraft<T>(scope: string, initial: () => T): T {
  return drafts.has(scope) ? (drafts.get(scope) as T) : initial();
}
export function retainSessionDraft<T>(scope: string, value: T) {
  drafts.set(scope, value);
}
