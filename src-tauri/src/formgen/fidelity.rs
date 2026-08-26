//! Structural/semantic fidelity verification — Wave 3. See
//! `docs/adr/0048-official-form-engine-sf1.md`'s "Template fidelity is a
//! hard requirement" reasoning.
//!
//! Byte-for-byte equality between the source template and a generated
//! output is not a meaningful goal — `umya-spreadsheet` rewrites
//! workbook-internal metadata (creation timestamps, calc-chain caches,
//! part ordering) on every save regardless of what cell data changed, so
//! two workbooks with identical structure can still differ byte-for-byte.
//! What this module proves instead is STRUCTURAL fidelity: the things a
//! teacher or DepEd reviewer would actually notice if broken — sheet
//! names/order/visibility, merged regions, formulas outside the
//! generator's own write range, row heights, column widths, defined
//! names (which is where a print area lives), and whether a sheet's
//! protection state changed.
//!
//! **Explicitly NOT verified here** (documented limitation, not an
//! oversight): per-cell font/fill/border objects, exact number formats,
//! images, and true byte-for-byte binary equality. `is_protected` checks
//! only whether a sheet has protection at all, not the protection
//! object's contents (e.g. a password could be silently dropped while
//! some protection state remains, and this comparator would still read
//! it as "preserved" — an independent-review-flagged limitation).
//! `SheetFidelitySnapshot::capture`'s `excluded_write_region` parameter
//! only supports a single rectangular exclusion box; a real template
//! whose generator writes to a non-rectangular set of cells would need
//! this widened, and any formula sitting in cells the box happens to
//! over-exclude (cells the generator never actually writes to, but
//! which fall inside the bounding rectangle anyway) will not be checked
//! either — see the caller in `umya_adapter.rs`'s
//! `fidelity_is_preserved_across_generation` test for a concrete
//! instance of this over-exclusion against this wave's own fixture. See
//! ADR-0048.

use std::collections::BTreeSet;

use umya_spreadsheet::Worksheet;

/// A snapshot of everything this module treats as "structural fidelity"
/// for one worksheet. `excluded_write_region` (1-based, inclusive
/// col_min, row_min, col_max, row_max) marks the cells the generator is
/// EXPECTED to change — formulas/values inside it are not compared,
/// since the generator legitimately writes there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SheetFidelitySnapshot {
    pub name: String,
    pub state: String,
    pub is_protected: bool,
    pub merge_ranges: BTreeSet<String>,
    pub row_heights: BTreeSet<(u32, u64)>,
    pub column_widths: BTreeSet<(u32, u64)>,
    /// `(row, col) -> formula text`, excluding the write region.
    pub formulas_outside_write_region: BTreeSet<(u32, u32, String)>,
    /// `(name, address)` pairs — this is where a sheet's print area
    /// lives (as a `_xlnm.Print_Area` defined name), so this is what
    /// actually proves the print-area claim in this module's own doc
    /// comment, which an earlier version of this struct made without
    /// implementing (an independent review finding).
    pub defined_names: BTreeSet<(String, String)>,
}

impl SheetFidelitySnapshot {
    pub fn capture(sheet: &Worksheet, excluded_write_region: Option<(u32, u32, u32, u32)>) -> Self {
        let merge_ranges = sheet.merge_cells().iter().map(|r| r.range()).collect();

        let row_heights = sheet
            .row_dimensions()
            .iter()
            .map(|r| (r.row_num(), r.height().to_bits()))
            .collect();

        let column_widths = sheet
            .column_dimensions()
            .iter()
            .map(|c| (c.col_num(), c.width().to_bits()))
            .collect();

        let formulas_outside_write_region = sheet
            .cells()
            .iter()
            .filter(|cell| cell.is_formula())
            .filter_map(|cell| {
                let col = cell.coordinate().col_num();
                let row = cell.coordinate().row_num();
                let inside_write_region =
                    excluded_write_region.is_some_and(|(col_min, row_min, col_max, row_max)| {
                        col >= col_min && col <= col_max && row >= row_min && row <= row_max
                    });
                if inside_write_region {
                    None
                } else {
                    Some((row, col, cell.formula().to_string()))
                }
            })
            .collect();

        let defined_names = sheet
            .defined_names()
            .iter()
            .map(|d| (d.name().to_string(), d.address()))
            .collect();

        SheetFidelitySnapshot {
            name: sheet.name().to_string(),
            state: sheet.sheet_state().to_string(),
            is_protected: sheet.sheet_protection().is_some(),
            merge_ranges,
            row_heights,
            column_widths,
            formulas_outside_write_region,
            defined_names,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FidelityReport {
    pub differences: Vec<String>,
}

impl FidelityReport {
    pub fn is_fidelity_preserved(&self) -> bool {
        self.differences.is_empty()
    }
}

/// Compares a "before" and "after" snapshot of the same sheet, treating
/// any difference as a fidelity violation worth reporting by name (not
/// just a boolean pass/fail) so a failure is diagnosable.
pub fn compare(before: &SheetFidelitySnapshot, after: &SheetFidelitySnapshot) -> FidelityReport {
    let mut differences = Vec::new();

    if before.name != after.name {
        differences.push(format!(
            "sheet name changed: {:?} -> {:?}",
            before.name, after.name
        ));
    }
    if before.state != after.state {
        differences.push(format!(
            "sheet '{}' visibility state changed: {:?} -> {:?}",
            before.name, before.state, after.state
        ));
    }
    if before.is_protected != after.is_protected {
        differences.push(format!(
            "sheet '{}' protection state changed: {} -> {}",
            before.name, before.is_protected, after.is_protected
        ));
    }
    if before.merge_ranges != after.merge_ranges {
        differences.push(format!(
            "sheet '{}' merged cell ranges changed: {:?} -> {:?}",
            before.name, before.merge_ranges, after.merge_ranges
        ));
    }
    if before.row_heights != after.row_heights {
        differences.push(format!("sheet '{}' row heights changed", before.name));
    }
    if before.column_widths != after.column_widths {
        differences.push(format!("sheet '{}' column widths changed", before.name));
    }
    if before.formulas_outside_write_region != after.formulas_outside_write_region {
        differences.push(format!(
            "sheet '{}' has formulas outside the write region that changed or disappeared",
            before.name
        ));
    }
    if before.defined_names != after.defined_names {
        differences.push(format!(
            "sheet '{}' defined names changed (this is where a print area lives): {:?} -> {:?}",
            before.name, before.defined_names, after.defined_names
        ));
    }

    FidelityReport { differences }
}
