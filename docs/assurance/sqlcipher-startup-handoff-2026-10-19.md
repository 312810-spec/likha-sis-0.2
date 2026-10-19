# SQLCipher cold startup — implementation checkpoint

## Latest checkpoint CI — verified on continuation

Checkpoint `ee2b7817df16c677ffb0a008176cc6b06a579915` (tree
`cb0f5eb81dd4d1cf29a0b605589707593da98d84`) passed Quality39158028481 and
Security39158028370. This is a new exact-head receipt, beyond the implementation
receipt below. Inspected job steps show native gates executed, not skipped:
Ubuntu117765249349 passed1,526 native tests; Windows117765249295 passed1,535
native tests and application/installer build. Cold subprocess regression,48 mechanism
checks, UI smoke/recovery50 and restored-source negative controls passed.
All three security jobs passed. Only the documentation-format step was skipped.
Machine-readable job/step/log/artifact evidence: `scores-checkpoint-ci-2026-10-19.json`.

Latest disposable Windows test artifact:
https://github.com/312810-spec/likha-sis-0.2/actions/runs/39158028481/artifacts/12148083473
GitHub-reported archive digest:
`sha256:74075c899a852cddfc662b243606c0974d5ea1c10f2269aa18c1348d24bb01d8`.
Expires2026-11-01T19:36:58Z. This supersedes the older trial artifact below;
no installed-GUI, upgrade or independent binary-checksum observation is claimed.

Current execution host is Linux; neither `adb` nor `wine` is on PATH. No accessible
installed Windows/Android target or teacher observation has been established.
Full pilot remains INCONCLUSIVE. Execute the remaining observation protocol below
on the actual target devices and return the recorded outcomes; no further runtime
change or repeat automated suite is justified by this successful checkpoint alone.

## Verified native prerequisite — current result

**N1–N6: READY FOR REVIEW within this native repair. Full Scores pilot: INCONCLUSIVE**
because required teacher/device/manual evidence is still NOT RUN. No merge/deployment.

Checked implementation `e6f13fd48fb682d4f0d2bf704a4027a1d4a5eda9`; CI merge
`9fe0e7fcdf436780b54c25b7c9f5b47683084f2d`. Both have exact tree
`086de06ed1464248ed1959ea8e460b14a3d2d0ce`, fetched/compared. Local implementation
commit2012e98 has the same tree. Subsequent evidence/probe documentation edits do not
change native/production UI source or the executed native workflow.

| Check                               | Actual result / receipt                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality39155819896                  | SUCCESS on checked implementation                                                                                                           |
| Ubuntu117758750825                  | 1,526 native tests, Rustfmt/Clippy, both vendor provenance checks, private synthetic D-Bus and restored-source score negative controls PASS |
| Windows117758750839                 | 1,535 native tests plus actual application/NSIS/MSI build PASS                                                                              |
| New cold subprocess regression      | PASS on Ubuntu/Windows; four fresh subprocesses ×32 actual encrypted app opens, isolated migrated records and cipher presence               |
| Previous learner-isolation failures | Both named view/update cases PASS on Ubuntu/Windows                                                                                         |
| Dependency mechanism                | 48 CI checks PASS; four expected amplified negatives,24 initialized controls; final natural20-run series had no failure                     |
| Frontend/UI/recovery                | 1,581 tests, UI smoke,50 recovery checks PASS at checked implementation                                                                     |
| Security39155819934                 | Gitleaks117758708927,cargo-deny117758709029,OSV117758709236 PASS under unchanged policy                                                     |

Machine-readable exact source/jobs/steps/focused log/artifact receipts:
`sqlcipher-startup-ci-2026-10-19.json`. Expected baseline-negative assertion failures
are successful negative controls, not candidate failures; `source_restored=true`.
The earlier failed native receipt remains historical and has now been superseded
for this repaired implementation; it was not relabeled as a pass.

Windows disposable-test installer artifact12147627096:
https://github.com/312810-spec/likha-sis-0.2/actions/runs/39155819896/artifacts/12147627096
GitHub-reported archive digest:12d268058ac424082cc8f085b9d6ae6afa59a3fdd07d268419a9671740c9b53e.
Expiry2026-11-01T19:12:27Z. Installer creation is not installed-GUI/upgrade acceptance;
use only a disposable installation/profile/VM without overwriting existing data.

N1 actual pinned-source reproduction PASS; N2 actual cold app regression PASS;
N3 existing native regressions/no key-schema-score changes PASS; N4 repeatable CI
probe PASS; N5 full exact-source platform/security gates PASS; N6 evidence/handoff
and authorized publication confirmed. Keep professional approval separate.

Additional D14 layout subset: zero/60 synthetic roster rows at1280/640/390,
keyboard traversal through60 fields and boundary/action reachability, zero score
writes, zero assessed axe findings/page overflow PASS. Both phone renders inspected
internally. `score-roster-layout-probe.mjs` and `scores-roster-layout-evidence-2026-10-19.json`
retain the method/results. These are injected read-model/layout cases: native roster
loading, domain eligibility/count consistency and throughput are NOT established.
The fixture assessment's original item counters are not rewritten by this injection.

Next: use the prepared observation protocol/disposable installer for the remaining
teacher/Windows-device cases. Actual Android, two-device exchange, manual AT/real
OS zoom remain NOT RUN. Do not activate another runtime journey or merge this stack
as if those pilot criteria passed. Recheck current branch/CI/source on resume.

