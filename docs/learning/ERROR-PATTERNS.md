# Error Patterns

Not a transcript, not a bug backlog. An entry belongs here only if it
could prevent the **same class** of mistake recurring in a different
future task — a generalized rule, not a one-off note. Prefer executable
prevention (a test, a lint rule, a DB constraint, an architecture check)
over prose; this file exists for the cases where the automated
prevention already exists elsewhere and needs a pointer, or where none
exists yet and the rule has to live here until it does.

Format per entry: issue → root cause → generalized rule → prevention →
reference.

## Client-supplied tenant scope

**Issue**: an early draft of authentication shipped an unauthenticated
bootstrap path that let anyone self-grant access to an existing school.
**Root cause**: trusting a caller-supplied identifier for a
security-relevant scope instead of deriving it from a trusted source.
**Rule**: `school_id` (or any tenant-scope identifier) is never a
client-supplied parameter for tenant-data commands — it is always
derived server-side from the authenticated session. **Prevention**:
`SessionManager::require_active_school_scope`/`require_active_session`
is the single required gate every protected command goes through;
enforced by convention and integration tests proving cross-school
isolation for every new command. **Reference**:
`docs/adr/0004-authentication-and-local-session.md`,
`.claude/rules/security-privacy.md`.

## Check-then-act races on uniqueness invariants

