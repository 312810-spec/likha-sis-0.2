# Product

<!-- impeccable:product-schema 1 -->

**How this file was produced**: per `reference/init.md`'s own interview
protocol, a probe round is normally required before inferring product
truth from a brief alone. That probe is genuinely not needed here — the
user's own directing prompt for this UI-first program supplies
answers to all three of init's core questions (primary user/job,
product mechanism/position, durable constraints/assets to preserve) in
more depth than a typical three-question round would produce, and this
project's own long-standing `CLAUDE.md`/`docs/PROJECT-MEMORY.md`
independently corroborate every fact below. Per the skill's own
"infer from the brief alone... state the substitution" allowance, this
substitution is disclosed here rather than pausing this already-directed
autonomous session to re-ask what has already been answered.

## Platform

adaptive

Windows desktop is the primary target today; Android is an explicit,
named future target (`docs/PROJECT-MEMORY.md`: "Primary targets: Windows
desktop, Android mobile"). This genuinely is one product whose design
language adapts per OS (desktop density/keyboard-first vs. touch-first
mobile patterns — see UX-07 in the roadmap), not a native wrapper around
a website, so `adaptive` is the accurate platform value, not `web`.

## Stack

Existing codebase: React + TypeScript + Tauri 2, SQLite (SQLCipher-
encrypted) as the device working database. Not a greenfield decision —
already built through M0-M20 and this session's UI-First Program start.

## Users

Filipino public-school teachers, the sole intended audience of this
application today (no admin/registrar/principal role exists yet — see
`docs/product/M8-DECISION.md`'s Roles & Permissions follow-up, still
deferred). Often working on a shared school computer, with varied
digital confidence, vision, and dexterity — not assumed to be highly
tech-literate. Their job: run the day-to-day administrative work of a
classroom — mark attendance, maintain a class record, enter and compute
grades under DepEd's rules, and produce the exports/reports DepEd or
their own records require — reliably, offline, and without needing IT
support.

## Product Purpose

LIKHA-SIS gives a teacher a local, secure, offline-capable system of
record for their own classroom: learners, sections, attendance, grading
periods, assessment scores, and DepEd-aligned grade computation and
report/export output — without requiring school-wide infrastructure,
a paid service, or a network connection to function.

## Positioning

Local-first and genuinely offline-capable, not "offline-tolerant" cloud
software — writes persist to an encrypted on-device database
immediately, with no dependency on a live connection for any core
teacher workflow (a neighboring cloud-first SIS could not truthfully
claim this). Grade computation is DepEd-order-traceable: every
implemented weighting/transmutation rule cites the specific DepEd Order
it comes from (`docs/adr/0013-deped-grade-computation.md` and
successors) rather than a generic configurable gradebook a competing
product might ship instead.

## Operating Context

- A shared Windows desktop computer in a Philippine public school,
  used by one or more teacher accounts, sometimes with unreliable or
  no internet connectivity.
- Daily/weekly rhythms: marking attendance per section per school day;
  entering assessment scores through a grading period; producing a
  monthly attendance summary and, at term end, a report card export.
- DepEd-issued grading policy documents (Orders, memoranda) are the
  actual source of truth for weighting/transmutation rules and change
  over time — this app tracks specific Order numbers per rule, not a
  single frozen assumption.
- A teacher's session is expected to survive being left idle for a
  while (a lesson, a meeting) without silently discarding unsaved work,
  but must also protect the shared computer via account lockout and
  idle-session timeout (see ADR-0019/0020/0026).

## Capabilities and Constraints

Confirmed, already built (see `docs/PROGRESS-MAP.md` for the full list,
not restated here): local authentication with account lockout and idle
timeout, encrypted local storage, learner/section management, daily
attendance and monthly summaries, grading periods and DepEd-sourced
weight policies, assessment items and score entry, term-grade
computation, CSV exports (SF2-inspired attendance, report card, learner
roster), an authentication audit log, and a Teacher Workspace landing
screen.

Constraints:

- Zero paid infrastructure/billing without explicit approval.
- Synthetic data only in development, tests, fixtures, demos, and any
  AI-assisted work — never real learner/teacher PII.
- All SQL lives in Rust; the frontend never constructs SQL.
- UI/domain code must not import Tauri or infrastructure adapters
  directly — only `src/composition.ts` does.
- Official DepEd form layouts (SF2, report card) are not to be
  restyled for visual taste — their factual structure is fixed by the
  DepEd source they're inspired by.
- No DepEd seal, government marks, the Philippine flag, or school
  branding may be used or implied as official endorsement.
- Three teacher interface modes (Efficient/Comfortable/Guided) must
  retain full functional parity always — no mode is a lesser or
  restricted version of another.

Explicitly undecided/out of scope for the current UI-first program
(named directly by the user): password reset/account recovery,
roles/permissions, production real-PII handling.

## Brand Commitments

Product name: **LIKHA-SIS**. No existing logo, formal brand guideline,
or visual identity system exists yet — this UI-first program's DESIGN.md
is the first deliberate visual-identity decision for the product, not a
refresh of an existing one.

## Evidence on Hand

No real learner/teacher data, screenshots, testimonials, or case studies
exist or may be fabricated (synthetic-data-only constraint above). The
existing shipped screens and their current CSS (`src/ui/theme/styles.css`)
are the incumbent visual implementation — evidence for `document`/
`new-work` to treat as either extension basis or anti-reference, not
user-approved final direction (no DESIGN.md has ever existed for this
project before now).

## Product Principles

1. **Privacy/security first, always** — never trade correctness,
   privacy, accessibility, or teacher efficiency for visual spectacle
   (the user's own explicit instruction for this program, consistent
   with this project's pre-existing priority order).
2. **Offline reliability is a product promise, not a fallback** — every
   core teacher workflow must work with no connection, and the UI must
   never imply a "syncing..." dependency that doesn't exist yet.
3. **Trustworthy over impressive** — a teacher on a shared computer
   needs to trust what a save/mark/export state is telling them; calm,
   certain feedback beats celebratory or decorative feedback.
4. **One coherent system, not per-screen redesigns** — build the shared
   token/component vocabulary once (UX-01) and apply it consistently,
   rather than polishing screens individually into inconsistent looks.
5. **DepEd correctness is non-negotiable** — no visual or interaction
   change may alter a grading computation, an official-form layout's
   factual structure, or a compliance-relevant disclosure.

## Accessibility & Inclusion

WCAG 2.2 AA is the explicit target for this UI program (contrast,
focus, keyboard operability, touch target sizing, 200% zoom/reflow,
`prefers-reduced-motion`). Teachers are assumed to have varied vision,
dexterity, and digital confidence — this is a product-specific
requirement, not a generic accessibility disclaimer. Reduced motion is
a distinct accessibility preference from the three teacher interface
modes and must never be inferred from mode, device, age, or role.
