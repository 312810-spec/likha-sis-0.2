# M10 — classroom lesson origin

Branch: `ctos/m10-classroom-lesson-origin-20261014`.
Parent: PR115 merge `30cfd9df08072d83c331b5ab000e0ba74a71f50b`.
PR115 verified head: `ffd647800f57aaa09d39b86ee0ea372aa236f0e7`.
Quality run `38470060511` and Security run `38470060642`: PASS.

## Outcome and boundaries

Starting a classroom occurrence captures the dated lesson's identity, content-update
timestamp, historical teaching context and effective declared source reference.
The existing learning-target snapshot is retained. Reads return the captured origin
rather than joining today's mutable lesson or source-amendment state. Migration 52
adds a nullable JSON column and rejects subsequent origin changes with a trigger.
Earlier occurrences and starts without a dated lesson remain explicitly unknown;
no migration backfills a plausible lesson identity.

The cockpit displays this provenance in every teacher mode and states that later
lesson edits cannot rewrite it. A source reference is still a teacher declaration,
and a file fingerprint is still byte identity only: neither implies official
approval. Teacher edits to the occurrence's working learning target remain allowed.
No sync entity, AI provider, production record or official competency was introduced.

## Verification

- Focused Classroom Mode tests: 25/25 PASS, including captured-source disclosure,
  unknown legacy state and automated accessibility.
- Frontend quality: 149 files / 1,459 tests PASS; typecheck, lint, formatting,
  architecture, dead-code and four batch-runner regressions PASS.
- Production build and browser smoke PASS; zero configured axe findings. Existing
  bundle-size advisory remains. Browser smoke is not installed-device evidence.
- Dev-preview isolation PASS across 21 production files.
- Native regressions added for start-time capture, source amendment/content-edit
  preservation, resume without re-snapshot, origin immutability and version-51
  upgrade preserving earlier occurrences. Rust/native/Clippy unavailable locally;
  these tests remain unexecuted until exact-source Quality CI passes.
- Security tools unavailable locally; exact-source Security CI required.

## Continue

Publish as a small draft PR with an expected-head lease; compare remote and local
trees. Repair failed CI excerpts without weakening gates and merge only after
exact-head Quality/Security PASS. Teacher-confirmed AI draft ingestion can be built
without a live provider; actual generation still requires the deferred provider and
privacy decision. Approved source authority, term/cohort rules, installed devices and
professional acceptance remain pending. M10 and remaining batches are not complete.
No deployment.