**Issue**: an "at most one X per Y" invariant (e.g. one open section
membership per learner) is unsafe to enforce with a `SELECT` to check
followed by an `INSERT`/`UPDATE` — two concurrent connections can both
pass the read before either commits. **Root cause**: SQLite (and most
databases) do not invalidate an already-established read snapshot just
because a concurrent connection committed since. **Rule**: a real
uniqueness/cardinality invariant must be enforced by a database
constraint (a unique index, ideally a partial one for "at most one
active row"), never by application-level check-then-act alone.
**Prevention**: real unique partial indexes in migrations, with a test
proving the constraint itself rejects a violation, not just that the
application code happens not to trigger one. **Reference**:
`docs/adr/0008-section-foundation-and-attendance-semantics.md`
(`section_memberships`), `auth::bootstrap_installation`'s
`installation_repo::claim_bootstrap_slot`.

## Formula/injection risk in generated exports

**Issue**: a CSV field starting with `=`, `+`, `-`, `@`, or a tab can
execute as a formula when the file is opened in a spreadsheet
application (CSV/formula injection); an unstripped `:` in a Windows
filename can create an NTFS alternate-data-stream. **Root cause**:
teacher-entered free text was written into export output without
neutralization. **Rule**: every value that reaches a generated
export — file content or filename — goes through the shared
sanitization helper, not ad hoc per-export escaping. **Prevention**:
`export::csv`'s leading-character neutralization and
`export::sanitize_filename_component`, both with dedicated malicious-
value tests; every new export (`sf2`, `report_card`) reuses these
rather than writing its own. **Reference**:
`docs/adr/0009-sf2-export-and-official-form-engine.md`.

## DepEd compliance facts must be verified, never guessed

**Issue**: repeated temptation across milestones to fill a
DepEd-specific gap (a weight table, a transmutation curve, a form field)
from training-data recall or a single secondary source. **Root cause**:
DepEd policy is genuinely revised over time (e.g. DO 8 s.2015 repealed
by DO 015 s.2026) and even secondary web sources actively disagree with
each other on some tables. **Rule**: never implement a DepEd-specific
number or rule from memory. Either read the actual primary-source
document directly (as M13 did — visually transcribing a scanned PDF),
or corroborate with at least two independent secondary sources that
agree — and if sources disagree, that disagreement itself is a stop
signal, not something to average or guess past. **Prevention**: no
automated check possible here (data, not code) — the discipline is the
prevention. Every ADR touching DepEd data (0009, 0013, 0015, 0016, 0017) records its exact source trail so the next session doesn't have
to re-verify from scratch, and records explicitly what was **not**
confirmed rather than implying full coverage. **Reference**: see the
Grade 12 DO 8 s.2015 transmutation-table research notes in
`docs/CURRENT-HANDOFF.md` (2026-08-24) for a concrete case where this
rule stopped an implementation.

## Focus management when swapping DOM state in place

**Issue**: `LearnerListScreen`'s inline "Edit" affordance removed the
focused "Edit" button from the DOM when swapping a row into edit mode,
leaving keyboard/screen-reader focus at the document body with no
warning. **Root cause**: a state-driven conditional render that removes
the currently-focused element has no default focus target — the browser
does not pick one for you. **Rule**: any UI change that conditionally
replaces a focused element's subtree must explicitly move focus
somewhere sensible in the same state transition (the first field of a
newly-revealed form, or back to the control that triggered the
transition), the same way `LoginScreen`/every screen's initial-mount
`headingRef.current?.focus()` pattern already does for screen changes.
**Prevention**: a `useEffect` keyed on the state transition that calls
`.focus()` on a ref to the right element; a test asserting the field
`toHaveFocus()` after the transition, not just that the transition
rendered correctly. **Reference**: `docs/adr/0019-account-lockout.md`'s
self-review addendum, `src/ui/LearnerListScreen.tsx`,
`src/ui/LearnerListScreen.test.tsx`.

## Tests that inject a fixed clock into the service but not the component

**Issue**: `AttendanceScreen.test.tsx` and `MonthlySummaryScreen.test.tsx`
each construct their `AttendanceApplicationService` with a fixed
`now: () => new Date("2026-08-24")`, but the screen components
themselves (`AttendanceScreen.tsx`'s/`MonthlySummaryScreen.tsx`'s own
`todayAsIsoDate()`) read the real system clock independently for the
date picker's default value. Discovered when the real date advanced
past the tests' hardcoded date mid-session: the component's picker
defaulted to the new (real) date, the service's fixed-clock validation
correctly treated that as "in the future" relative to its own frozen
`now`, and every write silently failed validation — 3 tests failed with
a `waitFor` timeout, not an obvious error message pointing at the real
cause. **Root cause**: only half of a date-dependent UI test's clock
was frozen — the injected service dependency, not the component's own
direct `new Date()` call — so the two "today"s can drift apart the
moment real time crosses whatever boundary the test's fixed date sits
near (a day, for `AttendanceScreen`; a month, for `MonthlySummaryScreen`,
which is why its identical bug stayed invisible until fixed
preemptively rather than waiting for it to fail). **Rule**: any test
that injects a fixed `now` into a service under test must also freeze
the _actual system clock_ (`vi.useFakeTimers({ toFake: ["Date"] })` +
`vi.setSystemTime(...)`, faking `Date` only, not timers, so
`userEvent`'s own internals are unaffected), so nothing in the
component tree can observe a different "today" than the test assumes.
Injecting a fixed clock into only one of "the component" and "the
service it calls" is not sufficient — freeze the whole test's world.
**Prevention**: both files' `beforeEach`/`afterEach` now do this; a
future date-dependent test file should copy this pattern rather than
only injecting the service's `now`. **Reference**:
`src/ui/AttendanceScreen.test.tsx`, `src/ui/MonthlySummaryScreen.test.tsx`,
`docs/product/COMPOUNDING-ENGINEERING-DECISION.md`'s verification notes
(2026-08-25).

## Wrapping a function: forwarding `undefined` is not the same as omitting the argument

**Issue**: `src/infrastructure/tauri/invoke.ts` wraps Tauri's own
`invoke(command, args?)` to add a side effect (notify a listener on an
authorization failure). Its first draft always called
`tauriInvoke(command, args)`, even when a caller omitted `args`
entirely (so `args` was `undefined`). Wiring the wrapper in immediately
broke 12 tests across 9 repository files — every test asserting the
exact arguments the mocked `invoke` was called with. **Root cause**:
`fn(command, undefined)` and `fn(command)` are observably different
calls (`arguments.length`/call-shape differs), even though both pass
`undefined` for the missing parameter conceptually — a caller-inspectable
difference, not just a style preference. **Rule**: when wrapping a
function that has an optional parameter, forward exactly as many
arguments as the actual caller passed, rather than always passing the
full arity with `undefined` filled in — don't assume "optional
parameter with value `undefined`" and "parameter omitted" are
interchangeable for whatever you're forwarding to. **Prevention**: the
wrapper now branches (`args === undefined ? fn(command) : fn(command, args)`);
covered by a dedicated test asserting the mocked call's argument count,
not just its resolved value. **Reference**:
`docs/adr/0022-global-session-expiry-handling.md`,
`src/infrastructure/tauri/invoke.ts`, `src/infrastructure/tauri/invoke.test.ts`.

## Independent-review agent-resume unreliability

**Issue**: dispatching `security-reviewer`/`architecture-reviewer`/
`teacher-ux-reviewer`/`accessibility-reviewer` agents in the background
sometimes does real work (confirmed by token/tool-use counts) but
returns no retrievable findings text, even after one resume attempt.
Recurred across M7, M8, M12a, M12b, and the M12c-M18 UI sweep. **Root
cause**: unresolved harness-level issue with this environment's
agent-resume/completion-retrieval path, not something fixable from
within a session. **Rule**: attempt a dispatch once, and at most one
resume retry — do not repeatedly spend context trying to recover a
known-broken reviewer result. **Prevention**: when retrieval fails,
perform a rigorous self-review instead, record the failed attempt
honestly, retain the review as real outstanding debt (not silently
dropped), and continue — codified in
`.claude/rules/autonomous-development.md`'s "Reviewer harness failures
are not automatic stops" section. **Reference**: `docs/CURRENT-HANDOFF.md`'s
recurring "Independent-review agent-resume issue" notes.
