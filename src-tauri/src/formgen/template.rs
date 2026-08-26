//! Official-form template registry — Wave 3. See
//! `docs/adr/0048-official-form-engine-sf1.md`.
//!
//! A `TemplateDescriptor` is this project's reusable "template identity"
//! concept: which form type, which authoritative version, which exact
//! bytes are trusted, and the minimal structural shape the generator
//! requires before it will write into a copy. Nothing here is derived
//! from an arbitrary caller-supplied filename — the generator only ever
//! loads a fixed, bundled resource path (see `commands::formgen`), and
//! this module is what refuses to treat an unexpected/corrupted file as
//! if it were that trusted resource.

use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

/// Identity and structural-shape facts about one official-form template.
/// `expected_sha256` pins the EXACT bytes this project currently trusts
/// as the SF1 template — any drift (a corrupted download, a
/// hand-edited file, a wrong file at the resource path) fails identity
/// verification before a single cell is touched.
#[derive(Debug, Clone, Copy)]
pub struct TemplateDescriptor {
    pub form_type: &'static str,
    /// Authoritative-template version identifier. Distinct from a git
    /// commit or a `downloaded_at` timestamp — see ADR-0047's own
    /// `authoritative_version` precedent for why that distinction
    /// matters. `"synthetic-v1"` here because no authoritative DepEd
    /// template exists to version against (see ADR-0048's evidence
    /// gate) — a real template would carry a real DepEd-published
    /// version/school-year identifier instead.
    pub version: &'static str,
    pub expected_sha256: &'static str,
    pub data_sheet_name: &'static str,
    pub other_expected_sheet_names: &'static [&'static str],
    /// 1-based row of the first learner data row on `data_sheet_name`.
    pub first_data_row: u32,
    /// Maximum number of learner rows the template has room for. A
    /// request with more learners than this is rejected outright — the
    /// generator never grows the template, since inserting rows would
    /// disturb the footer formula/layout this wave's fidelity guarantee
    /// depends on.
    pub max_learner_rows: u32,
    /// 1-based columns for LRN / Family Name / Given Name / Sex on
    /// `data_sheet_name`, in that order.
    pub data_columns: [u32; 4],
    /// 1-based (col, row) of the header info cells this generator
    /// fills: school name, school year, grade level, section name, in
    /// that order.
    pub header_cells: [(u32, u32); 4],
}

/// The one template this wave implements. See ADR-0048's "Authoritative-
/// template evidence gate" — this is a synthetic fixture, not an
/// official DepEd document; official SF1 fidelity is NOT_VERIFIED.
pub const SF1_SYNTHETIC_V1: TemplateDescriptor = TemplateDescriptor {
    form_type: "SF1",
    version: "synthetic-v1",
    expected_sha256: "842e8892faf3daae6778324d041309f9301b5ba0da0bd6bbf5631fea05c18d06",
    data_sheet_name: "SF1",
    other_expected_sheet_names: &["Notes"],
    first_data_row: 9,
    max_learner_rows: 30,
    data_columns: [1, 2, 3, 4],                     // A, B, C, D
    header_cells: [(2, 3), (2, 4), (2, 5), (2, 6)], // B3, B4, B5, B6
};

/// Verifies `bytes` are exactly the trusted template `descriptor`
/// describes, by content hash. This is the FIRST check the generator
/// runs, before any workbook parsing is attempted — a hash mismatch is
/// rejected with no attempt to interpret the bytes as a spreadsheet at
/// all, since a file that isn't byte-identical to the trusted template
/// is, by this project's definition, not that template.
pub fn verify_identity(descriptor: &TemplateDescriptor, bytes: &[u8]) -> AppResult<()> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let actual = hex_encode(&hasher.finalize());

    if actual != descriptor.expected_sha256 {
        return Err(AppError::FormGeneration(
            "the SF1 template does not match the expected trusted template and was rejected \
             before any data was written"
                .to_string(),
        ));
    }
    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_bytes() -> Vec<u8> {
        std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/sf1_template_synthetic.xlsx"),
        )
        .unwrap()
    }

    #[test]
    fn the_real_fixture_passes_identity_verification() {
        let bytes = fixture_bytes();
        assert!(verify_identity(&SF1_SYNTHETIC_V1, &bytes).is_ok());
    }

    #[test]
    fn a_single_byte_change_fails_identity_verification() {
        let mut bytes = fixture_bytes();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xFF;
        assert!(verify_identity(&SF1_SYNTHETIC_V1, &bytes).is_err());
    }

    #[test]
    fn an_empty_file_fails_identity_verification() {
        assert!(verify_identity(&SF1_SYNTHETIC_V1, &[]).is_err());
    }
}
