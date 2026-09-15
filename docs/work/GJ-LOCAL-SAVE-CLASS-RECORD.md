# GJ local-save integration — Class Record

## Purpose

Integrate the already-merged `LocalSaveStatus` primitive into Class Record score rows as the smallest next Golden Journey slice.

## Evidence

`ClassRecordWorkspace` currently derives a short time from `entry.updatedAt` and renders `Saved HH:MM`. `LocalSaveStatus` already owns the truthful local-persistence vocabulary and renders `Saved on this device` with an optional valid timestamp while deliberately making no sync claim.

## Bounded implementation

- Import `LocalSaveStatus` into `ClassRecordWorkspace`.
- After a successful persisted score/status write, render `<LocalSaveStatus savedAt={entry.updatedAt} />` when the row has no save error and is not actively saving.
- Remove the workspace-local `formatSavedTime` helper and the ambiguous `Saved HH:MM` presentation.
- Add or update a focused regression test so Class Record proves the local-save wording and does not claim sync state.

## Guardrails

Do not change `LearnerScoreApplicationService`, score-write semantics, grade computation, grading period selection, DepEd weighting, assignment authorization/revalidation, schema, sync protocol, cloud dependencies, or Creation Studio authorization. No UI-owned academic formula. Synthetic test data only.

## Verification

One authoritative PR Quality workflow plus independent Security. Merge only when both are successful for the exact current head and the PR is mergeable.
