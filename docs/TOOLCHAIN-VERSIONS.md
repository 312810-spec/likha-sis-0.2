# Stable toolchain audit — 2026-10-02

Use current stable versions regardless of earlier preferences. Lockfiles record a
reproducible snapshot; recheck releases when revisiting tooling.

- Node 26.10.0, npm 12.2.0, Rust 1.99.0, Tauri 2.12.1.
- Vite 8.3.2, Vitest 5.0.3, Playwright stable 1.63.0, React 19.3.0.
- TypeScript compiler 7.0.2 runs explicitly through the typescript-compiler alias.
  Latest typescript-eslint 8.71.0 requires its parser API below 6.1; that internal
  library remains 6.0.3. This is an upstream compatibility constraint, not a
  preference for an old compiler. No forced peer resolution is used.
- Direct npm versions checked against official registry dist-tags/latest.
  Direct Rust versions checked against crates.io sparse index, excluding yanked
  and prerelease versions. Argon2/password-hash source adapted for their new API.
- CI follows latest stable Node/npm/Rust and uses current release action SHAs.
  OSV Scanner 2.6.0 is verified against its published binary SHA-256.
- Node archive SHA-256 matched official SHASUMS256.txt. Runtime was extracted
  outside the synced source directory after an incomplete local extraction.

Official evidence:
https://nodejs.org/dist/index.json
https://nodejs.org/dist/v26.10.0/SHASUMS256.txt
https://registry.npmjs.org/typescript
https://registry.npmjs.org/typescript-eslint
https://static.rust-lang.org/dist/channel-rust-stable.toml
https://github.com/google/osv-scanner/releases/tag/v2.6.0
https://github.com/actions/checkout/releases/tag/v7.0.1
https://github.com/actions/setup-node/releases/tag/v7.0.0
https://github.com/actions/upload-artifact/releases/tag/v7.0.1

The previous workspace recorded passing frontend/native/browser tests before
reset. Restored code must be revalidated; those earlier runs do not certify the
restored commit. Windows installer/device checks remain separate.
