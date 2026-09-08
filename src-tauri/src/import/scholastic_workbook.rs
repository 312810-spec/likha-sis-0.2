//! Reads a DepEd multi-year scholastic `.xlsx` workbook into raw rows.
//! Same crate/idiom as `import::workbook` (SF1) — `calamine`,
//! header-search-not-fixed-row-index, same size/row caps — deliberately
//! NOT unified into one shared module: the SF1 doc comment already
//! discloses its own column layout is this project's own invented
//! structure, unverified against an official template, and this
//! importer's layout is an independent invention with its own columns.
//! Keeping them separate avoids implying a shared, verified contract
//! that doesn't exist. See
//! `docs/adr/0074-xlsx-scholastic-importer.md`.
//!
//! **Fidelity disclosure**: this session did not have an official DepEd
//! multi-year scholastic-history `.xlsx` template available to verify
//! column layout against. The header-search strategy (look for a row
//! whose first six cells match these exact labels, not a fixed row
//! index) is the same disclosed hedge `import::workbook` uses.

use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};

use crate::error::{AppError, AppResult};

pub(crate) const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;
/// A transferee's multi-year history is at most a few dozen subject-year
/// rows; this generous cap exists only to bound a hostile/corrupted file,
/// matching `import::workbook::MAX_DATA_ROWS`'s identical reasoning.
const MAX_DATA_ROWS: usize = 3000;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawScholasticRow {
    pub row_number: usize,
    pub lrn: Option<String>,
    pub school_year: Option<String>,
    pub grade_level: Option<String>,
    pub subject_name: Option<String>,
    pub final_grade: Option<String>,
    pub remarks: Option<String>,
    pub source_school_name: Option<String>,
}

const HEADER_LABELS: [&str; 6] = [
    "lrn",
    "school year",
    "grade level",
    "subject",
    "final grade",
    "remarks",
];

pub fn read_scholastic_rows(path: &Path) -> AppResult<Vec<RawScholasticRow>> {
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
        AppError::Import("workbook has no recognizable scholastic-history header row".to_string())
    })?;

    let data_row_count = range.height().saturating_sub(header_row_index + 1);
    if data_row_count > MAX_DATA_ROWS {
        return Err(AppError::Import(
            "workbook has more data rows than the import engine supports".to_string(),
        ));
    }

    let mut rows = Vec::new();
    for (offset, row) in range.rows().skip(header_row_index + 1).enumerate() {
        if row.iter().all(|cell| cell_text(Some(cell)).is_none()) {
            continue;
        }
        rows.push(RawScholasticRow {
            row_number: header_row_index + 2 + offset,
            lrn: cell_text(row.first()),
            school_year: cell_text(row.get(1)),
            grade_level: cell_text(row.get(2)),
            subject_name: cell_text(row.get(3)),
            final_grade: cell_text(row.get(4)),
            remarks: cell_text(row.get(5)),
            source_school_name: cell_text(row.get(6)),
        });
    }
    Ok(rows)
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use umya_spreadsheet::{new_file, writer};

    /// Builds a minimal `.xlsx` fixture in-memory using `umya-spreadsheet`
    /// (already a direct dependency for SF1 official-form generation —
    /// deliberately reused here rather than adding a second Excel-writing
    /// crate just for test fixtures).
    fn write_workbook(rows: &[[&str; 7]]) -> NamedTempFile {
        let file = NamedTempFile::with_suffix(".xlsx").unwrap();
        let mut book = new_file();
        let sheet = book.sheet_by_name_mut("Sheet1").unwrap();
        for (r, cells) in rows.iter().enumerate() {
            for (c, value) in cells.iter().enumerate() {
                sheet
                    .cell_mut(((c + 1) as u32, (r + 1) as u32))
                    .set_value_string(value.to_string());
            }
        }
        let mut out = std::fs::File::create(file.path()).unwrap();
        writer::xlsx::write_writer(&book, &mut out).unwrap();
        file
    }

    #[test]
    fn reads_one_data_row_after_the_header() {
        let file = write_workbook(&[
            [
                "LRN",
                "School Year",
                "Grade Level",
                "Subject",
                "Final Grade",
                "Remarks",
                "Source School",
            ],
            [
                "123456789012",
                "2024-2025",
                "4",
                "Mathematics",
                "88",
                "Promoted",
                "Synthetic Prior School",
            ],
        ]);

        let rows = read_scholastic_rows(file.path()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].lrn.as_deref(), Some("123456789012"));
        assert_eq!(rows[0].subject_name.as_deref(), Some("Mathematics"));
        assert_eq!(rows[0].final_grade.as_deref(), Some("88"));
    }

    #[test]
    fn skips_a_fully_blank_row() {
        let file = write_workbook(&[
            [
                "LRN",
                "School Year",
                "Grade Level",
                "Subject",
                "Final Grade",
                "Remarks",
                "Source School",
            ],
            ["", "", "", "", "", "", ""],
            [
                "123456789012",
                "2024-2025",
                "4",
                "Mathematics",
                "88",
                "",
                "",
            ],
        ]);

        let rows = read_scholastic_rows(file.path()).unwrap();
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn rejects_a_workbook_with_no_recognizable_header() {
        let file = write_workbook(&[["a", "b", "c", "d", "e", "f", "g"]]);
        let result = read_scholastic_rows(file.path());
        assert!(result.is_err());
    }
}
