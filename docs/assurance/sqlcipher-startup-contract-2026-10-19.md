# SQLCipher startup prerequisite — bounded contract

Parent: PR149 head421cec8861a631fb7e57772da149ff36f73e8b90. Follow-up stays within the
Scores pilot's native prerequisite; it does not close teacher/device acceptance.
Preserve A1–A7 and original S/D/O contracts. No key, cipher setting, schema, score,
history, transfer or scanner-policy change. No blanket retry or test serialization.

| ID  | Required criterion                                                           | Evidence                                                                                                                                     |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Explain and reproduce the inherited key failure at actual pinned source      | Exact CI log, verified crate checksum, native C negative/positive controls; disclose timing amplification                                    |
| N2  | App connection creation waits for completed cipher initialization            | One-time barrier in actual db::open; cold-process32-thread native regression, four fresh processes; isolation and cipher presence assertions |
| N3  | Fail closed; maintain key/reopen/recovery/authorization/transaction behavior | Unchanged key/PRAGMA/migration/score source; relevant existing native tests and full native suite, no new plaintext fallback                 |
| N4  | Repeatable regression gate                                                   | Repository-owned probe verifies pinned archive, compiles actual source and checks negative/control results; Ubuntu CI executes it            |
| N5  | Full native/platform/security gates                                          | Exact-head Rustfmt/test/Clippy/provenance, Windows build/tests and security receipts; classify skipped checks honestly                       |
| N6  | Durable bounded handoff                                                      | Source/tree/CI provenance, completed/blocked/untested and next action; no deployment or device/teacher approval claim                        |

N1 source evidence: upstream bundled SQLite sets its isInit flag before its
SQLITE_EXTRA_INIT callback. SQLCipher rejects keying when its separate initialization
flag is not set. rusqlite's preliminary mutex allocation exercises this interval.
The first plain sqlite3_open probe did not reproduce the failure. Exact rusqlite C
call sequence did: two failures in one of20 cold32-thread runs; preinitialization
control0/20. These are dependency-level runs, not app Rust executions.

Production mechanism: OnceLock publishes the completed sqlite3_initialize result
before Connection::open; initialization failure remains a database error. Never call
global shutdown/reconfigure; app-owned encrypted connections all use this entry.
Raw third-party connection creation outside the entry is not newly guaranteed.
Alternative: serialize all database work or retry failed key commands. Rejected:
needlessly serializes steady-state work or conceals an incomplete security runtime.
Retain native cipher/key error propagation and no plaintext fallback.

Amplification is a timing-only wrapper before the real unmodified extra initializer.
A bounded rendezvous lets other cold callers reach keying in that exact existing
interval; it changes no key logic or return value. Preinitialized control bypasses
this cold interval. The C source is not a replacement implementation of SQLCipher.
The cold Rust app subprocess test independently exercises actual production db::open.

Required failures block N readiness; missing required evidence is INCONCLUSIVE.
Installed Windows, actual Android, real two-device exchange, manual AT and teacher
observation remain separate Scores acceptance debt even when N1–N6 pass.
