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
    /// Which workbook engine this template requires. Wave 2I's adapter
    /// policy (docs/adr/0048-official-form-engine-sf1.md, "Multi-form
    /// adapter policy"): the AUTHORITATIVE TEMPLATE'S ACTUAL FORMAT
    /// decides the infrastructure generator — `.xlsx` does not imply
    /// Java, `.xls` does not imply Rust. This field is what makes that
    /// policy a live, checked fact instead of prose: an adapter reads
    /// it and refuses formats it cannot handle (see
    /// `umya_adapter::UmyaFormGenerator::verify_structure`'s format
    /// check).
    pub workbook_format: WorkbookFormat,
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
    /// 1-based columns this generator writes per learner row, in a
    /// form-specific order the adapter and the form's own module agree
    /// on. A slice (not a fixed-size array) so different forms with
    /// different column counts (SF1's 4 vs. SF9's wider per-subject
    /// layout) can share this struct — a Wave 3 independent-review
    /// finding: the original `[u32; 4]` array was SF1-shaped and not
    /// reusable for a form with a different arity.
    pub data_columns: &'static [u32],
    /// 1-based (col, row) of the header info cells this generator
    /// fills, in a form-specific order. Same slice-not-array reasoning
    /// as `data_columns`.
    pub header_cells: &'static [(u32, u32)],
}

/// The workbook engine a template requires. See `TemplateDescriptor::
/// workbook_format`'s doc comment for why this exists — it is the
/// concrete, checked expression of the multi-form adapter policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkbookFormat {
    /// OOXML `.xlsx`/`.xlsm` — handled by `formgen::umya_adapter`.
    Xlsx,
    /// Legacy BIFF `.xls` — no adapter implements this yet (Wave 2I did
    /// not encounter a legacy-`.xls` authoritative template; ADR-0048's
    /// Next Best, a Java/Apache POI/HSSF sidecar, remains the recorded
    /// plan if one is ever found). `UmyaFormGenerator` rejects this
    /// variant outright rather than attempting to parse `.xls` bytes as
    /// OOXML — that rejection is the seam, proven by
    /// `umya_adapter::tests::rejects_a_template_declaring_legacy_xls_format`.
    LegacyXls,
}

/// The one template this wave implements. See ADR-0048's "Authoritative-
/// template evidence gate" — this is a synthetic fixture, not an
/// official DepEd document; official SF1 fidelity is NOT_VERIFIED.
pub const SF1_SYNTHETIC_V1: TemplateDescriptor = TemplateDescriptor {
    form_type: "SF1",
    workbook_format: WorkbookFormat::Xlsx,
    version: "synthetic-v1",
    expected_sha256: "842e8892faf3daae6778324d041309f9301b5ba0da0bd6bbf5631fea05c18d06",
    data_sheet_name: "SF1",
    other_expected_sheet_names: &["Notes"],
    first_data_row: 9,
    max_learner_rows: 30,
    data_columns: &[1, 2, 3, 4],                     // A, B, C, D
    header_cells: &[(2, 3), (2, 4), (2, 5), (2, 6)], // B3, B4, B5, B6
};

/// SF9 (Learner's Progress Report Card) — Wave 2I. No authoritative
/// DepEd SF9 template was found anywhere in this repository or
/// obtainable from `deped.gov.ph` directly (confirmed by direct fetch
/// of the department's own homepage during this wave's evidence gate —
/// no School Forms/SF9 link is discoverable there; every other hit was
/// a third-party/community recreation, explicitly disqualified by this
/// project's evidence-gate discipline, see ADR-0043/ADR-0047/ADR-0048).
/// This descriptor and its fixture therefore exist ONLY to prove the
/// generalized architecture accepts a second, differently-shaped form —
/// `OFFICIAL_SF9_FIDELITY = NOT_VERIFIED`, and this constant must never
/// be presented to a user as an official DepEd SF9.
pub const SF9_SYNTHETIC_V1: TemplateDescriptor = TemplateDescriptor {
    form_type: "SF9",
    workbook_format: WorkbookFormat::Xlsx,
    version: "synthetic-v1",
    expected_sha256: "aa5b61d13e3885fab8d49f527ab28dc1fa6ca8477389d5a25032873c45cee8fb",
    data_sheet_name: "SF9",
    other_expected_sheet_names: &[],
    first_data_row: 10,
    // Named `max_learner_rows` for parity with `TemplateDescriptor`'s
    // other form (SF1's rows are one PER LEARNER); here it means "max
    // subject rows" — one SF9 output covers exactly one learner across
    // all subjects, not multiple learners.
    max_learner_rows: 12,
    // One row per (subject, grading period) pair -- not one row per
    // subject with fixed term columns, since a section's actual number
    // of grading periods is data, not a template constant. Columns:
    // subject name, grading period label, term grade (blank if not yet
    // computed), unused.
    data_columns: &[1, 2, 3, 4],
    // Learner name, LRN, sex, grade level, section, school year.
    header_cells: &[(2, 3), (2, 4), (2, 5), (2, 6), (2, 7), (2, 8)],
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

    fn sf9_fixture_bytes() -> Vec<u8> {
        std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/sf9_template_synthetic.xlsx"),
        )
        .unwrap()
    }

    #[test]
    fn the_sf9_fixture_passes_its_own_identity_verification() {
        assert!(verify_identity(&SF9_SYNTHETIC_V1, &sf9_fixture_bytes()).is_ok());
    }

    #[test]
    fn the_sf1_fixture_fails_identity_verification_against_the_sf9_descriptor() {
        // A form's descriptor must reject a DIFFERENT form's (structurally
        // valid, correctly-hashed for its OWN descriptor) bytes -- proves
        // template identity is per-form, not just "any trusted-looking
        // workbook".
        assert!(verify_identity(&SF9_SYNTHETIC_V1, &fixture_bytes()).is_err());
    }
}
