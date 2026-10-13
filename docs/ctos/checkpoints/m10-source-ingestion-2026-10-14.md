# M10 — exact lesson source ingestion

Branch: `ctos/m10-source-ingestion-20261014`.
Parent: PR114 merge `e5f4c74c11dd6a81ce15278ae68b39f6e4614459`.

## Outcome and contract

Teachers can select a PDF, DOCX or XLSX curriculum/BOW source from the lesson
editor. LIKHA retains the exact bytes in its encrypted local database, records the
authenticated teacher, file name/type/size, timestamp and SHA-256, deduplicates
identical bytes inside one school, and links the resulting artifact identifier to
the teacher's declared source reference. Artifact rows are append-only; update and
delete triggers reject rewriting the evidence.

The native boundary checks that the active teacher owns the teaching assignment
before reading the selected path. It limits content to 8 MiB and checks the expected
PDF or OpenXML container signature as well as the extension. Reads and links are
school-scoped. A source declaration cannot link a missing or other-school artifact,
including through a later provenance amendment.

This is integrity evidence only. It proves which exact local bytes the teacher
attached; it does not establish that a document is official, approved, current,
applicable to a subject/year/term, or that any competency inside it is accurate.
The lesson editor says this at selection and after linking. No approved curriculum,
BOW, competency, professional judgment or acceptance was fabricated.

## Verification and assurance

- Focused service/adapter/picker/UI checks: 4 files / 42 tests PASS before the final
  additions; the final full suite below includes the completed UI linkage test.
- Frontend quality PASS: typecheck, lint, formatting, architecture, dead-code, four
  batch-runner regressions and 149 files / 1,457 tests.
- Production build PASS; the existing bundle-size advisory remains.
- Browser smoke PASS across both appearances, three densities and four widths with
  zero configured axe WCAG A/AA findings.
- Local security command is explicitly unverified because `gitleaks`, `cargo-deny`
  and `osv-scanner` are absent. Exact-source Security CI is required.
- Rust 1.99, native tests and Clippy are unavailable locally in this runtime.
  Exact-source Quality CI must format, compile, test and lint this slice before merge.
- Repository fixtures use synthetic bytes and declarations only. No production
  records, installed-device result, approved source or professional acceptance is
  claimed.

## Continue

Publish as a draft review slice with an expected-head lease. Inspect any failing
native log excerpt and make only the smallest repair; merge only after exact-head
Quality and Security pass. Then continue M10 with teacher-confirmed AI drafts and
classroom linkage. Official source authority, term/cohort rules, installed-device
testing and professional acceptance remain external dependencies. No deployment.