## Historical investigation checkpoint

PR149 UI head421cec8 passed Quality39150927681 and Security39150927807. Inspection
of Quality steps confirms native/provenance/Windows were SKIPPED. It did not clear
PR148 Quality39137295517's two database-opening failures. Current follow-up repairs
that prerequisite only. Frozen N1–N6: `sqlcipher-startup-contract-2026-10-19.md`.

Actual CI log: Ubuntu117704347054 emitted two `sqlcipherCodecAttach: sqlcipher not
initialized1` messages immediately before the key errors. This is not evidence of
wrong learner permissions or invalid key material. Existing authorization assertions
were never reached in the two failed cases.

## Reproduction and implementation

Verified crates against Cargo.lock: libsqlite3-sys0.38.2 SHA256
f1d20bef17f513b9b3004532233187769cd072d790971f4e4da0e346eb6401e8 and
rusqlite0.40.2 SHA25623f2a97da3e3873c73cb2a2e71b35c40ff95e0b1eefa8d72d8499a6928c3b5b3.
Inspected actual bundled sqlite3.c and rusqlite inner_connection.rs. Core SQLite
initialization is published before SQLCipher's extra initializer; concurrent callers
through rusqlite's preliminary mutex check can reach keying inside this interval.

Natural exact-call-sequence native C probe: one failed run of20 with two failed
opens;20 preinitialized control runs had zero failures. Plain sqlite3_open probe
without rusqlite's preliminary call sequence had no failures in six runs; retained
as a non-reproduction. A20ms delay initially amplified the issue but was not reliable
under scheduling variations. The retained bounded rendezvous amplification makes the
existing interval observable without changing dependency source or key behavior.
Do not relabel amplified observations as natural frequency or app runtime evidence.

App db::open now enters a OnceLock initialization barrier before Connection::open.
It publishes the actual initialization result only after the extra initializer
returns; errors remain database errors. It does not serialize ordinary connection
operations after initialization. Key generation/encoding/protection, cipher version,
PRAGMA ordering, migrations and score transactions remain unchanged. No runtime
network/dependency/lockfile/scanner exclusion was added.

New native integration test launches four fresh subprocesses, each racing32 actual
app db::open calls and asserting isolated migrated school records and SQLCipher
presence. A fresh process prevents another test from silently warming initialization.
Existing file reopen/wrong-key/recovery/score authorization/atomicity tests remain.
The Linux C probe is added to the native CI path, not the teacher application.

## Local capability and evidence limits

Installed stable Rust1.99.1 through the official rustup distribution after the default
download backend failed; curl backend succeeded. Rustfmt check passes. Targeted app
native test build was attempted but blocked by absent pkg-config/GTK system packages;
no local Rust test PASS is claimed. Compiled pinned SQLCipher C/OpenSSL and ran its
controls locally. System OpenSSL is a different provider build from vendored CI;
actual Rust/full-platform verification must come from the candidate CI receipts.

Context7 CLI0.8.0 was verified from npm/help. Lookup returned unversioned rusqlite
sources; retrieved API threading notes are supporting documentation, not the cause
proof. Actual0.40.2/0.38.2 source and executed probes govern the repair. No Context7
call or credential was added to the app.

At the historical implementation checkpoint, candidate CI was pending publication. N2/N3/N5 remain INCONCLUSIVE
until executed native and security gates pass. Overall Scores teacher/device gates
remain unchanged; no merge/deployment. Next: execute exact candidate gates, fix any
regression, record source/tree receipts, then continue only the remaining pilot checks.

Local final dependency probe PASS:48 checks. All four amplified baseline runs failed
31 of32 key operations as expected; all24 preinitialized control runs succeeded.
The final natural20-run series had no failures, consistent with an intermittent race;
the earlier20-run series retained two failures in one run. The wrapper pauses before
default logging is configured, so negative assertions use the returned exact key-error
message and31 failures, not an unavailable internal log line. Initial failed probe
assertions caused by expecting that early log are not product regressions. Raw series,
source checksums and evidence classes: `sqlcipher-startup-evidence-2026-10-19.json`.

## Remaining Scores observation protocol — NOT RUN

Reuse the six-task trial in `score-design-handoff-2026-10-18.md`; do not repeat its
old PR/security status as current. Add these cases for the current candidate:

| Task given without control hints                                                    | Observer oracle                                                                 | Current evidence                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Reach an interior saved learner’s history and exception choices using only keyboard | Focus reaches real actions; no academic write just from traversal               | Automated candidate PASS; teacher NOT RUN                 |
| Keep a correction pending, narrow the window, then cancel                           | Focus/input/actions visible and hittable; recorded score unchanged              | Browser resize PASS; installed Windows NOT RUN            |
| Explain saved reporting completeness while a score edit is pending                  | Explanation distinguishes saved records and unsaved input; no approval inferred | Automated text/state PASS; teacher NOT RUN                |
| Explain unavailable or failed transfer evidence                                     | Does not infer hub receipt or loss of the independently saved local score       | Component state tests PASS; teacher/real exchange NOT RUN |

Use the exact CI artifact/source only in a disposable Windows profile/VM. Record
actual build/source/installer checksum, environment, class/item/learner fixture IDs,
observed outcome, actual stored value/history/receipt and evaluator. All missing
observations remain NOT RUN. Never infer installed acceptance from installer creation.
Actual Android encrypted startup/keyboard/process-death and real two-device exchange
require their own environment; this Windows/native prerequisite cannot close them.
