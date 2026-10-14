# M11 — immutable native preparation drafts

Branch: `ctos/m11-report-drafts-20261014`.
Parent: PR123 merge `105e7c6b7cfeee2787d62d0efd5275bc4a3c6d53`.
Verified PR123 head: `9c470f7acba1c97cfff0970cfaf901b783b92b7b`.
Quality `38545207071` and Security `38545207091`: PASS.
Native code was unchanged in PR123; valid PR122 native evidence remains applicable.

## Outcome contract and boundaries

Persist a preparation draft from the current authorized native report-card preview.
The capture command accepts only class-record identity; no client snapshot, actor,
timestamp, review/approval or issued-state payload is accepted. Source context,
period roster, grades, missing-data explanations and disclosures are server-derived.
This captures current data, not a guarantee of equality to an earlier displayed
preview. Exact stored UTF-8 JSON gets a SHA-256 fingerprint and native actor/time.

Migration 54 adds an append-only local encrypted-database table. Cross-school record
links are refused by a database trigger in addition to command/repository checks.
The only permitted stage is `draft`; update/delete triggers retain the exact
snapshot, including its original names/context, after current records change.
Existing exports/records are not retroactively turned into drafts or approvals.

Recent history reads revalidate current assigned-section/subject or same-school
School Head authority and verify each stored hash and record/fidelity identity.
They do not regenerate historical grades. The explicitly bounded recent-history
command returns at most 50 rows in deterministic timestamp/id order; it is not a
claim of complete/paginated history. Repeated captures are distinct drafts, not
idempotent issuance or duplicate-safe exchange. No file is generated or sent.

This is a native draft foundation only. Teacher-facing capture/history, professional
review, freshness checks against a previously reviewed payload, issued snapshots,
amendments and cross-form reconciliation remain subsequent implementation work.
Official fidelity is unverified, SF8 inactive, M10/M11 incomplete and production
device/professional acceptance distinct. No deployment or real records mutated.

## Verification

- Synthetic native regressions added for known SHA-256 encoding, corrupt/foreign
  snapshot rejection, native actor/time, historical context preservation, immutable
  update/delete refusal, cross-school FK-parent linkage and unauthorized capture/read.
  Existing period-roster/missing/provisional and authorization regression remains.
- Local architecture/dead-code and four evidence-runner checks PASS; diff whitespace clean.
- Rust/Cargo/rustfmt unavailable locally. Native format/tests/Clippy and Security
  require exact-source CI before merge; no native pass is claimed here.
- No frontend source changes; reuse PR123's unchanged 153-file/1,497-test frontend,
  build/browser/recovery evidence, not as proof of new persistence behavior.
- No draft UI, installed-device migration, manual screen-reader or professional
  acceptance claimed. No provider/source approval assumption introduced.

## Exact-head formatting repair

At head `cb108bd9c9394eed9d7f54af3affb3ca89a79a9f`, Security `38554616971`
passed. Quality `38554616950` failed only at Ubuntu job `115820636800`'s
`cargo fmt --check`, on two test-layout differences. Windows compilation passed;
native Windows tests were still running when inspected. Apply the exact formatter
output without a behavior change. Require both applicable gates at the repaired
head before merge; unchanged frontend evidence remains valid.

## Continue

Publish with expected-head lease and compare exact remote/local trees. Inspect any
failed gate excerpts and apply minimum repairs without weakening gates. Merge only
after applicable Quality/Security pass at the verified current head. Next wire
explicit draft capture/history and review, then add source-freshness-checked issue
and append-only amendments plus reconciliation in controlling milestone order.
No production deployment; continue while independent implementation remains.
