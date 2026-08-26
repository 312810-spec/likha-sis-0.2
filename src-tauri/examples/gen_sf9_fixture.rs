//! One-time generator for the SF9 SYNTHETIC fixture used by
//! `formgen::sf9`/`formgen::umya_adapter`'s tests and the bundled
//! `resources/sf9/` template. NOT an official DepEd document — see
//! `formgen::template::SF9_SYNTHETIC_V1`'s doc comment. Run with:
//!
//! ```text
//! cargo run --example gen_sf9_fixture
//! ```
//!
//! then update `SF9_SYNTHETIC_V1.expected_sha256` in
//! `src/formgen/template.rs` to match the printed hash, and copy the
//! fixture to `src-tauri/resources/sf9/sf9_template_synthetic.xlsx` (see
//! `formgen.rs`'s existing byte-identity test for the SF1 precedent this
//! follows).

use std::path::Path;

fn main() {
    let mut book = umya_spreadsheet::new_file();
    book.new_sheet("SF9").unwrap();
    // umya_spreadsheet::new_file() ships a default "Sheet1" -- remove it
    // so the fixture's sheet list is exactly what the descriptor expects.
    book.remove_sheet_by_name("Sheet1").unwrap();
    let sheet = book.sheet_by_name_mut("SF9").unwrap();

    // Row 1-2: form title labels (not read by the generator, present for
    // structural realism only).
    sheet
        .cell_mut((1u32, 1u32))
        .set_value_string("SF9 (SYNTHETIC) - Learner's Progress Report Card".to_string());

    // Row 3-8: header labels + the cells the generator writes (col B).
    let header_labels = [
        "Learner's Name",
        "LRN",
        "Sex",
        "Grade Level",
        "Section",
        "School Year",
    ];
    for (i, label) in header_labels.iter().enumerate() {
        let row = 3 + i as u32;
        sheet.cell_mut((1u32, row)).set_value_string(*label);
    }

    // Row 9: subject-row column headers.
    let column_labels = ["Subject", "Grading Period", "Grade", ""];
    for (i, label) in column_labels.iter().enumerate() {
        sheet
            .cell_mut((1u32 + i as u32, 9u32))
            .set_value_string(*label);
    }

    // Row 22 (first_data_row=10 + max_learner_rows(12) = 22): a footer
    // formula counting filled subject rows, mirroring SF1's fidelity-test
    // pattern (`umya_adapter`'s `writing_the_full_learner_capacity_...`
    // test) so a future SF9 fidelity test has a real formula to protect.
    sheet.cell_mut((2u32, 22u32)).set_formula("COUNTA(A10:A21)");

    let out_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    std::fs::create_dir_all(&out_dir).unwrap();
    let out_path = out_dir.join("sf9_template_synthetic.xlsx");
    umya_spreadsheet::writer::xlsx::write(&book, &out_path).unwrap();

    let bytes = std::fs::read(&out_path).unwrap();
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = hasher.finalize();
    let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
    println!("Wrote {}", out_path.display());
    println!("sha256: {hex}");
}
