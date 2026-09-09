//! Outbound integrations with third-party cloud providers, kept out of
//! `repository::*` (this project's own SQLite persistence) and behind a
//! narrow surface `commands::*` calls into -- never imported by
//! `src/ui/**`/`src/domain/**` on the TypeScript side, mirroring
//! `.claude/rules/architecture.md`'s Rust-side equivalent boundary.
//!
//! Currently just `microsoft365` (ADR-0088, Official School Repository).
pub mod microsoft365;
