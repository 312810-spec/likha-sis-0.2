# ADR-0027 — Self-Review Findings for the M12c-M26 UI Sweep

Status: Accepted

## Context

Part of the M12c-M26 independent-review dispatch this session
(`teacher-ux-reviewer` and `accessibility-reviewer`, per the scoring
pass's #1 runner-up, `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`).

**`teacher-ux-reviewer` outcome**: the agent ran and did real work (26
tool uses, ~94k tokens across two attempts — an initial run plus one
resume), but its actual findings text was never retrievable, even after
the one resume attempt this project's established escalation rule
allows (`.claude/rules/autonomous-development.md`'s "Reviewer harness
failures are not automatic stops"). The agent's own final message on
both the initial run and the resume claimed its findings had already
been delivered, but neither delivery was visible in the completion
notification. This matches the exact recurring agent-resume/retrieval
class of issue already documented for `security-reviewer`/
`architecture-reviewer` across M7/M8/M9/M12a/M12b and now
`teacher-ux-reviewer`/`accessibility-reviewer` across M12c-M18. Per the
established rule, no further retry was attempted; a careful self-review
was performed instead, covering the same areas the dispatch prompt
asked for (clarity, jargon, Guided-mode hint coverage, confirmation on
destructive/hard-to-reverse actions, overall flow trustworthiness)
across all 12 screens under `src/ui/` touched since M12c.

**`accessibility-reviewer` outcome**: hit the identical failure mode —
real work done (31 tool uses, ~124k tokens across the initial run and
one resume attempt), no findings text ever retrievable even after the
one resume. Per the same escalation rule, a self-review was performed
instead, covering the same areas the dispatch prompt asked for (color
contrast of the new `--color-warning`/`--color-warning-surface` tokens,
focus management across state transitions, keyboard operability, ARIA
role correctness, touch target sizing).

## Self-review finding: raw ISO timestamps shown to teachers

**Real, concrete, fixed.** `AuditLogScreen.tsx`'s "When" column and
`TeacherWorkspaceScreen.tsx`'s "Recent sign-in activity" list both
rendered `entry.createdAt` directly — a raw ISO-8601-with-milliseconds
string straight from SQLite's `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
storage format (e.g. `2026-08-25T08:00:00.000Z`), never intended for a
teacher to read. This is the exact same category of gap M12c already
fixed once for `ClassRecordWorkspace.tsx`'s "Saved HH:MM" note
(`formatSavedTime`) — but that fix was never extended to the two audit-
log-consuming screens added afterward (ADR-0021, ADR-0024), so the gap
resurfaced. A non-technical teacher would have seen a raw machine
timestamp string with no formatting, which fails this project's own
teacher-usability bar.

**Fix**: both screens gained a local `formatWhen(createdAt: string)`
helper (`toLocaleString` with year/month/day/hour/minute, falling back
to the raw string if the value doesn't parse as a real date — the same
"never show 'Invalid Date' to a teacher" discipline `formatSavedTime`
already established). Kept as two small local functions rather than a
shared utility module, matching this codebase's existing precedent
(`ClassRecordWorkspace.tsx`'s own local `formatSavedTime` was never
extracted either) and this project's "three similar lines beats a
premature abstraction" rule.

## Self-review finding: `IdleTimeoutWarning`'s ARIA role overclaimed modal semantics

**Real, concrete, fixed.** `IdleTimeoutWarning.tsx` (ADR-0026, built
earlier this session) used `role="alertdialog"`. Per WAI-ARIA authoring
practices, `alertdialog` describes a genuine modal dialog: assistive
technology is entitled to expect it traps focus, receives focus on
appearance, and blocks interaction with the rest of the page until
dismissed. This component does none of that — it's a non-modal banner a
teacher can freely ignore while continuing to work elsewhere, matching
every other banner in this app (`error-banner`/`confirmation-banner`,
both plain `role="alert"`/`role="status"`). Using `alertdialog` without
the modal behavior it implies would mislead a screen reader user into
expecting interaction patterns (e.g. Escape to dismiss, trapped Tab
order) that silently don't work.

**Fix**: changed to `role="alert"` — announced immediately, same as
every other banner in this app, without claiming modal semantics the
component doesn't have. No focus-stealing needed either: `role="alert"`
is specifically for a non-modal, time-sensitive announcement that
doesn't move focus, which is exactly the right behavior here (a teacher
mid-task should hear the warning without losing their place).

**Also checked and found clean** (no fix needed): contrast of the new
`--color-warning`/`--color-warning-surface` tokens computed by hand
against WCAG AA's 4.5:1 text bar — light mode `#8a5a00` on `#fbf1de` is
≈5.3:1, dark mode `#e8c07d` on `#3a2f14` is ≈7.7:1, both comfortably
passing (dark mode clears AAA's 7:1 bar too). The "Stay signed in"
button is a plain keyboard-operable `<button>`, reusing the existing
`.button-primary` class already used and reviewed elsewhere.

## Consequences

- `src/ui/AuditLogScreen.tsx` and `src/ui/TeacherWorkspaceScreen.tsx`
  now format `createdAt` for display.
- `src/ui/IdleTimeoutWarning.tsx` now uses `role="alert"`, with a code
  comment explaining why `alertdialog` was wrong.
- 5 new/updated tests: `AuditLogScreen.test.tsx` gained a readable-format
  test and a doesn't-parse fallback test; `TeacherWorkspaceScreen.test.tsx`
  gained a readable-format test; `IdleTimeoutWarning.test.tsx`'s existing
  role queries updated from `alertdialog` to `alert`.
- **Verification actually run this session**: `npm run quality` 313 TS
  tests green, typecheck/lint/format/architecture clean. No Rust change.
- This finding and fix are recorded here specifically because they came
  from self-reviews substituting for two failed independent-review
  dispatches — per this project's disclosure convention, both review
  attempts' failures are recorded honestly (not silently dropped), and
  what each self-review actually caught is recorded as evidence the
  self-review was a real check, not just a formality.
- Real review debt still open: both `teacher-ux-reviewer` and
  `accessibility-reviewer` remain owed a real (non-self) pass on this
  UI sweep once agent-resume behavior is confirmed reliably working in
  a future session — matching the same standing note already carried
  for M7 through M18's own review debt.
