# ADR-0040 — Windows-Only Dependencies Must Be Target-Gated

Status: Accepted

## Context

`cargo check --lib` had never succeeded on any host in this project's
visible session history. The failure occurred inside `windows-future`
(a transitive dependency of the top-level `windows` crate), before the
`app` crate's own source was type-checked at all — meaning **zero real
Rust compiler/test signal existed on any LIKHA-authored Rust code**
across every prior milestone this session (RBAC, Curriculum, Teacher
Load). Every "TDD" claim for those milestones' Rust tests had never
actually been verified by a passing `cargo test` run.

## Root cause (confirmed with evidence, not guessed)

The host in this environment is `x86_64-unknown-linux-gnu` — not one of
LIKHA's shipping targets (Windows first, Android later). Reverse
dependency analysis (`cargo tree -i windows@<ver> --target all`) showed:

- `windows` 0.61.3 is pulled in by **Tauri's own** Windows-only webview
  backend chain (`tao` → `tauri-runtime-wry` → `tauri`/`webview2-com` →
  `wry`). This edge is already correctly **target-gated**: it does not
  appear in `cargo tree`'s default-host output at all, only under
  `--target all`. Tauri's own dependencies compile cleanly on Linux
  because the non-Windows build simply excludes this branch of the
  graph (Tauri uses GTK/webkit2gtk on Linux instead).
- `windows` 0.62.2 is LIKHA's **own direct dependency**
  (`src-tauri/Cargo.toml`, for DPAPI key protection in
  `src/crypto/dpapi.rs`), declared **unconditionally** — no
  `[target.'cfg(windows)'.dependencies]` gate, and `mod dpapi;` in
  `crypto/mod.rs` was likewise unconditional. This forced
  `windows-future`'s Windows-only COM/async-marshaling code to compile
  on every host, including this Linux sandbox, where the underlying
  Win32 APIs it binds do not exist.

Each `windows` version's own dependency edges were internally
consistent in `Cargo.lock` (0.62.2 pairs correctly with
`windows-core 0.62.2`/`windows-future 0.3.2`, etc.) — this was never a
lockfile version-resolution conflict (Category A/B/C). It was **Category
E: a platform/target-specific dependency problem** caused by LIKHA's own
missing target gate, not an upstream defect in `windows`/`windows-rs` or
in Tauri.

## Decision

Move LIKHA's `windows` dependency to
`[target.'cfg(windows)'.dependencies]` in `src-tauri/Cargo.toml`, and
`#[cfg(windows)]`-gate `mod dpapi;` / `pub use dpapi::DpapiKeyStore;` in
`src/crypto/mod.rs`. `db::open_app_db` (the sole call site) is split:
the `#[cfg(windows)]` version is unchanged; a `#[cfg(not(windows))]`
version fails closed with a `KeyStore` error rather than silently
falling back to an unprotected key store — Windows is currently LIKHA's
only shipping desktop target, and "fail loudly, never silently degrade
key protection" is this module's own pre-existing invariant
(`crypto::KeyStore`'s doc comment).

This required **zero `Cargo.lock` changes** — no version bump, no new
dependency, no upgrade. It is the narrowest possible fix: it makes
LIKHA's own dependency declaration follow the same target-gating pattern
Tauri's own Windows-only backend already uses in this exact lockfile.

## Alternatives considered (10-scenario, abbreviated)

| #   | Option                                                              | Rejected because                                                                                                          |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | No repo change, treat as environment-only                           | Disproven: reverse-dependency evidence shows the gap is in LIKHA's own `Cargo.toml`/`crypto/mod.rs`, not the environment. |
| 2   | Regenerate/refresh the whole lockfile                               | Lockfile was already internally correct; a broad refresh would be unrelated churn against explicit instruction.           |
| 3   | Downgrade `windows` to match Tauri's 0.61.x                         | Would still be unconditional — recompiles Windows-only code on every host; doesn't address root cause.                    |
| 4   | Rust toolchain upgrade/pin                                          | Toolchain was never the problem — 1.98.0 compiles fine once gating is fixed.                                              |
| 5   | **Target-gate the dependency + `cfg(windows)` the module (chosen)** | Matches the pattern already proven correct by Tauri's own dependency graph; zero lockfile impact; minimal blast radius.   |
| 6   | Build a real non-Windows `KeyStore` (e.g. a Linux dev keystore)     | Out of scope — Linux desktop is not a LIKHA shipping target; would expand product scope beyond a dependency-recovery fix. |

Recommended: **#5**. Next best: #6, deferred — worth reconsidering only
if a non-Windows _shipping_ target (e.g. a Linux dev-container CI matrix
that must actually open the encrypted DB, not just type-check) becomes
a real requirement later.

## Consequences

- `cargo check --lib`, `cargo test`, and `cargo clippy --all-targets`
  now run successfully on this Linux sandbox for the first time this
  session, restoring real compiler/test signal on LIKHA's own code.
- Two genuine pre-existing bugs were revealed and fixed by the restored
  signal (see `docs/CURRENT-HANDOFF.md` / `docs/ACTIVE-PLAN.md` for
  detail): a type-inference ambiguity in
  `class_record::find_detail_by_id_in_school`, and a dead-code
  `CreateMeetingOutcome::Duplicate` branch in `schedule_meeting::create`
  that could never be reached because an exact-duplicate meeting always
  shares its teacher with itself and was always caught by the teacher-
  conflict check first. A separate, unrelated bad-test-fixture bug
  (four `assessment_item` tests binding `recorded_by_user_id` to the
  literal string `"teacher-1"`, which was never a real row and would
  never satisfy `learner_scores.recorded_by_user_id REFERENCES
users(id)` under the crate's own `PRAGMA foreign_keys = ON`) was also
  fixed the same way `learner_score.rs`'s own tests already do it:
  create a real `user::create_user(...)` row and use its id.
- **New durable rule for future dependencies**: any dependency that only
  makes sense on one platform (Windows DPAPI, a future Android JNI
  binding, etc.) must be declared under the matching
  `[target.'cfg(...)'.dependencies]` table, and the Rust module that
  uses it must be `#[cfg(...)]`-gated at its `mod` declaration — never
  declared unconditionally on the assumption that only the shipping
  target will ever run `cargo check`.
- `cargo fmt --check` was run for the first time this session as part of
  this recovery and found ~264 pre-existing formatting diffs across
  most of the crate, unrelated to this fix. `cargo fmt` was never part
  of `npm run quality:full` (only `cargo test` + `cargo clippy` are) —
  recorded as verification debt, not corrected here (a whole-crate
  reformat is out of this milestone's scope).
