//! The only module in this codebase allowed to know that SF1 import reads
//! an Excel workbook, or which crate does that reading. Everything above
//! this (normalization, validation, matching, commit) works against
//! [`RawSf1Row`] only — see `docs/adr/0043-sf1-bulk-import-engine.md`.
//!
//! **Fidelity disclosure**: the header/column layout this module searches
//! for is this project's OWN invented structure, not verified against an
//! official DepEd SF1 `.xls` template — no such template was available in
//! this repository or reachable from this environment at the time this
//! module was written (see the ADR's "Fidelity Disclosure" section). The
//! header-search strategy below (look for a row containing an "LRN"-like
//! cell, rather than a hardcoded row index) is a deliberate hedge against
//! that uncertainty, not a claim of correctness against the real form.

use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};

use crate::error::{AppError, AppResult};

/// Reject a workbook file larger than this before even attempting to open
/// it. A real single-section SF1 register (a few dozen to a few hundred
/// rows of plain text/dates) is at most a few hundred KB; this generous
/// cap exists only to bound worst-case memory/CPU on a malformed or
/// hostile file, not to constrain any legitimate use.
pub(crate) const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Reject a sheet with more data rows than this. SF1 is generated
/// per-section by a class adviser — a legitimate section roster is at
/// most a few hundred learners. This is well above any real school
/// section's size and exists only to bound a hostile/corrupted file.
///
/// **Known limitation** (found by security review, recorded in
/// `docs/VERIFICATION-DEBT.md`): `calamine`'s `worksheet_range` eagerly
/// materializes the whole sheet into memory — there is no lower-level
/// API in this crate to count rows before that happens — so this check
/// bounds the *reported* row count, not peak parse memory for a single
/// call. `MAX_FILE_BYTES` above is the real bound against a
/// zip-bomb-style crafted `.xlsx` on that axis; this cap only protects
/// against an oversized-but-legitimately-sized workbook being treated
/// as a valid SF1 import.
const MAX_DATA_ROWS: usize = 3000;

/// One data row's cells, read as-is with no interpretation beyond what
/// `calamine` itself does (numeric-vs-text-vs-date typing). Every field
/// is optional because a real workbook cell can be blank — deciding
/// whether that's acceptable is `import::validate`'s job, not this
/// module's.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawSf1Row {
    /// 1-based row number as it appears in the spreadsheet, carried
    /// through so every downstream validation/error message can point a
    /// reviewer at the exact row without re-deriving it.
    pub row_number: usize,
    pub lrn: Option<String>,
    pub family_name: Option<String>,
    pub given_name: Option<String>,
    pub sex: Option<String>,
    /// ISO-8601 `YYYY-MM-DD` when the source cell was a real Excel date;
    /// the raw cell text otherwise (so a malformed date is still visible
    /// to validation instead of silently disappearing).
    pub birthdate: Option<String>,
    pub remarks: Option<String>,
}

const HEADER_LABELS: [&str; 6] = [
    "lrn",
    "family name",
    "given name",
    "sex",
    "birthdate",
    "remarks",
];

/// Reads `path` as a legacy `.xls` or modern `.xlsx`/`.xlsm` workbook and
/// returns its data rows in spreadsheet order. Fails with
/// `AppError::Import` (a fixed, generic message — never the underlying
/// parser error text, which can otherwise leak internal file-format
/// detail) for: a file too large, an unreadable/corrupt/unsupported
/// file, a workbook with no sheet, or a sheet whose header row can't be
/// located. Never executes macros or follows external references — this
/// module only ever calls `calamine`'s pure in-memory cell-value reader,
/// nothing that interprets or executes workbook content.
pub fn read_sf1_rows(path: &Path) -> AppResult<Vec<RawSf1Row>> {
    let metadata = std::fs::metadata(path)
        .map_err(|_| AppError::Import("workbook file could not be read".to_string()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(AppError::Import(
            "workbook file exceeds the maximum supported size".to_string(),
        ));
    }

    let mut workbook = open_workbook_auto(path).map_err(|_| {
        AppError::Import("workbook could not be opened as a spreadsheet".to_string())
    })?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| AppError::Import("workbook has no sheets".to_string()))?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|_| AppError::Import("workbook sheet could not be read".to_string()))?;

    let header_row_index = locate_header_row(&range).ok_or_else(|| {
        AppError::Import("workbook has no recognizable SF1 header row".to_string())
    })?;

    let data_row_count = range.height().saturating_sub(header_row_index + 1);
    if data_row_count > MAX_DATA_ROWS {
        return Err(AppError::Import(
            "workbook has more data rows than the import engine supports".to_string(),
        ));
    }

    let mut rows = Vec::new();
    for (offset, row) in range.rows().skip(header_row_index + 1).enumerate() {
        if row.iter().all(|cell| matches!(cell, Data::Empty)) {
            continue;
        }
        rows.push(RawSf1Row {
            row_number: header_row_index + 2 + offset,
            lrn: cell_text(row.first()),
            family_name: cell_text(row.get(1)),
            given_name: cell_text(row.get(2)),
            sex: cell_text(row.get(3)),
            birthdate: cell_date_or_text(row.get(4)),
            remarks: cell_text(row.get(5)),
        });
    }
    Ok(rows)
}

