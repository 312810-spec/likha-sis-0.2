//! A tiny, dependency-free CSV writer — the reusable "engine" piece for
//! every future official-form export, not just SF2. Only handles the RFC
//! 4180 quoting rule this project's own field data can actually trigger
//! (commas, quotes, newlines in a name or a disclosure note); it is
//! deliberately not a general-purpose CSV library.

/// Characters that Excel/Sheets/LibreOffice treat as "this cell is a
/// formula" when they open the first character of a field — the classic
/// CSV/formula-injection vector (e.g. a learner or section name of
/// `=HYPERLINK(...)` or `-2+3+cmd|...` executing when a teacher opens the
/// exported file). Every field in this export ultimately traces back to
/// teacher-entered data (names, section labels), so this is defended at
/// the writer level, not left to each caller to remember.
const FORMULA_TRIGGER_CHARS: [char; 5] = ['=', '+', '-', '@', '\t'];

/// Quotes a field if it contains a comma, a double quote, or a newline —
/// doubling any embedded double quotes, per RFC 4180. Independently,
/// neutralizes CSV/formula injection by prefixing a single quote when a
/// field starts with `=`, `+`, `-`, `@`, or a tab: spreadsheet
/// applications render a leading `'` as "treat this cell as text," which
/// is exactly the intent here — the field's actual content is otherwise
/// left untouched. Fields needing neither treatment are returned
/// unchanged so the common case (plain names, numbers, single-character
/// status codes) produces the smallest, most readable output.
pub fn escape_field(field: &str) -> String {
    let neutralized = if field.starts_with(FORMULA_TRIGGER_CHARS) {
        format!("'{field}")
    } else {
        field.to_string()
    };

    if neutralized.contains(',')
        || neutralized.contains('"')
        || neutralized.contains('\n')
        || neutralized.contains('\r')
    {
        format!("\"{}\"", neutralized.replace('"', "\"\""))
    } else {
        neutralized
    }
}

/// Joins already-owned field values into one escaped, comma-separated CSV
/// row (no trailing newline — callers join rows with `\n`).
pub fn row(fields: &[String]) -> String {
    fields
        .iter()
        .map(|f| escape_field(f))
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_field_is_returned_unquoted() {
        assert_eq!(escape_field("Present"), "Present");
    }

    #[test]
    fn a_field_containing_a_comma_is_quoted() {
        assert_eq!(escape_field("Cruz, Ana"), "\"Cruz, Ana\"");
    }

    #[test]
    fn a_field_containing_a_double_quote_is_quoted_and_the_quote_is_doubled() {
        assert_eq!(escape_field("5' 6\" tall"), "\"5' 6\"\" tall\"");
    }

    #[test]
    fn a_field_containing_a_newline_is_quoted() {
        assert_eq!(escape_field("line one\nline two"), "\"line one\nline two\"");
    }

    #[test]
    fn row_joins_fields_with_commas_and_escapes_each_independently() {
        assert_eq!(
            row(&["Cruz, Ana".to_string(), "Present".to_string(), "3".to_string()]),
            "\"Cruz, Ana\",Present,3"
        );
    }

    #[test]
    fn an_empty_field_round_trips_as_an_empty_string_not_a_quoted_empty_string() {
        assert_eq!(escape_field(""), "");
    }

    #[test]
    fn a_field_starting_with_an_equals_sign_is_neutralized_against_formula_injection() {
        assert_eq!(escape_field("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1");
    }

    #[test]
    fn fields_starting_with_plus_minus_at_or_tab_are_all_neutralized() {
        assert_eq!(escape_field("+1+1"), "'+1+1");
        assert_eq!(escape_field("-2+3"), "'-2+3");
        assert_eq!(escape_field("@SUM(A1)"), "'@SUM(A1)");
        assert_eq!(escape_field("\tPresent"), "'\tPresent");
    }

    #[test]
    fn a_formula_trigger_character_in_the_middle_of_a_field_is_left_alone() {
        // Only a *leading* trigger character is dangerous — a hyphen in
        // "Cruz-Santos" is an ordinary surname, not a formula.
        assert_eq!(escape_field("Cruz-Santos"), "Cruz-Santos");
    }

    #[test]
    fn a_neutralized_field_that_also_needs_quoting_gets_both_treatments() {
        assert_eq!(escape_field("=A1,B1"), "\"'=A1,B1\"");
    }
}
