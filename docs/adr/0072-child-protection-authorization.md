# ADR-0072: DO 006, s. 2026 Child Protection Module — Authorization Model

Status: Accepted
Date: 2026-09-08

## Context

`docs/product/MASTER-TASK-INVENTORY.md` §2.3 calls for a DepEd DO 006,
s. 2026 Child Protection module: tiered behavioral incident logging,
multi-silo automated at-risk detection, and an append-only intervention
log. This data is real child-protection PII — behavioral incident
narratives about specific learners — and the task explicitly requires
tighter-than-ordinary tenant scoping: "a general Teacher must NOT get
blanket read access to another section's incidents."

### DO 006 tier-naming — sourcing-confidence disclosure

This session searched (`WebSearch`; no `deped-researcher` agent was
available) for DepEd Order No. 006, s. 2026's own official tier
vocabulary for classifying behavioral incidents under its "child
protection" / "safe learning environment" framework. **This session
could not confidently source the exact tier names or numeric thresholds
from a primary `deped.gov.ph` document within its research budget.**
Multiple DepEd child-protection issuances exist across different years
(DO 40, s. 2012's Child Protection Policy; various anti-bullying and
positive-discipline orders), and this session could not pin down DO
006, s. 2026's own specific text with the same confidence this project
applies to its other DepEd-sourced computations (e.g. DO 015's Annex D
grading algorithm, which was read directly).

Per ADR-0037's addendum precedent (flag a sourcing gap explicitly rather
than fabricate DepEd-specific vocabulary), this module uses a
**defensible generic 3-level severity scale** —
`level_1` / `level_2` / `level_3`, low to high severity — as its stored
values, rather than guessing at official terminology such as "minor /
moderate / major" or similar. **Confidence: LOW** that these are DO
006's own official tier names. This is recorded as open verification
debt in `docs/VERIFICATION-DEBT.md`: a future session should locate and
read the actual DO 006, s. 2026 text (or an authoritative secondary
source quoting it verbatim) and, if its tier names differ, migrate the
stored values and update every reference to them, including this ADR.

## Decision

### Data model (migration 44)

- `behavioral_incidents`: one row per incident, `severity_tier` (generic
  3-level, see above), `category`, `description`, `incident_date`, plus
  `resolved_at`/`resolved_by_user_id` for a status transition.
- `incident_interventions`: **append-only**. No repository function
  issues `UPDATE`/`DELETE` against this table. A correction or
  progress update is always a new row referencing the same incident,
  matching this project's existing audit-log append-only convention. A
  `resolution`-typed entry also flips `behavioral_incidents.resolved_at`
  (a status transition on the incident row, never a rewrite of its
  narrative `description`/`category`) — proven by
  `a_resolution_entry_marks_the_incident_resolved_without_rewriting_its_description`
  and `a_second_resolution_entry_does_not_overwrite_the_first_resolution_timestamp`.

### Authorization: section-adviser-or-School-Head, not a blanket role

The task requires tighter scoping than a bare `Capability` role check
can express (a `Capability` resolves to a fixed role set school-wide,
with no notion of "only this teacher's own section"). This module
reuses the exact pattern `docs/adr/0056-section-advisory-foundation.md`
already established for this class of problem —
`auth::authorize_adviser_of_section`'s self-or-School-Head shape — via
a new function, `auth::authorize_child_protection_access_for_section`:

- The section's **current adviser** (per `section_advisories`, as of the
  incident/query date) may read/write that section's incidents.
- A **School Head** may read/write any section's incidents in their own
  school (same cross-school forged-id guard `authorize_adviser_of_section`
  already proved necessary: `section_id` is independently verified to
  belong to the caller's own school before the adviser/role check runs).
- A bare **Teacher** with no adviser relationship to the target section
  is denied — proven by
  `authorize_child_protection_access_denies_a_teacher_who_does_not_advise_the_section`.

`Capability::ManageChildProtection` still exists (allowed roles:
School Head only) — it is the role half of the self-or-School-Head
check, exactly mirroring how `Capability::ManageSectionAdvisories`
relates to `authorize_adviser_of_section`. It is deliberately NOT used
alone to gate any command; every child-protection command goes through
`authorize_child_protection_access_for_section`.

**Why not extend `Capability::ManageHealthRecords` (Registrar, School
Head)?** Behavioral incidents are a distinct domain from nutrition
measurements, and — critically — nutrition records have no adviser
carve-out at all (Registrar/School Head, school-wide, per ADR-0071).
Reusing it here would either (a) give Registrar unrestricted school-wide
incident access with no adviser-of-record concept, wider than intended,
or (b) require bolting an adviser carve-out onto an unrelated capability
that other, already-shipped code depends on having a fixed meaning.
A new capability plus a dedicated authorization function keeps both
scopes independently correct.

**Command-level defense in depth**: `add_incident_intervention` and
`list_incident_interventions` additionally verify the target
`incident_id` actually belongs to the `section_id` the caller was just
authorized for — an adviser authorized for section A must not be able
to act on an incident forged to reference section A's `section_id`
parameter while actually stored under section B, if such a mismatch
could ever arise (defense in depth; not currently reachable through any
existing write path, matching this codebase's established practice of
guarding data even against theoretically-impossible-today mismatches).

### At-risk detection is NOT gated as its own capability

`get_at_risk_flags_for_section` uses the same
`authorize_child_protection_access_for_section` gate — at-risk status
is treated as child-protection-adjacent PII (which specific learners
are flagged, and why), not a separate, more widely-shared signal.

## Consequences

- A School Head retains full oversight (matching every other
  School-Head-oversight gate in this codebase); a section's own adviser
  gets exactly the access DO 006's "safe learning environment" framework
  implies they need for their own learners; no other Teacher role can
  browse incidents school-wide.
- If a school ever needs a Guidance Counselor role distinct from
  "section adviser," this authorization function is the natural place to
  add that carve-out — not a reason to revisit today, since no such role
  exists in this codebase yet (see the 2026-09-07 unbuilt-features audit
  on the undecided RBAC gap).
- DO 006 tier naming is flagged, low-confidence, generic placeholder
  vocabulary — tracked in `docs/VERIFICATION-DEBT.md`, not silently
  presented as verified DepEd terminology.

## Verification

- `cargo test` (whole crate): new tests in `db::migrations` (migration
  44), `repository::child_protection` (6), `repository::at_risk` (6),
  `auth` (4 new authorization tests), `commands::child_protection`
  (compiles, exercised indirectly by the repository/auth test coverage
  above — no separate command-level integration test was added this
  session, see "Retained debt" in the Batch 3 handoff entry).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean.
