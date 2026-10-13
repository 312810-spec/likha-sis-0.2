# Remaining batches — execution checkpoint

Baseline: main `c89474c1b6fb2c91823fb1a656bc10b8082fabe3`.
Branch: `forge/remaining-batches-20261013`.

## Implemented locally

- A: reconciled stale M09 continuation and migration references. PR100/103 remain
  open/unmerged salvage candidates; no historical branch was merged.
- B: lesson updates bind authorization to the actual lesson assignment; mismatched
  request context and another teacher's target are rejected. Added a native regression.
- B: all nine planner read commands use a shared school-scope boundary, rather than
  confusing the session's actor ID with its school ID. Added a production-helper regression.
- Automation: `npm run quality:batches` runs checks sequentially with scoped logs,
  source digests, per-check receipts and truthful failure/timeout/missing-tool states.
  Four subprocess regressions are included in the normal quality gate.
- C groundwork: lesson guidance points to current approved BOW/templates instead of
  asserting official ILAW authority from the older secondary-source research.
- Remaining acceptance cases RB01–RB15 are specified in
  `docs/ctos/evals/remaining-batches-cases.md`. Specifications are not execution.

## Executed evidence

- Frontend quality PASS: typecheck, lint, formatting, architecture, dead-code,
  four runner regressions and 149 files / 1,441 frontend tests.
- Lesson-screen focused tests PASS.
- Production build PASS; fixture isolation PASS, 21 output files scanned.
- Browser smoke PASS: both appearances, three densities, four widths, keyboard
  and workflow checks; zero configured axe findings.
- Browser recovery PASS: 49 checks, including draft retention, focus, 200% text
  and touch. These use frontend synthetic fixtures, not installed persistence.
- Rust 1.99.0 installed; `cargo fmt --check` and `git diff --check` PASS.
- Native test attempt failed before test execution: missing pkg-config/GLib host
  dependencies. Host package installation was attempted with an accessible-user
  configuration, then stopped when the managed package cache refused downloads.
  Native authorization regressions and full native suites remain NOT RUN.
- Node 26.11.1 and npm 12.2.0 were resolved from registry metadata and installed
  separately from repository dependencies. Frontend checks used Node 26.11.1.

## Batch status

| Batch | State                                                                        |
| ----- | ---------------------------------------------------------------------------- |
| A     | Reconciled locally; remote durability blocked                                |
| B     | Two fixes implemented; native/device acceptance pending                      |
| C     | Guidance correction only; full M10 pending                                   |
| D     | M11/M12 implementation and official acceptance pending                       |
| E     | Android native key store/startup unsupported; M14 pending                    |
| F     | Existing automated gates rerun; manual/device/performance acceptance pending |
| G     | Not ready; do not merge/release as complete                                  |

## Publication blocker

Automatic approval review rejected pushing this branch, stating that the user
had authorized implementation but had not authorized external publication of
this payload. No connector, alternate remote or indirect export was used to
bypass that rejection. Commits remain local; remote durability is not confirmed.

## Resume

Inspect Git status and head; preserve local commits and dirty work. Obtain
publication authorization for this concrete branch, then publish it and open a
reviewable PR so native Ubuntu/Windows CI can execute. Repair native failures
before claiming the two boundary fixes verified. Continue the first unblocked
M10 slice, then reporting, Android, usability and release gates.

Use the existing efficient plan and case register. Device/source dependencies
remain visible; do not turn passing frontend checks into installed-app proof.
No production records, merge, release or deployment occurred.

AI prepares. Teacher reviews. Teacher approves.
