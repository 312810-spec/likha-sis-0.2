# ADR-0005 — App Shell & First Learner UI Vertical Slice (M5)

Status: Accepted

## Context

M1–M4 built persistence, encryption, an Application Services layer, and
authentication/authorization — but nothing had ever rendered. M5 needed
to prove the full stack end-to-end (`UI -> Application Services ->
Domain -> Repository Ports -> Infrastructure/Platform Adapters`) with a
real screen, while establishing the Efficient/Comfortable/Guided
teacher-experience modes from `CLAUDE.md` as an actual mechanism, not
just a documented intent.

Constraint specific to this session: no browser, screenshot, or
rendering tool was available, so nothing here could be visually
verified — only what React Testing Library, `axe-core`, TypeScript, and
ESLint can check objectively. That boundary is recorded here rather than
worked around.

## Decision

**Composition root**: `src/composition.ts` is the one file allowed to
import concrete `infrastructure/tauri/*` classes and wire them into
`Application Services`. Screen components (`LoginScreen`,
`LearnerListScreen`) receive their services as props, never importing
`composition.ts` or a concrete repository directly — this is what makes
them independently testable with fake repositories, the same pattern
established for `Application Services` themselves in M3.

**Teacher mode mechanism — Recommended: a shared density/behavior toggle
via React context + CSS custom properties, persisted per-device in
`localStorage`.** `ModeProvider` stores the current `TeacherMode` and
writes it to `document.documentElement.dataset.teacherMode`; CSS
variables (`--spacing-unit`, `--font-size-base`, `--control-height`)
respond to that attribute per mode, and screen components read the mode
directly (via `useTeacherMode`) to conditionally render `Guided`-only
field hints. `localStorage` was chosen over the encrypted SQLite database
(ADR-0002/0003) deliberately: this is a per-device UI convenience with no
sensitivity, not app data, and storing it outside the encrypted DB keeps
that boundary clean.

Rejected: a mode system that only changes visual density (spacing/font
size) with no behavioral difference. An early version of this milestone
shipped exactly that — the independent design review caught it: `Guided`
looked identical to `Comfortable` except for bigger text, which is
"parity by vacuity, not by design," and a `.field-hint` CSS class existed
with no component ever using it. Fixed by having `Guided` mode render
genuine contextual help text under key form fields (which school, what
username, what learner name format) that `Efficient`/`Comfortable` don't
show — functional parity is preserved (nothing is hidden in any mode,
only additional help is shown), matching `CLAUDE.md`'s requirement.

**Authorization boundary respected, not re-implemented.** `LoginScreen`
and `LearnerListScreen` never accept or pass a `schoolId` — matching
ADR-0004, scope comes entirely from the session on the Rust side.
`AuthApplicationService`/`LearnerApplicationService`'s validation is
explicitly documented (in their own source) as a client-side UX
convenience only; the real enforcement was already proven independently
in M4's Rust integration tests, not re-proven here.

**Verification approach, given the tooling constraint.** React Testing
Library (jsdom) proves component behavior, state transitions, and
structural accessibility (labels, roles, keyboard operability) precisely.
It does not prove visual layout, color contrast, or "premium" look and
feel. Contrast was instead verified by computing WCAG relative-luminance
ratios directly from the CSS hex values (not estimated) during the
accessibility review — this caught a real, blocking finding
(`--color-border` was ~1.3–1.6:1 against page/surface backgrounds
project-wide, need 3:1 for UI component boundaries per WCAG 1.4.11) that
would not have been visible without either real rendering or doing the
math. Both are recorded as review findings below, not asserted as
"verified" in the sense a rendered screenshot would allow.

## Independent reviews and what they found

Two reviews ran, both explicitly told they had no rendering/screenshot
capability either and instructed not to claim visual verification.

**Design/teacher-comfort review** — one blocking finding (fixed):
`LoginScreen` caught every login failure, including `ValidationError`s,
and overwrote them all with one generic message — inconsistent with
`LearnerListScreen`'s already-correct handling of the same case. Three
should-fix findings (fixed): the mode system was token-only (see above);
the schools dropdown had no loading state, so "No schools available"
could flash false during a real fetch; enrolling a learner had no visible
confirmation beyond the list silently growing by one row.

**Accessibility review** — one blocking finding (fixed): `--color-border`
contrast (see above). Should-fix findings (fixed): no focus management on
screen transitions (now: each screen's heading is `tabIndex={-1}` and
focused on mount); the mode switcher's "pressed" state relied on color
alone (now: a `::before` checkmark plus bold weight, alongside the
existing `aria-pressed`/color change, per WCAG 1.4.1); loading text
wasn't in a live region (now: `role="status"`); placeholder `<option>`s
weren't marked `disabled`.

Both reviews independently and explicitly stated their review was
code-level/computed only, not visual, and that a human (and
screen-reader) pass in the actual running app is still required before
this UI can be called visually or experientially finished.

## Consequences

- New files: `src/composition.ts`;
  `src/ui/{AppShell,LoginScreen,LearnerListScreen}.tsx`;
  `src/ui/theme/{modes.ts,mode-context-value.ts,ModeContext.tsx,useTeacherMode.ts,styles.css}`;
  `src/test/a11y.ts` (a thin `axe-core` wrapper — `vitest-axe` was tried
  first and dropped: it is unmaintained at v0.1.0 and its type
  augmentation doesn't match installed Vitest 4.x).
- `App.tsx` rewritten as the top-level state machine: checking session ->
  sign-in or learner list, wired through `composition.ts`.
- Known, explicitly-deferred items, not required for this milestone: the
  repeated "cancelled-flag + fetch + finally" `useEffect` pattern across
  three components (candidate for a shared hook, flagged as a nit, not
  urgent); `aria-invalid`/`aria-describedby` linking error banners to
  specific fields (current self-descriptive error text was judged
  acceptable by the accessibility review); a skip link (low priority for
  a single-`<main>` layout).
- **Outstanding, not addressed by any automated tooling**: a human visual
  and screen-reader pass on the actual running app. This is not optional
  polish — it is the verification step this session's environment could
  not perform, and it should happen before this UI is considered done in
  the same sense M1–M4's Rust work was (empirically, not just by design).
