# Grading cases

## GR-001 — Blank is not zero
Missing score, explicit zero, excused/not-applicable and future assessment remain distinguishable through computation and UI.

## GR-002 — Boundary transmutation
Exact values immediately below/at/above each applicable threshold produce the expected result under the versioned grading profile.

## GR-003 — Provisional versus complete
A numeric result can exist while the record remains visibly provisional when required components are incomplete.

## GR-004 — Historical stability
Changing the current grading profile never silently changes a previously issued historical snapshot.

## GR-005 — Correction trail
A corrected score retains prior value, reason, actor/time evidence required by the model, and recomputes only the affected draft/current projection.
