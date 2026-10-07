# Recovery cases

## RC-001 — Lost acknowledgement
A retry after lost sync acknowledgement is idempotent or safely deduplicated.

## RC-002 — Process kill
Locally saved work survives process termination/restart.

## RC-003 — Hub unavailable
Pending work remains visible and recoverable during prolonged hub outage.

## RC-004 — Concurrent edit
Conflicting score edits preserve evidence and require deterministic/human resolution rather than silent overwrite.

## RC-005 — Backup replacement device
A verified backup restores on a supported replacement-device flow without overwriting an existing installation unexpectedly.

## RC-006 — Interrupted migration
Database migration either completes safely or recovers/rolls back without silent data loss.
