# ACTIVE PLAN

Updated: 2026-09-17

## Canonical current slice

Current main includes PR #95 (`7f1442c28f718451d577b9a1bc220d3b82f73bd9`), which added the trusted month-end-authorized Adviser Room monthly attendance preview.

Active branch: `feat/adviser-sf2-export-authorization`.

Goal: add the smallest adviser-authorized wrapper around the existing truthful SF2-inspired monthly CSV export.

Scope:

- reuse `auth::authorize_adviser_of_section` at the same last-calendar-day authorization point as the monthly preview;
- allow the active adviser or a School Head in the same school;
- reuse the existing `attendance::monthly_grid_for_section` and `export::sf2::build_sf2_export` behavior;
- preserve the existing `FieldDisclosure` unchanged;
- keep the output explicitly SF2-inspired, not submission-ready official SF2;
- invalid months and unauthorized callers fail closed before export data is built;
- synthetic tests only;
- no schema, sync, daily attendance, Subject Attendance, or official-template fidelity changes.

Verification required before merge: exact-head Quality Gate + independent Security Gate, unchanged head, mergeable PR, and no real review blocker.

## Next

After this wrapper is green and merged, continue the Adviser Room journey from live repository evidence. Official-template work must not begin until authoritative template/layout evidence is sufficient to preserve the project's official-form fidelity rules.

GJ-7 hardware/runtime debt remains separate: real process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows verification are still unproven and must not be represented as complete.
