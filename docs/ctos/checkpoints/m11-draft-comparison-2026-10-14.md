# M11 — retained/current reporting projection comparison

Branch: `ctos/m11-draft-freshness-20261014`.
Parent: PR125 merge `26925df1662770213a681c242d4f01f32fbdece0`.
Verified PR125 head: `bf2b2fcd76abafdf0cfa446baf97f9b2c548e71c`.
Quality `38567078772` and Security `38567078804`: PASS.
PR111/112 live heads remain merged at their recorded identities.

## Outcome contract

An authorized teacher or same-school School Head can request a read-only comparison
of one exact retained draft and current full-period reporting projection. Resolve
draft id with school AND class-record scope, not through the bounded latest-50
history list. Reauthorize current assignment/School Head authority before reading
draft evidence. Verify exact retained JSON hash/context using the existing decoder.
The native session supplies actor/school; only record and draft identities cross IPC.
Missing/foreign identities return no comparison; unassigned same-school access is
unauthorized; corrupt stored content fails instead of being regenerated/replaced.

Current projection uses the existing readiness computation. Return current evidence,
stored draft hash/identity, a projection-match boolean and deterministic sorted
top-level changed-field names. Exclude only the volatile `checkedAt` timestamp from
comparison; names, context, period, policy identity, roster/evidence/counts, omissions
and fidelity remain comparison inputs. New/removed fields count as changes. Never
write a record, recapture, mark reviewed, approve, issue, export or send a report.

This is deliberately a **projection comparison**, not a source-freshness lock.
Raw score/policy/LRN content changes may leave the projected evidence identical;
for example the preview records missing-LRN status, not LRN digits. Roster ordering
changes can also flag a projection difference. The DTO labels the scope explicitly
`reporting_projection_only_not_source_lock_or_approval`. A match is not permission
to issue or evidence of professional approval/official fidelity. Full raw-source
locking plus an atomic review/issue check remains required future work, not waived.
No new schema, migration, algorithm version, review event or immutable issue state.

## Verification

- Synthetic native tests added for clock-only equality, sorted changed fields,
  learner/count/disclosure/new-field differences and invalid projection objects.
- Existing encrypted in-memory valid-FK fixture extended: exact draft identity/hash,
  authorized teacher and School Head comparison, missing/foreign draft isolation,
  unauthorized access, corrupt stored hash refusal, changed historical section vs
  unchanged retained snapshot, and no SQL writes during comparison.
- Architecture/dead-code checks and four evidence-runner tests PASS locally;
  diff whitespace clean. Rust/Cargo/rustfmt unavailable locally; native compilation,
  formatting/tests/Clippy require applicable exact-head CI, no local native PASS claim.
- Frontend unchanged. Reuse PR125's valid 154-file/1,508-test, build, structural
  accessibility and exact-head browser/recovery evidence, not new native proof.
- No comparison UI yet. No source-input lock, professional review, issued/amendment
  transitions, cross-form reconciliation or official-fidelity acceptance claimed.
  M10/M11 remain incomplete, SF8 inactive. Installed devices/manual screen-reader
  and professional/source acceptance remain distinct external dependencies.

## Continue

Publish with expected-head lease and verify exact remote/local trees. Inspect failed
CI excerpts and apply minimum repairs; merge only at applicable green verified head.
Wire explicit comparison viewing next, then full raw-source locking and native
review/issue/amendment semantics and cross-form reconciliation. Do not use the
projection-match boolean as an issuance gate. No production deployment.
