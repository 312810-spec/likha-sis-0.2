# SQLCipher cold startup — implementation checkpoint

## Current decision

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

Candidate CI is pending publication at this checkpoint. N2/N3/N5 remain INCONCLUSIVE
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
