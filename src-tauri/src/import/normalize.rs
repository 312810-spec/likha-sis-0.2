//! Turns a [`RawSf1Row`] into an [`Sf1ImportRow`] using only SAFE
//! normalization rules — the ones that cannot change what the workbook
//! actually said: trimming whitespace, treating a blank cell as absent,
//! canonicalizing an unambiguous sex encoding, and confirming an LRN's
//! *format* (never inventing or correcting one). Never guesses a missing
//! value, never "fixes" a name's spelling, never infers sex or LRN from
//! context. See `docs/adr/0043-sf1-bulk-import-engine.md`.

use crate::import::sf1::Sf1ImportRow;
use crate::import::workbook::RawSf1Row;

/// DepEd's LRN is always exactly 12 digits (see
/// `repository::learner::Learner::lrn`'s doc comment and the `learners`
/// table's own CHECK constraint) — the same rule enforced here, before a
/// value ever reaches the database, so a malformed LRN surfaces as a
/// row-level validation error instead of a generic SQL constraint
/// failure at commit time.
fn is_valid_lrn(candidate: &str) -> bool {
    candidate.len() == 12 && candidate.bytes().all(|b| b.is_ascii_digit())
}

/// Canonicalizes only encodings that are genuinely unambiguous. Anything
/// else (a typo, an unexpected abbreviation, a non-English word this
/// list doesn't happen to include) is deliberately left unrecognized
/// rather than guessed — see this module's doc comment.
fn canonicalize_sex(raw: &str) -> Option<&'static str> {
    match raw.trim().to_uppercase().as_str() {
        "M" | "MALE" => Some("M"),
        "F" | "FEMALE" => Some("F"),
        _ => None,
    }
}

fn non_empty_trimmed(raw: &Option<String>) -> Option<String> {
    raw.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

pub fn normalize_row(raw: &RawSf1Row) -> Sf1ImportRow {
    let given_name = non_empty_trimmed(&raw.given_name);
    let family_name = non_empty_trimmed(&raw.family_name);

    let lrn_trimmed = non_empty_trimmed(&raw.lrn);
    let (lrn, lrn_was_present_but_invalid) = match &lrn_trimmed {
        None => (None, false),
        Some(candidate) if is_valid_lrn(candidate) => (Some(candidate.clone()), false),
        Some(_) => (None, true),
    };

    let sex_trimmed = non_empty_trimmed(&raw.sex);
    let (sex, sex_was_present_but_unrecognized) = match &sex_trimmed {
        None => (None, false),
        Some(candidate) => match canonicalize_sex(candidate) {
            Some(canonical) => (Some(canonical.to_string()), false),
            None => (None, true),
        },
    };

    Sf1ImportRow {
        row_number: raw.row_number,
        given_name,
        family_name,
        lrn,
        lrn_was_present_but_invalid,
        sex,
        sex_was_present_but_unrecognized,
        birthdate: non_empty_trimmed(&raw.birthdate),
        remarks: non_empty_trimmed(&raw.remarks),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(row_number: usize) -> RawSf1Row {
        RawSf1Row {
            row_number,
            ..Default::default()
        }
    }

    #[test]
    fn trims_whitespace_from_names() {
        let mut r = raw(1);
        r.given_name = Some("  Ana  ".to_string());
        r.family_name = Some("  Dela Cruz ".to_string());

        let normalized = normalize_row(&r);

        assert_eq!(normalized.given_name.as_deref(), Some("Ana"));
        assert_eq!(normalized.family_name.as_deref(), Some("Dela Cruz"));
    }

    #[test]
    fn a_whitespace_only_name_normalizes_to_none_not_an_empty_string() {
        let mut r = raw(1);
        r.given_name = Some("   ".to_string());

        let normalized = normalize_row(&r);

        assert_eq!(normalized.given_name, None);
    }

    #[test]
    fn a_valid_12_digit_lrn_normalizes_through() {
        let mut r = raw(1);
        r.lrn = Some(" 123456789012 ".to_string());

        let normalized = normalize_row(&r);

        assert_eq!(normalized.lrn.as_deref(), Some("123456789012"));
        assert!(!normalized.lrn_was_present_but_invalid);
    }

    #[test]
    fn a_malformed_lrn_is_flagged_and_not_silently_accepted() {
        let mut r = raw(1);
        r.lrn = Some("12345".to_string());

        let normalized = normalize_row(&r);

        assert_eq!(normalized.lrn, None);
        assert!(normalized.lrn_was_present_but_invalid);
    }

    #[test]
    fn a_non_numeric_lrn_is_flagged_not_silently_accepted() {
        let mut r = raw(1);
        r.lrn = Some("12345678901X".to_string());

        let normalized = normalize_row(&r);

        assert_eq!(normalized.lrn, None);
        assert!(normalized.lrn_was_present_but_invalid);
    }

    #[test]
    fn a_missing_lrn_is_not_flagged_as_invalid() {
        let normalized = normalize_row(&raw(1));

        assert_eq!(normalized.lrn, None);
        assert!(!normalized.lrn_was_present_but_invalid);
    }

    #[test]
    fn unambiguous_sex_encodings_canonicalize() {
        for (input, expected) in [("M", "M"), ("male", "M"), ("F", "F"), ("Female", "F")] {
            let mut r = raw(1);
            r.sex = Some(input.to_string());

            let normalized = normalize_row(&r);

            assert_eq!(normalized.sex.as_deref(), Some(expected), "input: {input}");
            assert!(!normalized.sex_was_present_but_unrecognized);
        }
    }

    #[test]
    fn an_unrecognized_sex_value_is_flagged_and_never_guessed() {
        let mut r = raw(1);
        r.sex = Some("X".to_string());

        let normalized = normalize_row(&r);

        assert_eq!(normalized.sex, None);
        assert!(normalized.sex_was_present_but_unrecognized);
    }

    #[test]
    fn a_missing_sex_is_not_flagged_as_unrecognized() {
        let normalized = normalize_row(&raw(1));

        assert_eq!(normalized.sex, None);
        assert!(!normalized.sex_was_present_but_unrecognized);
    }

    #[test]
    fn row_number_is_carried_through_unchanged() {
        let normalized = normalize_row(&raw(42));
        assert_eq!(normalized.row_number, 42);
    }
}
