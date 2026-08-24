# ADR-0023 — Learner Search / Filter for Large Rosters

Status: Accepted

## Context

Third item in the user-directed sequence (2026-08-25): Audit Log →
Global Session Expiry Handling → **Learner Search** → Teacher Workspace
→ reassess. Already scenario #5 in `docs/product/M8-DECISION.md`'s
original 20-scenario list (Low-risk/high-value). `LearnerListScreen`
rendered every learner in the school with no way to narrow the list —
fine for a handful of learners, not for a real class/school roster.

Checked the actual scale assumption before implementing: M17's own test
suite already proves the data layer stays fast and correct at 500 rows
(`the_learner_list_remains_correct_with_a_large_synthetic_roster` in
`tests/learner_management.rs`). The whole roster is already fetched in
one call and held in component state — this is a client-side filtering
problem, not a new query surface.

## Decision

A single search input above the list, filtering by given name, family
name, or LRN — case-insensitive substring match, computed on every
render from the already-loaded `learners` array (`filteredLearners`, a
plain `.filter()` call, no memoization added: 500 rows is trivial to
re-filter per keystroke, and adding `useMemo` speculatively would be
exactly the premature complexity `.claude/rules/architecture.md`/scope
discipline warns against). No backend change — the roster's shape and
`LearnerApplicationService.listLearners()` are untouched.

Three deliberate small decisions:

- The search box is hidden entirely until at least one learner exists
  (`!loading && learners.length > 0`) — no reason to show a search
  affordance over an empty list.
- "No learners match \"query\"" is a distinct message from "No learners
  enrolled yet." — a teacher searching an empty roster and a teacher
  whose search matched nothing are different situations that shouldn't
  share one ambiguous message.
- The search box disables while an edit is in progress (same guard
  already used for other rows' "Edit" buttons, from M17's self-review
  fix) — without this, typing into the search box could filter the
  row currently being edited out of the visible list entirely, leaving
  an in-progress edit orphaned with no visible Save/Cancel.

## Consequences

- `LearnerListScreen.tsx`: new `matchesSearch` helper, `searchQuery`
  state, `filteredLearners` derived value, search `<input type="search">`
  properly labeled (`htmlFor`/`id`), the roster `<ul>` now maps over
  `filteredLearners` instead of `learners`.
- 7 new tests: filters by name, matches against LRN, a distinct
  no-matches message, case-insensitivity, the search box is absent for
  an empty roster, the search box disables during an edit. Existing
  accessibility test (already exercises a learner with an LRN present)
  continues to cover the new field's label association.
- **Verification actually run this session**: `npm run quality` — 286
  TS tests (up from 280), typecheck/lint/format/architecture-boundary
  all clean. `npm run build` succeeds. No Rust change — confirmed by
  not touching `src-tauri/` at all this milestone.
- **Independent review**: not dispatched — same standing agent-resume
  note as ADR-0019-0022. UI-only, no new authorization surface, no new
  command; self-review focused on the one real edge case worth
  checking (search box vs. in-progress edit interaction), covered above
  and by its own test.
- Not implemented (deliberately out of scope): server-side/paginated
  search (the 500-row scale test says this isn't needed yet — revisit
  if a school's real roster size ever approaches a point where loading
  the full list client-side becomes the bottleneck, not before),
  fuzzy/typo-tolerant matching (exact substring match is simple,
  predictable, and sufficient for "find one learner by typing part of
  their name"), search-result highlighting (a nice-to-have, not
  requested, not needed to make the feature usable).
