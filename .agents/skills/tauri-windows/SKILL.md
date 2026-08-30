---
name: tauri-windows
description: Use when touching src-tauri build/config, Tauri commands, Windows-specific packaging, or WebView2/DPAPI-dependent code.
---

# Tauri / Windows

Build requirements on this machine: Rust `stable-x86_64-pc-windows-msvc`,
Visual Studio Build Tools 2022 (C++ workload), Strawberry Perl (vendored
OpenSSL for SQLCipher) — all installed via winget. If a build fails with
a missing compiler/Perl error, check these first before assuming a code
bug.

`tauri.conf.json` uses a placeholder identifier `org.likhasis.app` — fine
for local development, must be revisited before any real distribution or
code signing (do not silently "fix" this without flagging it — it's a
deliberate placeholder, not an oversight).

DPAPI key protection (`docs/adr/0003-encryption-at-rest.md`) is
Windows-only by construction — do not assume it ports to a future Android
target without a real design decision.

Local verification tiers:

- `cargo test`, `cargo clippy --all-targets -- -D warnings` — always run
  after a Rust change.
- Launching the actual compiled `app.exe` and checking its log output is
  stronger evidence than `cargo test` alone for "does the real binary
  boot and open the database" — used for M5/M6, keep doing it for
  binary-affecting changes.
- Real native-binary E2E (launch → screen renders → close) is piloted via
  `@wdio/tauri-service` (WebdriverIO, `embedded` WebView2 provider, no
  paid CrabNebula dependency needed on Windows) — see
  `docs/VERIFICATION-DEBT.md` for current coverage status before assuming
  it's comprehensive.
