# M10 — append-only lesson source amendments

Branch: `ctos/m10-source-amendments-20261013`.
Parent: PR113 merge `4c365f117846ad1bd724d5189816f97676a9d794`, from verified
source-scope head `240c97ad125c0e396a20e318e246c99b0b8bcfb1`.
Implementation commit: `3ab817a18de04113750be26825dcd01c4467fbf4`.
Implementation tree: `673350cdceafdf734516bdf5f1a3e08dd909e6a3`.
Follow-up recovery assertion: `7f9909788e3cff97c8021c67750c940087bf8893`.
Parent reconciliation: `58d554997fe228b5dcc5386023b9090b096e2184`; its tree is
identical to its first parent (`2b4e2e27f04407f0e101f0882914e69e4234a257`).

## Outcome and contract

Teachers can correct a lesson's declared curriculum/BOW reference without rewriting
its original declaration. Each correction is a new append-only row containing the
previous and replacement reference, a required reason, the authenticated teacher and
timestamp. Reads resolve the latest correction while history exposes every prior
value. Database triggers reject update/delete, and a composite foreign key prevents a
lesson from being referenced through another school.

The native boundary authorizes the actual lesson and assignment before appending. A
declared subject/year scope is checked against the lesson's captured historical class
context, not today's mutable assignment. A legacy lesson without captured context may
still receive unscoped metadata, but scoped metadata is rejected rather than guessed.
No-op corrections, blank/overlong reasons, cross-assignment access and non-owner writes
are rejected. School Heads keep existing read-only access to correction history.

The UI keeps correction fields and reason in the retained teacher draft, labels the
operation as a correction, states that it does not verify an official source, and
shows version lineage with actor and timestamp. A confirmed write remains confirmed
even if the follow-up history read fails; only the history panel moves to retry.
Declared references remain unverified metadata. This slice does not ingest, approve,
or attest to any curriculum, BOW, competency or term.

## Verification and assurance

- Focused service/adapter/UI checks: 3 files / 36 tests PASS.
- Final frontend quality PASS: typecheck, lint, formatting, architecture, dead-code,
  four batch-runner regressions and 149 files / 1,453 tests.
- The first exact-head full-suite attempt had one unrelated asynchronous Class Record
  assertion observe zero calls. That file passed 16/16 in isolation and the immediate
  full-suite rerun passed 1,453/1,453; the failed attempt is retained as evidence, not
  silently discarded.
- Production build PASS; the existing bundle-size advisory remains.
- Browser smoke PASS across both appearances, three densities and four widths with
  zero configured axe WCAG A/AA findings.
- Browser recovery PASS: 50 checks, now including creation of an append-only lesson
  source correction and rendered lineage, plus responsive/axe inspection.
- Dev-preview isolation PASS: 21 production files scanned with no fixture trace.
- Official Rust 1.99 formatter check PASS for all changed Rust files. Native tests and
  Clippy are not available locally and must pass in exact-source CI.
- Local security tools (`gitleaks`, `cargo-deny`, `osv-scanner`) are absent, so the
  local security command is explicitly unverified; Security CI is required.
- Synthetic fixtures only. No production record, approved BOW, source verification,
  installed-device evidence or professional acceptance is claimed.

## Continue

PR113 passed Quality and Security at its reconciled head and merged. This branch is
reconciled to that exact main merge with no first-parent tree change. Inspect the
resulting diff, publish with an expected-head lease and require exact-source
Quality/Security before merge. Continue M10 with verified source ingestion and
teacher-confirmed AI drafts; term/cohort authority and approved source material remain
external dependencies. M10–M17 and batches C–G are not complete. No deployment.
