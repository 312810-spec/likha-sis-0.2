//! Pure parsing/validation for a bulk learner-import file. No database
//! access here -- duplicate detection and the actual create/update/skip
//! decisions live in `repository::learner_import`, which calls into this
//! module for the row-shape validation every row needs regardless of
//! what else touches the database.

use serde::Serialize;

use super::csv;

/// The exact, required header -- a fixed template rather than flexible
/// column matching, so a teacher-facing bulk-import file has one
/// unambiguous shape to prepare against (matches this project's existing
/// preference for explicit, disclosed behavior over inferred/fuzzy
/// matching -- see `docs/adr/0046-learner-core-bulk-import.md`).
const EXPECTED_HEADER: [&str; 4] = ["given_name", "family_name", "lrn", "sex"];

/// One parsed row from the import file. `error` is `Some` when the row's
/// own values fail validation (missing name, malformed LRN/sex) -- the
/// row is still returned (not dropped) so a caller can show the teacher
/// exactly which row is wrong and why, rather than rejecting the whole
/// file for one bad line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedImportRow {
    pub row_number: usize,
    pub given_name: String,
    pub family_name: String,
    pub lrn: Option<String>,
    pub sex: Option<String>,
    pub error: Option<String>,
}

/// Parses `csv_text` into rows, validating the header and each row's own
/// field shape (not duplicates -- that needs the database, see
/// `repository::learner_import`). Returns `Err` only for a structurally
/// wrong file (missing/wrong header); a single bad row is reported via
/// that row's own `error` field instead, so the rest of a large import
/// file is still usable.
pub fn parse_rows(csv_text: &str) -> Result<Vec<ParsedImportRow>, String> {
    let raw_rows = csv::parse(csv_text);
    let mut rows = raw_rows.into_iter();

    let header = rows.next().ok_or_else(|| "the file is empty".to_string())?;
    let normalized_header: Vec<String> = header.iter().map(|h| h.trim().to_lowercase()).collect();
    if normalized_header != EXPECTED_HEADER {
        return Err(format!(
            "expected header \"{}\", got \"{}\"",
            EXPECTED_HEADER.join(","),
            header.join(",")
        ));
    }

    Ok(rows
        .enumerate()
        .map(|(index, fields)| parse_row(index + 1, &fields))
        .collect())
}

fn parse_row(row_number: usize, fields: &[String]) -> ParsedImportRow {
    if fields.len() != EXPECTED_HEADER.len() {
        return ParsedImportRow {
            row_number,
            given_name: fields.first().cloned().unwrap_or_default(),
            family_name: fields.get(1).cloned().unwrap_or_default(),
            lrn: None,
            sex: None,
            error: Some(format!(
                "expected {} columns, found {}",
                EXPECTED_HEADER.len(),
                fields.len()
            )),
        };
    }

    let given_name = fields[0].trim().to_string();
    let family_name = fields[1].trim().to_string();
    let lrn_raw = fields[2].trim();
    let sex_raw = fields[3].trim();

    let mut errors = Vec::new();
    if given_name.is_empty() {
        errors.push("given name is required".to_string());
    }
    if family_name.is_empty() {
        errors.push("family name is required".to_string());
    }

    let lrn = if lrn_raw.is_empty() {
        None
    } else if lrn_raw.len() == 12 && lrn_raw.chars().all(|c| c.is_ascii_digit()) {
        Some(lrn_raw.to_string())
    } else {
        errors.push("LRN must be exactly 12 digits".to_string());
        None
    };

    let sex = if sex_raw.is_empty() {
        None
    } else if sex_raw.eq_ignore_ascii_case("M") || sex_raw.eq_ignore_ascii_case("F") {
        Some(sex_raw.to_uppercase())
    } else {
        errors.push("sex must be M or F".to_string());
        None
    };

    ParsedImportRow {
        row_number,
        given_name,
        family_name,
        lrn,
        sex,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_well_formed_file_parses_with_no_errors() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,123456789012,F\nJose,Rizal,,M";

        let rows = parse_rows(csv).unwrap();

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].given_name, "Ana");
        assert_eq!(rows[0].lrn, Some("123456789012".to_string()));
        assert_eq!(rows[0].error, None);
        assert_eq!(rows[1].lrn, None);
        assert_eq!(rows[1].error, None);
    }

    #[test]
    fn the_header_is_case_insensitive() {
        let csv = "GIVEN_NAME,FAMILY_NAME,LRN,SEX\nAna,Cruz,,";
        assert!(parse_rows(csv).is_ok());
    }

    #[test]
    fn a_wrong_header_is_rejected_before_any_row_is_parsed() {
        let csv = "first,last,id,gender\nAna,Cruz,,";
        assert!(parse_rows(csv).is_err());
    }

    #[test]
    fn an_empty_file_is_rejected() {
        assert!(parse_rows("").is_err());
    }

    #[test]
    fn a_missing_given_name_is_flagged_on_its_own_row_not_the_whole_file() {
        let csv = "given_name,family_name,lrn,sex\n,Cruz,,\nJose,Rizal,,";

        let rows = parse_rows(csv).unwrap();

        assert!(rows[0].error.as_ref().unwrap().contains("given name"));
        assert_eq!(rows[1].error, None, "the second, valid row is unaffected");
    }

    #[test]
    fn a_malformed_lrn_is_flagged_with_a_clear_message() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,not-a-number,";
        let rows = parse_rows(csv).unwrap();
        assert!(rows[0].error.as_ref().unwrap().contains("12 digits"));
    }

    #[test]
    fn an_lrn_with_the_wrong_digit_count_is_flagged() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,123,";
        let rows = parse_rows(csv).unwrap();
        assert!(rows[0].error.is_some());
    }

    #[test]
    fn an_invalid_sex_value_is_flagged() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,,Female";
        let rows = parse_rows(csv).unwrap();
        assert!(rows[0].error.as_ref().unwrap().contains("M or F"));
    }

    #[test]
    fn sex_is_normalized_to_uppercase() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,,f";
        let rows = parse_rows(csv).unwrap();
        assert_eq!(rows[0].sex, Some("F".to_string()));
    }

    #[test]
    fn a_row_with_the_wrong_column_count_is_flagged_not_panicked_on() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz";
        let rows = parse_rows(csv).unwrap();
        assert!(rows[0].error.is_some());
    }

    #[test]
    fn row_numbers_are_1_indexed_and_exclude_the_header() {
        let csv = "given_name,family_name,lrn,sex\nAna,Cruz,,\nJose,Rizal,,";
        let rows = parse_rows(csv).unwrap();
        assert_eq!(rows[0].row_number, 1);
        assert_eq!(rows[1].row_number, 2);
    }

    #[test]
    fn multiple_errors_on_one_row_are_all_reported_together() {
        let csv = "given_name,family_name,lrn,sex\n,,bad,X";
        let rows = parse_rows(csv).unwrap();
        let error = rows[0].error.as_ref().unwrap();
        assert!(error.contains("given name"));
        assert!(error.contains("family name"));
        assert!(error.contains("12 digits"));
        assert!(error.contains("M or F"));
    }
}
