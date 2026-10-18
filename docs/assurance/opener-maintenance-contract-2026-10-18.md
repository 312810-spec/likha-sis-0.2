# Opener dependency maintenance — separate bounded contract

Baseline: `88e0686bab8c01d04fb293a737e0fd38dcaa99d5` (PR147). Branch:
`forge/opener-dependency-maintenance-20261018`. Continuation addresses the recorded merge
blocker separately from score design; it does not close teacher/device acceptance.

## Observed failure and scope

Latest baseline Quality run 39125900679 PASS. Security run 39125900458 FAIL:
cargo-deny job 117670844070 and OSV job 117670844085 identify RUSTSEC-2026-0370,
0371, 0372. Gitleaks job 117670843861 PASS. cargo-deny records opener2.7.0 → zbus5.19
→ standalone zvariant5.15 / zbus_names4.3.4 / zvariant_derive5.15. These are maintenance
advisories, not an observed exploitation or learner-data incident.

Official RustSec specifies migration to zbus6; plugin2.7.2 still requires zbus5.9.
Investigate a reproducible official-source opener2.7.2 compatibility snapshot with only
necessary manifest/API edits. No removal of export/reveal capabilities, no scanner ignore,
no target filtering to hide findings, no version spoof, no blanket dependency refresh.
All school/score/persistence/authorization/official-form behavior stays outside the patch.

## Frozen required checks

| ID  | Requirement                                                                                                        | Method and evidence                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| O1  | Exact upstream source/checksum, licenses, guarded patch and reproducible per-file inventory; no silent stale fork. | Published registry checksum, upstream/source comparison, regeneration and tamper rejection.                         |
| O2  | Resolved lock graph removes the three standalone crates and preserves unrelated dependencies where possible.       | Cargo-generated lockfile and reverse dependency inspection; no hand-invented checksums.                             |
| O3  | Existing security gates pass with unchanged advisory policies.                                                     | Executed cargo-deny, OSV and gitleaks on exact candidate.                                                           |
| O4  | Native/API compatibility and Windows packaging hold.                                                               | Native tests, Rustfmt, Clippy, existing provenance checks and Windows build/test installer. No installed GUI claim. |
| O5  | Existing score journey and export bridge remain intact.                                                            | Frontend quality/build and relevant UI/recovery tests on the candidate; unchanged score/native application source.  |
| O6  | Future CI verifies new snapshot provenance; candidate remains separately reviewable.                               | Offline verifier, CI wiring, exact source/tree and PR receipts.                                                     |

Required failure blocks readiness; missing required execution is INCONCLUSIVE. A patch
that cannot compile or leaves scanner failures is not a repaired blocker. No merge/deploy
until these checks pass under established authorization. Actual Windows install/trial,
Android and human acceptance stay pending under their own contracts.
