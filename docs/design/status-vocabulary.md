# Persistence & Sync Status Vocabulary

Status: **Active** — the canonical vocabulary for how LIKHA-SIS tells a
teacher where their data actually is. Introduced in Precision
Intelligence Wave C (ADR-0070 program). Consumed via
`src/ui/components/persistence-status.ts`.

## Why this exists

Local-first honesty is a program principle: the UI must clearly
distinguish _saved on this device_ from _sent to other devices_, and
must **never imply cloud/multi-device completion when only local
persistence has been proven**. Before this doc, each screen phrased
these states ad hoc (`SyncStatusScreen` used plain `<p>` text with no
non-color cue; attendance screens used a bare `StatusChip tone="neutral"`).
This file fixes the set, the wording, the non-color cue, and the tone so
every screen says the same thing the same way.

## The six states

Each state has: a **text label** (always carries the meaning — WCAG
1.4.1), a **non-color cue** (a distinct word/shape so the state survives
greyscale and color-blindness), a **`StatusChip` tone**, and a **rule
for when it may be shown**.

| State          | Label (default)        | Non-color cue        | `StatusChip` tone | May be shown when                                                                                                                                                                                   |
| -------------- | ---------------------- | -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saved-local`  | "Saved on this device" | word "device"        | `productive`      | A local write to the encrypted SQLite DB has returned success. This is the **most** you may claim immediately after any create/update.                                                              |
| `pending-sync` | "Waiting to sync"      | word "waiting"       | `warning`         | The change is saved locally **and** is queued to push to the sync hub, and no push failure is recorded yet.                                                                                         |
| `synced`       | "Synced"               | word "synced"        | `success`         | The sync layer has confirmed the change was accepted by the hub (`pendingChangeCount` for its scope is 0 / the change left the outbox cleanly). Never shown on the strength of a local write alone. |
| `offline`      | "Offline"              | word "offline"       | `neutral`         | This device is not enrolled for sync, or sync is intentionally not configured. It is **not** an error — local work is fully functional.                                                             |
| `conflict`     | "Needs your review"    | words "needs review" | `warning`         | The hub reported a conflicting change for this record; a human must choose a version on `ConflictReviewScreen`. Automation must never resolve it silently.                                          |
| `failed`       | "Sync failed"          | word "failed"        | `danger`          | A pending outgoing change has recorded at least one failed push attempt (`hasPendingSyncTrouble`). The change is **still safe locally**; the copy must say so and say retries are automatic.        |

### Ordering / precedence

When more than one could apply to the same record, show the **most
actionable** one: `conflict` > `failed` > `pending-sync` > `synced` /
`offline` / `saved-local`.

## Copy rules

- After a successful local save, the immediate feedback is the existing
  quiet convention (a transient "Saving…" then the control's own pressed
  state) — a persistent "Saved" chip is **not** added to every row. Use
  `saved-local` only where a screen genuinely surfaces persistence state
  as its subject (e.g. a review/finish summary), not as row noise.
- Never write "Saved to the cloud", "Backed up", or "Synced" as the
  confirmation of a local write. The only claim a local write earns is
  `saved-local`.
- `failed` copy always states the local copy is safe and that retry is
  automatic — it is a "having trouble reaching the hub" message, not a
  data-loss message.
- `offline` is phrased neutrally, never as a warning or a problem.

## `Alert` vs. `StatusChip`

- **`StatusChip`** — the at-a-glance state of one record or one summary
  line. Tone from the table above.
- **`Alert`** — only when the state needs a sentence of explanation or
  an action (a `failed` state with a Retry button, a `conflict` count
  with a "Review conflicts" link). `error`/`warning` tones are
  `role="alert"`; `success`/`info` are `role="status"` (unchanged from
  `Alert`'s existing contract).

## Consumers (as of Wave C)

- `SyncStatusScreen` — the "changes waiting to sync" card carries
  `synced` / `pending-sync` / `failed` (whichever applies), and the
  conflicts card carries `conflict` when the count is > 0. The other two
  cards (device-setup confirmation, last-received-update timestamp) are
  informational, not record-state, so they carry no chip.
- `ConflictReviewScreen` — each conflict card header carries a
  `conflict` chip.

Later waves (G attendance/roster, H grading, J forms, K admin/sync) adopt
the same helper as their screens are migrated. New adoptions must not
change any screen's behavior — only add the documented non-color cue.