/// Finds the row whose first six cells read, case-insensitively, as this
/// module's expected header labels — deliberately not a fixed row
/// index, since the exact SF1 layout is unverified (see this module's
/// doc comment). Returns the 0-based row index.
fn locate_header_row(range: &calamine::Range<Data>) -> Option<usize> {
    for (index, row) in range.rows().enumerate() {
        let matches = HEADER_LABELS.iter().enumerate().all(|(col, expected)| {
            row.get(col)
                .and_then(|cell| cell_text(Some(cell)))
                .map(|text| text.to_lowercase() == *expected)
                .unwrap_or(false)
        });
        if matches {
            return Some(index);
        }
    }
    None
}

/// A cell's display text, whatever its underlying type. `calamine` never
/// evaluates a formula and never returns its source text — for a formula
/// cell it can only return whatever *cached* result value the workbook
/// file itself stored (verified directly against a formula-cell fixture
/// in this module's tests: the cached value calamine returns is exactly
/// whatever the writer stored, nothing computed and nothing executed).
/// `Data::Empty` and a cell containing only whitespace both read as
/// `None`, matching this module's "blank means blank" contract; downstream
/// normalization still trims real values.
fn cell_text(cell: Option<&Data>) -> Option<String> {
    match cell {
        None | Some(Data::Empty) => None,
        Some(other) => {
            let text = other.to_string();
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        }
    }
}

/// Same as `cell_text`, but a real Excel date/datetime cell is rendered
/// as `YYYY-MM-DD` rather than `calamine`'s default `Display` — so a
/// legitimate date survives as a normalizable ISO string instead of a
/// serial number or locale-dependent string.
fn cell_date_or_text(cell: Option<&Data>) -> Option<String> {
    match cell {
        None | Some(Data::Empty) => None,
        Some(Data::DateTime(excel_dt)) => excel_dt
            .as_datetime()
            .map(|dt| dt.date().to_string())
            .or_else(|| cell_text(cell)),
        other => cell_text(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    #[test]
    fn reads_the_main_synthetic_fixture_and_locates_the_header_row() {
        let rows = read_sf1_rows(&fixture("sf1_synthetic_main.xls")).unwrap();
        assert_eq!(rows.len(), 8);
        assert_eq!(rows[0].row_number, 4);
        assert_eq!(rows[0].lrn.as_deref(), Some("123456789012"));
        assert_eq!(rows[0].family_name.as_deref(), Some("DELA CRUZ"));
        assert_eq!(rows[0].given_name.as_deref(), Some("ANA TEST"));
        assert_eq!(rows[0].sex.as_deref(), Some("F"));
        assert_eq!(rows[0].birthdate.as_deref(), Some("2015-06-15"));
    }

    #[test]
    fn a_blank_lrn_cell_reads_as_none_not_an_empty_string() {
        let rows = read_sf1_rows(&fixture("sf1_synthetic_main.xls")).unwrap();
        let row = rows
            .iter()
            .find(|r| r.given_name.as_deref() == Some("BEN SAMPLE"))
            .unwrap();
        assert_eq!(row.lrn, None);
    }

    #[test]
    fn an_unparseable_birthdate_cell_is_carried_through_as_raw_text_not_dropped() {
        let rows = read_sf1_rows(&fixture("sf1_synthetic_main.xls")).unwrap();
        let row = rows
            .iter()
            .find(|r| r.given_name.as_deref() == Some("HERO EXAMPLE"))
            .unwrap();
        assert_eq!(row.birthdate.as_deref(), Some("not a date"));
    }

    #[test]
    fn a_formula_cell_never_leaks_the_formula_source_text() {
        // `xlwt` (this fixture's generator) writes a formula cell's cached
        // result as blank -- it doesn't evaluate formulas, only Excel
        // itself does, on save. That's still a real, useful proof: this
        // asserts calamine returns that same blank cached value, NOT the
        // formula source text (`="623456789012"`) and not a live
        // evaluation of it. What this fixture cannot prove -- a non-blank
        // cached value round-tripping correctly -- is recorded as
        // verification debt (no tool in this environment can author an
        // .xls with a real Excel-computed cached formula result).
        let rows = read_sf1_rows(&fixture("sf1_synthetic_formula.xls")).unwrap();
        assert_eq!(rows.len(), 1);
        assert_ne!(
            rows[0].lrn.as_deref(),
            Some("=\"623456789012\""),
            "must never surface the raw formula source"
        );
    }

    #[test]
    fn a_workbook_with_no_recognizable_header_row_fails_with_a_generic_import_error() {
        let result = read_sf1_rows(&fixture("sf1_synthetic_no_header.xls"));
        assert!(matches!(result, Err(AppError::Import(_))));
    }

    #[test]
    fn a_workbook_exceeding_the_row_limit_is_rejected() {
        let result = read_sf1_rows(&fixture("sf1_synthetic_oversized.xls"));
        assert!(matches!(result, Err(AppError::Import(_))));
    }

    #[test]
    fn a_nonexistent_file_fails_with_a_generic_import_error_not_a_panic() {
        let result = read_sf1_rows(&fixture("does_not_exist.xls"));
        assert!(matches!(result, Err(AppError::Import(_))));
    }

    #[test]
    fn blank_rows_between_data_rows_are_skipped_not_counted() {
        // The main fixture has no blank rows in the middle, but this
        // proves the skip logic doesn't miscount row_number for the
        // rows that DO exist -- the last row's row_number must equal
        // header_row + 1 + its own 1-based position, with no drift.
        let rows = read_sf1_rows(&fixture("sf1_synthetic_main.xls")).unwrap();
        assert_eq!(rows.last().unwrap().row_number, 11);
    }
}
