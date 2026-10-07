# Scheduling cases

## SC-001 — Conflict detection

Teacher, section and room/lab overlaps are independently rejected.

## SC-002 — Fixed decisions

Locked human decisions remain fixed during generation/repair.

## SC-003 — Timeout semantics

Solver timeout/search stop is reported as no solution yet, not proven impossibility.

## SC-004 — Stale publication

A generated schedule based on stale assignments/constraints cannot be published.

## SC-005 — Atomic publication

Publication either installs one complete version-consistent schedule or leaves the previous active schedule intact.
