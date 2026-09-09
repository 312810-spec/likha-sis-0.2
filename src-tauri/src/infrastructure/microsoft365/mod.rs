//! Microsoft 365 / Microsoft Graph integration for the Official School
//! Repository (`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`,
//! ADR-0088). Each school registers its own Azure AD app in its own
//! tenant -- this project never runs a shared multi-tenant app.
//!
//! `oauth` is platform-independent (pure HTTP request/response shaping,
//! no DPAPI) and its tests run on any target, including this Linux dev
//! sandbox. `token_store` is Windows-only, gated exactly like
//! `db::mod.rs`'s existing key accessors -- its own DPAPI round-trip
//! tests only compile and run on Windows (see ADR-0088's disclosure).
pub mod oauth;
pub mod redirect_listener;
pub mod token_store;
