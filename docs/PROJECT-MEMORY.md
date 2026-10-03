# Current project facts

Updated 2026-10-02. Historical milestone records remain in
`docs/harness/archive/PROJECT-MEMORY-before-reset.md`; they are evidence/history,
not current harness or legal-policy development authority.

- Canonical working implementation: `312810-spec/likha-sis-0.2`.
- Main snapshot inspected: `3e7a2508da0f82c662b133e28117a9be4f0f06e6`.
- Stack: React/TypeScript/Vite, Tauri 2/Rust, encrypted device SQLite/SQLCipher.
- Platform keys: Windows DPAPI implemented; Android Keystore is not implemented.
  Current non-Windows application DB startup returns a key-store error.
- Layering: UI -> application services -> domain ports -> infrastructure/platform.
  Local saves precede a separate synchronization subsystem.
- School laptop is the chosen initial sync authority. A hosted authority or
  multi-master design has not been adopted by this study.
- Adviser daily attendance and subject attendance are separate concepts.
- Current source includes assignments, learners, scoring/grading, attendance,
  local sessions, outbox/conflict foundations and derived report/export work.
- Native Windows crash/recovery, key portability and packaged-device evidence
  remain outstanding. Android support cannot be inferred from Tauri support.
- New development authority: AGENTS.md and HARNESS.md, with TASK.md continuation.
  No frozen harness, numeric certification, fixed retry limit or blanket
  legal-policy development gate. Use synthetic development fixtures and continue
  reversible prototypes when an official source is missing; label uncertainty.
- No actual installer/APK or token-saving benchmark was produced by the study.
  The five-expert review is AI-assisted architecture research, not a teacher pilot.

Read only relevant ADRs or archive sections when historical evidence is needed.
Current source/tests and user instructions override stale historical claims.
