# Opener maintenance — verified handoff

## Outcome and source

**READY FOR REVIEW: frozen O1–O6 all PASS.** Separate dependency maintenance resolves
the three-advisory blocker without widening score design or changing scanner policy.
Draft PR148: https://github.com/312810-spec/likha-sis-0.2/pull/148, dependent on PR147→PR146.
Branch: `forge/opener-dependency-maintenance-20261018`. No merge or deployment.

Checked source: `ceeab1d53b4901f372f7ead6da2fcb2b9ea0278a`.
CI merge: `9d97cb079d179056b76ee2565ad3e86de64c6e84`.
Fresh fetch confirms identical tree: `3f1dfa15eab3173a30d0f5daa685776d9c11ae2c`.
Final checkpoint edits documentation only; implementation/workflow/verifier/lock hashes
and executed receipts are in `opener-maintenance-evidence-2026-10-18.json`.
Frozen contract: `opener-maintenance-contract-2026-10-18.md`.

## Mechanism and decisions

The old graph was opener2.7.0→zbus5.19→standalone zvariant/zbus_names/zvariant_derive.
RustSec retired these standalone crates after their APIs moved into zbus6. Stable
opener2.7.2 still requires zbus5.9; a normal update cannot remove the findings.

The explicit official-source opener2.7.2 snapshot retains 37 files and both full licenses.
Its archive checksum is verified against the published registry value. Only normalized
Cargo.toml and Unix reveal code are patched: async zbus6 Connection/proxies are driven
by block_on on the existing dedicated thread. Preserve FileManager1-first behavior,
first-path portal fallback and propagated denial. Windows, commands, permission/scope
and mobile code remain byte-identical to upstream. This is a local compatibility fork.
Cargo generated the real lockfile; zbus6 requires Tokio1.53.3. A precise1.53.1 preservation
attempt failed the resolver, so only that required patch update is retained.

Initial candidate ec13fbe and its CI failures remain in evidence/checkpoint history:

- Public source SHA256 map entry matched generic-api-key. Explicit path/sha256 records
  remove that false-positive representation; same-version changed-file scan passes.
- Upstream LICENSE.spdx is an invalid legacy SPDX document. Retain its bytes as
  LICENSE-SPDX-notice.txt with explicit original-path provenance, not as an asserted SBOM.
- Windows inventory keys needed as_posix(), not platform-specific str(relative_path).
  No new ignore, scanner filtering, capability removal, version spoof or broad update.
  Only this task-owned unmerged branch was replaced with an exact expected-head lease;
  other branches/history stayed intact. Prior failures were not relabeled as passes.

## Executed checks

| Check                  | Result / receipt                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provenance O1          | PASS: 37-file inventory on Windows/Ubuntu; clean byte-for-byte regeneration; overwrite refusal; tamper/extra-file rejection; original 618-file spreadsheet provenance.                              |
| Resolved graph O2      | PASS: Cargo1.99.1-generated lock removes the three retired crates; candidate hashes retained.                                                                                                       |
| Security O3            | Run39135625254 SUCCESS; Gitleaks117699430479, cargo-deny117699430568, OSV117699430802 all PASS under unchanged policy.                                                                              |
| Ubuntu O4              | Job117699527114 SUCCESS: 1,525 native tests, Rustfmt and Clippy PASS.                                                                                                                               |
| Actual Unix adapter O4 | Private synthetic D-Bus success, fallback and denial all PASS in CI; the production module itself is extracted and compiled, not reimplemented.                                                     |
| Windows O4             | Job117699527102 SUCCESS: 1,534 native tests, native application and NSIS/MSI build PASS.                                                                                                            |
| Journey O5             | 1,576 frontend tests, UI smoke and 50 recovery checks PASS. Score native negative controls fail as expected against pinned pre-fix production code; candidate positives pass; source_restored=true. |
| O6                     | Provenance/private-bus checks wired and executed in Quality39135625221; exact PR/source/tree/artifact receipts retained.                                                                            |

Local private-bus execution was blocked by host socket permissions. Actual CI execution
supersedes that missing runtime evidence; it does not turn the local blocked run into PASS.
Context7 returned unversioned/mixed historical snippets; actual v6 source/compiler governed.
No Context7 component or teacher-runtime network request was added.

## Windows review artifact

Test installer, exact source ceeab1d:
https://github.com/312810-spec/likha-sis-0.2/actions/runs/39135625221/artifacts/12140346037
SHA256: `598e719d06f7eb34a727267902bdd949ae8690780eb77906c91aafb651389bab`.
Artifact expiry: 2026-11-01. Test only in a disposable Windows installation/profile/VM;
no existing installation or user data was overwritten in this work.

## Pending and next action

Teacher trial, installed Windows GUI/upgrade, actual Android, real desktop portal and
real two-device transfer remain NOT RUN. Private synthetic services do not establish
real portal/device acceptance. UI source/tokens, score application source, export bridge,
permission files and scanner policies remain unchanged from PR147.

Review/integrate only the verified PR148→PR147→PR146 stack under existing gates. Old
branch security receipts do not become green merely because this candidate passed.
Then perform the scoped teacher/disposable-device trial already specified in the score
handoff. No broader M10–M17 closure or deployment follows from these checks.

Recheck when source/advisory data changes. Remove the local snapshot once a maintained
compatible opener release supports zbus6, then rerun provenance/security/native/Windows
checks. Do not repeat this completed maintenance or resume unrelated M11/Android work
by default. GitHub publication of this final documentation checkpoint must be confirmed
before claiming that checkpoint is durable.
