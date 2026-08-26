//! Row-level validation: turns one normalized [`Sf1ImportRow`] into a list
//! of [`Sf1ValidationIssue`]s. A row with at least one `Error` is excluded
//! from commit entirely; a row with only `Warning`s (or none) is eligible,
//! pending duplicate matching. Every message is a fixed, generic string —
//! never the offending cell's actual text — per this milestone's
//! no-PII-in-diagnostics rule.

use crate::import::sf1::{IssueSeverity, Sf1ImportRow, Sf1ValidationIssue};

fn error(row_number: usize, field: &str, message: &str) -> Sf1ValidationIssue {
    Sf1ValidationIssue {
        row_number,
        field: field.to_string(),
        severity: IssueSeverity::Error,
        message: message.to_string(),
    }
}

fn warning(row_number: usize, field: &str, message: &str) -> Sf1ValidationIssue {
    Sf1ValidationIssue {
        row_number,
        field: field.to_string(),
        severity: IssueSeverity::Warning,
        message: message.to_string(),
    }
}

fn looks_like_iso_date(candidate: &str) -> bool {
    let bytes = candidate.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && candidate[0..4].bytes().all(|b| b.is_ascii_digit())
        && candidate[5..7].bytes().all(|b| b.is_ascii_digit())
        && candidate[8..10].bytes().all(|b| b.is_ascii_digit())
}

pub fn validate_row(row: &Sf1ImportRow) -> Vec<Sf1ValidationIssue> {
    let mut issues = Vec::new();
    let r = row.row_number;

    if row.given_name.is_none() {
        issues.push(error(r, "given_name", "given name is missing"));
    }
    if row.family_name.is_none() {
        issues.push(error(r, "family_name", "family name is missing"));
    }
    if row.lrn_was_present_but_invalid {
        issues.push(error(
            r,
            "lrn",
            "LRN was present but is not a valid 12-digit identifier",
        ));
    } else if row.lrn.is_none() {
        issues.push(warning(r, "lrn", "no LRN was given for this row"));
    }

    if row.sex_was_present_but_unrecognized {
        issues.push(warning(
            r,
            "sex",
            "sex value could not be interpreted and was left unrecorded",
        ));
    } else if row.sex.is_none() {
        issues.push(warning(r, "sex", "no sex was given for this row"));
    }

    if let Some(birthdate) = &row.birthdate {
        if !looks_like_iso_date(birthdate) {
            issues.push(warning(
                r,
                "birthdate",
                "birthdate could not be interpreted as a date",
            ));
        }
    }

    issues
}

pub fn has_error(issues: &[Sf1ValidationIssue]) -> bool {
    issues.iter().any(|i| i.severity == IssueSeverity::Error)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_row() -> Sf1ImportRow {
        Sf1ImportRow {
            row_number: 4,
            given_name: Some("Ana".to_string()),
            family_name: Some("Dela Cruz".to_string()),
            lrn: Some("123456789012".to_string()),
            lrn_was_present_but_invalid: false,
            sex: Some("F".to_string()),
            sex_was_present_but_unrecognized: false,
            birthdate: Some("2015-06-15".to_string()),
            remarks: None,
        }
    }

    #[test]
    fn a_fully_populated_valid_row_has_no_issues() {
        assert_eq!(validate_row(&valid_row()), Vec::new());
    }

    #[test]
    fn a_missing_given_name_is_a_hard_error() {
        let row = Sf1ImportRow {
            given_name: None,
            ..valid_row()
        };
        let issues = validate_row(&row);
        assert!(has_error(&issues));
        assert!(issues
            .iter()
            .any(|i| i.field == "given_name" && i.severity == IssueSeverity::Error));
    }

    #[test]
    fn a_missing_family_name_is_a_hard_error() {
        let row = Sf1ImportRow {
            family_name: None,
            ..valid_row()
        };
        let issues = validate_row(&row);
        assert!(has_error(&issues));
    }

    #[test]
    fn an_invalid_lrn_is_a_hard_error() {
        let row = Sf1ImportRow {
            lrn_was_present_but_invalid: true,
            lrn: None,
            ..valid_row()
        };
        let issues = validate_row(&row);
        assert!(has_error(&issues));
        assert!(issues
            .iter()
            .any(|i| i.field == "lrn" && i.severity == IssueSeverity::Error));
    }

    #[test]
    fn a_missing_lrn_is_only_a_warning_not_an_error() {
        let row = Sf1ImportRow {
            lrn: None,
            lrn_was_present_but_invalid: false,
            ..valid_row()
        };
        let issues = validate_row(&row);
        assert!(!has_error(&issues));
        assert!(issues
            .iter()
            .any(|i| i.field == "lrn" && i.severity == IssueSeverity::Warning));
    }

    #[test]
    fn an_unrecognized_sex_is_only_a_warning_not_an_error() {
        let row = Sf1ImportRow {
            sex: None,
            sex_was_present_but_unrecognized: true,
            ..valid_row()
        };
        let issues = validate_row(&row);
        assert!(!has_error(&issues));
        assert!(issues
            .iter()
            .any(|i| i.field == "sex" && i.severity == IssueSeverity::Warning));
    }

    #[test]
    fn an_unparseable_birthdate_is_a_warning() {
        let row = Sf1ImportRow {
            birthdate: Some("not a date".to_string()),
            ..valid_row()
        };
        let issues = validate_row(&row);
        assert!(!has_error(&issues));
        assert!(issues.iter().any(|i| i.field == "birthdate"));
    }

    #[test]
    fn no_birthdate_at_all_produces_no_birthdate_issue() {
        let row = Sf1ImportRow {
            birthdate: None,
            ..valid_row()
        };
        assert!(!validate_row(&row).iter().any(|i| i.field == "birthdate"));
    }

    #[test]
    fn validation_messages_never_contain_the_actual_name_values() {
        let row = Sf1ImportRow {
            given_name: None,
            family_name: Some("A Real Sounding Family Name".to_string()),
            ..valid_row()
        };
        let issues = validate_row(&row);
        for issue in &issues {
            assert!(!issue.message.contains("A Real Sounding Family Name"));
        }
    }

    #[test]
    fn has_error_is_false_for_warnings_only() {
        let issues = vec![warning(1, "lrn", "no LRN was given for this row")];
        assert!(!has_error(&issues));
    }

    #[test]
    fn has_error_is_true_when_any_error_is_present() {
        let issues = vec![
            warning(1, "lrn", "no LRN was given for this row"),
            error(1, "given_name", "given name is missing"),
        ];
        assert!(has_error(&issues));
    }
}
