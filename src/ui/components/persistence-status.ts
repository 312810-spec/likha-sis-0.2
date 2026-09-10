import type { StatusChipTone } from "./StatusChip";

/**
 * The canonical set of persistence / sync states a teacher can be shown.
 * See `docs/design/status-vocabulary.md` for the full contract: when
 * each may be shown, the copy rules, and the local-first honesty rule
 * that `synced` is never claimed on the strength of a local write alone.
 *
 * `@public` — consumed structurally by screens that render a status
 * chip for a record or summary line; keep in sync with the doc.
 */
export type PersistenceState =
  "saved-local" | "pending-sync" | "synced" | "offline" | "conflict" | "failed";

export interface PersistenceStatusPresentation {
  /** Default at-a-glance label. A caller may override the text for a
   * specific surface, but not the tone. */
  label: string;
  tone: StatusChipTone;
}

/**
 * Maps each state to its default `StatusChip` presentation. The label
 * text always carries the meaning (WCAG 1.4.1); the tone is an additive
 * cue only.
 */
export const PERSISTENCE_STATUS: Record<PersistenceState, PersistenceStatusPresentation> = {
  "saved-local": { label: "Saved on this device", tone: "productive" },
  "pending-sync": { label: "Waiting to sync", tone: "warning" },
  synced: { label: "Synced", tone: "success" },
  offline: { label: "Offline", tone: "neutral" },
  conflict: { label: "Needs your review", tone: "warning" },
  failed: { label: "Sync failed", tone: "danger" },
};

/**
 * When more than one state could apply to the same record, the most
 * actionable one wins (see the doc's "Ordering / precedence" section).
 * Lower number = higher precedence.
 */
const PRECEDENCE: Record<PersistenceState, number> = {
  conflict: 0,
  failed: 1,
  "pending-sync": 2,
  synced: 3,
  offline: 3,
  "saved-local": 3,
};

export function mostActionable(states: readonly PersistenceState[]): PersistenceState | null {
  return [...states].sort((a, b) => PRECEDENCE[a] - PRECEDENCE[b])[0] ?? null;
}
