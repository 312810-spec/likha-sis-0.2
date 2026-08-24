# ADR-0025 — Learner Roster CSV Export

Status: Accepted

## Context

Selected by a fresh, evidence-based 20-scenario-style scoring pass run
after the user-directed sequence (Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace) completed and the user
confirmed: "run a fresh evidence-based scoring pass now rather than
choosing a fifth item ad hoc." Full scoring table and rationale:
`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`. This closes item
#15 ("data export/backup") from `docs/product/M8-DECISION.md`'s original
20-scenario candidate list — the highest-scoring candidate (8.10,
next-best 6.30), driven by near-perfect Dependency Readiness, Reuse, and
Architectural Fit against strong Teacher Value.

## Decision

**Scoped deliberately to a CSV export of already-visible learner data,
not a database/encryption-key backup.** "Data export/backup" is
ambiguous, and the harder interpretation — a raw copy of the
SQLCipher-encrypted database file — was considered and rejected for this
pass: the DPAPI-protected key (`docs/adr/0003-encryption-at-rest.md`) is
bound to the Windows user/machine, so a raw file copy is only restorable
on the same machine/account and is useless against the actual disaster
scenario a backup exists for (machine loss/theft) unless the key
material is also exported — and exporting key material safely is its
own unresolved security design question, not something to bundle into
this pass. See `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`'s
"Scope decision" section for the full reasoning.

Instead: `export_learner_roster` writes one CSV row per learner
currently enrolled at the caller's school (Given Name, Family Name,
LRN, Sex, Enrolled On) to `<Documents>/LIKHA-SIS/`, reusing the exact
`export::csv` / `FieldDisclosure` architecture M10 (SF2) and M14 (report
card) already established and had independently reviewed — no new
pattern, no new authorization surface, no new PII exposure (every field
is already readable by that session in `LearnerListScreen`).
`school_id` is derived from `sessions.require_active_school_scope`,
never a parameter, same convention as every other command. A teacher
triggers it from a new "Export learner list (CSV)" button on
`LearnerListScreen`, shown only once at least one learner exists.

## Consequences

- New `src-tauri/src/export/learner_roster.rs`
  (`build_learner_roster_export`, 6 unit tests) and
  `commands::export::export_learner_roster` (registered in `lib.rs`).
- New Rust integration tests in `tests/export.rs`: a teacher can export
  their own school's roster, exporting requires a session, and the
  export never includes another school's learners (matches the existing
  SF2 isolation-test pattern exactly) — 3 new tests.
- New `src/domain/export.ts` `LearnerRosterExportResult` type,
  `ExportRepository.exportLearnerRoster()` port method, its
  `TauriExportRepository` implementation (`invoke("export_learner_roster")`
  with no arguments — matches `current_session`'s existing no-arg call
  shape), and `ExportApplicationService.exportLearnerRoster()`.
- `LearnerListScreen.tsx` gained an `exportService` prop, an export
  button, and a result banner showing the saved file path and the
  disclosure's omitted fields (birthdate/guardian contact were never
  collected; section/grade data has its own dedicated exports already).
  `App.tsx` now passes `exportService` through.
- **Verification actually run this session**: `cargo nextest run`
  308/308 (up from 305, 6 new pure unit tests + 3 new integration
  tests), `cargo clippy --all-targets -D warnings` clean. `npm run
quality` 302 TS tests (up from 295) green, typecheck/lint/format/
  architecture-boundary all clean. `npm run build` succeeds. `npx knip`
  — same 5 pre-existing findings, zero new (confirms the new export path
  is genuinely wired in, not dead code).
- **Independent review**: not dispatched — same standing agent-resume
  note as ADR-0019 through ADR-0024. Read-only export of data the
  session can already see; no new authorization surface. Self-review:
  confirmed `school_id` is exclusively session-derived (never a client
  parameter, matching every other export command); confirmed no field
  exported here is not already visible in `LearnerListScreen`; confirmed
  the filename is passed through the existing
  `sanitize_filename_component` (Windows-reserved-character) guard, same
  as SF2/report-card.
- Not implemented (deliberately out of scope, see "Decision" above): any
  form of raw database or encryption-key backup/export. If a real
  disaster-recovery need surfaces later, it needs its own dedicated
  security-design decision process, not a bundled addition here.
