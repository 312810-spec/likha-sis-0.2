//! Official-form generation engine — Wave 3. See
//! `docs/adr/0048-official-form-engine-sf1.md`.
//!
//! Layering (do not shortcut, per `.claude/rules/architecture.md`):
//!
//! ```text
//! commands::formgen          (Tauri command / application-service role —
//!                              reads authorized data via repositories,
//!                              builds a domain request, resolves the
//!                              output path, invokes the port below)
//!         |
//! formgen::OfficialFormGenerator   (port — this module)
//!         |
//! formgen::umya_adapter      (infrastructure adapter — the only module
//!                              that imports `umya_spreadsheet`)
//!         |
//! Trusted bundled template (`resources/sf1/`, verified by
//! formgen::template before any parsing is attempted)
//! ```
//!
//! Nothing above the port knows this adapter exists, and nothing below
//! the port knows about SQLite, sessions, or Tauri — the same discipline
//! `import::psgc`/`repository::reference_geo` already established in
//! Wave 2G. Switching to a different runtime (e.g. the Java/Apache POI
//! sidecar recorded as this ADR's Next Best) means writing a new module
//! that implements the same trait, not touching `commands::formgen` or
//! `formgen::sf1`'s domain contract.

// Test-only: `fidelity::SheetFidelitySnapshot` is typed directly against
// `umya_spreadsheet::Worksheet` (it needs to be, to actually inspect
// merges/formulas/sizing), so gating it out of the production build is
// what keeps `umya_adapter` the only PRODUCTION module coupled to that
// crate — an earlier version of this module claimed that in prose while
// `fidelity` was still an unconditional `pub mod`, which independent
// review caught as false. If a future switch to a different runtime
// (e.g. the Java/Apache POI sidecar recorded as this ADR's Next Best)
// ever needs runtime fidelity verification, that comparator would need
// to re-parse output bytes independently rather than reuse this module
// as-is — see docs/adr/0048-official-form-engine-sf1.md.
#[cfg(test)]
pub(crate) mod fidelity;
// Provenance/fidelity evidence registry — Wave 2K, see
// docs/adr/0051-official-form-template-evidence-registry.md.
pub mod evidence;
pub mod sf1;
pub mod sf9;
pub mod sf9_projection;
pub mod template;
pub mod umya_adapter;

use std::path::Path;

use crate::error::AppResult;
use crate::formgen::sf1::{Sf1GenerationRequest, Sf1GenerationResult};
use crate::formgen::sf9::{Sf9GenerationRequest, Sf9GenerationResult};

/// The application/domain-facing port an SF1-capable official-form
/// runtime implements. `template_bytes` is passed in by the caller
/// (already read from the trusted bundled resource) rather than
/// resolved inside the adapter, so this trait — and everything that
/// depends on it — never needs to know about Tauri's resource-
/// resolution API.
///
/// Deliberately kept SF1-specific rather than widened into one generic
/// multi-form method (Wave 2I, docs/adr/0049-multi-form-official-form-
/// contract.md): a shared/generic request type is exactly how a form-
/// specific mapping bug (e.g. an SF9 field landing on an SF1 cell)
/// would silently compile. Each official form gets its own port method
/// with its own typed request/result — see `Sf9FormGenerator` below for
/// the second one this wave adds.
pub trait OfficialFormGenerator {
    fn generate_sf1(
        &self,
        template_bytes: &[u8],
        request: &Sf1GenerationRequest,
        output_path: &Path,
    ) -> AppResult<Sf1GenerationResult>;
}

/// The application/domain-facing port an SF9-capable official-form
/// runtime implements. See `OfficialFormGenerator`'s doc comment for
/// why this is a separate trait rather than a shared generic method.
pub trait Sf9FormGenerator {
    fn generate_sf9(
        &self,
        template_bytes: &[u8],
        request: &Sf9GenerationRequest,
        output_path: &Path,
    ) -> AppResult<Sf9GenerationResult>;
}
