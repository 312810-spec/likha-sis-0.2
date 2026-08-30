//! A tiny, dependency-free CSV reader — the companion to
//! `export::csv`'s writer, for the same reason: this project's own field
//! data never needs a general-purpose CSV library, and pulling one in
//! for a handful of RFC 4180 rules would be disproportionate. Handles
//! quoted fields (commas/quotes/newlines inside a cell) and doubled
//! quotes; deliberately does not attempt exotic dialects (custom
//! delimiters, BOM variants beyond UTF-8) since every caller controls
//! its own input shape (a teacher-prepared bulk-import file).

/// Parses `text` as CSV into rows of fields. The first line is not
/// treated specially here — callers that expect a header row handle that
/// themselves (see `import::learner::parse_rows`), keeping this function
/// a pure, reusable CSV-shape parser.
pub fn parse(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut field = String::new();
    let mut row = Vec::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();
    let mut row_has_content = false;

    while let Some(c) = chars.next() {
        if in_quotes {
            match c {
                '"' if chars.peek() == Some(&'"') => {
                    field.push('"');
                    chars.next();
                }
                '"' => in_quotes = false,
                other => field.push(other),
            }
            continue;
        }

        match c {
            '"' => {
                in_quotes = true;
                row_has_content = true;
            }
            ',' => {
                row.push(std::mem::take(&mut field));
                row_has_content = true;
            }
            '\r' => {
                // Bare CR or the CR of a CRLF -- peek to swallow a
                // following LF so CRLF doesn't produce a blank row.
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
                row_has_content = false;
            }
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
                row_has_content = false;
            }
            other => {
                field.push(other);
                row_has_content = true;
            }
        }
    }

    // A final row with no trailing newline still needs to be flushed;
    // an empty trailing field/row (the file simply ended after the last
    // newline) must not become a phantom all-empty row.
    if row_has_content || !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }

    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_row_splits_on_commas() {
        assert_eq!(
            parse("Ana,Cruz,123456789012,F"),
            vec![vec!["Ana", "Cruz", "123456789012", "F"]]
        );
    }

    #[test]
    fn multiple_rows_split_on_newlines() {
        assert_eq!(
            parse("Ana,Cruz\nJose,Rizal"),
            vec![vec!["Ana", "Cruz"], vec!["Jose", "Rizal"]]
        );
    }

    #[test]
    fn crlf_line_endings_do_not_produce_blank_rows() {
        assert_eq!(
            parse("Ana,Cruz\r\nJose,Rizal\r\n"),
            vec![vec!["Ana", "Cruz"], vec!["Jose", "Rizal"]]
        );
    }

    #[test]
    fn a_quoted_field_containing_a_comma_is_kept_as_one_field() {
        assert_eq!(parse("\"Cruz, Jr.\",Ana"), vec![vec!["Cruz, Jr.", "Ana"]]);
    }

    #[test]
    fn a_doubled_quote_inside_a_quoted_field_becomes_one_literal_quote() {
        assert_eq!(parse("\"5' 6\"\" tall\""), vec![vec!["5' 6\" tall"]]);
    }

    #[test]
    fn a_quoted_field_containing_a_newline_stays_one_field_one_row() {
        assert_eq!(
            parse("\"line one\nline two\",second"),
            vec![vec!["line one\nline two", "second"]]
        );
    }

    #[test]
    fn empty_input_produces_no_rows() {
        assert_eq!(parse(""), Vec::<Vec<String>>::new());
    }

    #[test]
    fn a_trailing_newline_does_not_produce_a_phantom_empty_row() {
        assert_eq!(parse("Ana,Cruz\n"), vec![vec!["Ana", "Cruz"]]);
    }

    #[test]
    fn empty_fields_round_trip_as_empty_strings() {
        assert_eq!(parse("Ana,,123"), vec![vec!["Ana", "", "123"]]);
    }
}
