# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-18

Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

Current code, tests, migrations, PR state, and CI override stale prose.

## Current verified checkpoint

Current main: `3e7a2508da0f82c662b133e28117a9be4f0f06e6` (PR #99).

PR #99 merged the visible My Advisory monthly attendance panel: trusted monthly preview, Present/Absent/Tardy totals, and adviser-authorized SF2-inspired CSV export with the command-returned `FieldDisclosure`. Subject Attendance remains separate from official adviser attendance. The CSV remains explicitly non-official and not submission-ready SF2.

GJ-7 software recovery evidence from PR #90 remains valid. Real process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows proof remain verification debt.

## Current slice

Branch: `feat/safe-resume-pointer`.

Begin Golden Journey close/resume with the smallest safe primitive before wiring UI restoration:

- persist only a versioned navigation pointer bound to the signed-in user;
- class pointer stores only the canonical teaching-assignment id;
- advisory pointer stores only the advisory section id;
- never persist learner, score, grade, attendance, friendly subject/section labels, or room data in this pointer;
- treat persisted state as disposable navigation state, never authorization evidence;
- rebuild class display context only from current authorized assignment data;
- revalidate advisory section against current adviser authorization before restoration;
- discard corrupt, wrong-user, revoked/reassigned, or un-revalidatable pointers without touching academic records;
- synthetic tests only; no schema, sync, native authorization, secrets, deployment, or protection changes.

After this primitive is exact-head verified and merged, wire the bounded Continue Where You Stopped experience into Today/App lifecycle, preserving the same revalidation rules. Then continue school-year lifecycle. Hardware-only packaged Windows/process-crash recovery remains explicit verification debt until suitable hardware/runtime evidence exists.

## Continuation policy

Each run must inspect live main, open PRs, this handoff/plan, and exact-head CI. Maintain one canonical slice/PR. Merge only when Quality and independent Security are successful on the exact unchanged head, the PR is mergeable/not draft, and no real review blocker exists. Never weaken protections or gates.

When an issue occurs: **Issue → Workaround → Record**. Diagnose from evidence, apply the smallest safe workaround, verify it, record it durably, and consult the log before repeating investigation.

## Golden Journey

North Star: **LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.**

Completed through current main: class/learner context, class record/scoring, local-save truth, clean encrypted reopen recovery evidence, real advisory context, adviser-only official daily attendance, separate read-only Subject Attendance signals, trusted monthly preview, trusted SF2-inspired monthly export wrapper, TypeScript monthly application seam, visible My Advisory monthly preview/export panel, and durable troubleshooting memory.

Current: safe resume/recovery primitive. Next: bounded Continue Where You Stopped integration, then school-year lifecycle. Official-template work begins only with sufficient authoritative form/layout evidence.

## Locked constraints

Priority: `privacy/security > correctness > DepEd compliance > teacher usability > offline reliability > maintainability > zero billing > performance > speed`.

- SQLite is the device working database; offline writes save locally immediately; sync is separate.
- Authorization is enforced at trusted boundaries, never by UI hiding.
- School A must never access School B data.
- No real learner PII in development/tests/screenshots/fixtures/demos/AI prompts.
- No paid infrastructure/API without explicit owner approval.
- `AdvisoryWorkContext` is navigation state only, never authorization evidence.
- Subject teaching-assignment authority and advisory authority remain separate.
- Monthly CSV remains SF2-inspired, not submission-ready official SF2; preserve `FieldDisclosure`.
- Official forms require authoritative template fidelity.

## Offline/sync truthfulness

`Saved on this device` requires local persistence evidence; `Waiting to sync` requires durable queued-change evidence; `Synced` requires acknowledgment from the relevant school sync boundary; `Needs review` requires stored unresolved-conflict evidence; `Access changed` requires trusted authorization/scope evidence. Never infer sync state from connectivity alone.

## Durable references

- `docs/ACTIVE-PLAN.md`
- `docs/ISSUE-WORKAROUND-LOG.md`
- `docs/VERIFICATION-DEBT.md`
- `docs/PROJECT-MEMORY.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/adr/0009-sf2-export-and-official-form-engine.md`
- `docs/adr/0056-section-advisory-foundation.md`
