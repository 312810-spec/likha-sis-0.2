pub mod csv;
pub mod learner_roster;
pub mod report_card;
pub mod sf2;

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OmittedField {
    pub field: String,
    pub reason: String,
}

/// A machine-readable record of which official-form fields an export
/// populated versus deliberately omitted, and why. Every official-form
/// export (SF2, this module's report card, and any future one) returns
/// one of these alongside its file content — the reusable part of the
/// "official-form engine," not the CSV escaping mechanics in `csv.rs`. The
/// trailing comment block in the CSV and the on-screen disclaimer in the
/// UI are both rendered FROM this struct, not maintained as separate
/// hand-written text, so they cannot silently drift from each other or
/// from the file.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FieldDisclosure {
    pub populated_fields: Vec<String>,
    pub omitted_fields: Vec<OmittedField>,
}

/// Windows-reserved filename characters, plus `:` (also significant on
/// Windows/NTFS as a drive or alternate-data-stream separator — e.g. a
/// section name containing `foo:bar` could otherwise be interpreted as
/// "write an ADS named `bar` on file `foo`" rather than a literal
/// filename). Every future official-form export that builds a filename
/// from teacher-entered data (a section/subject/period name, not just
/// SF2's) should route it through this, not repeat its own denylist.
const RESERVED_FILENAME_CHARS: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Replaces every Windows-reserved filename character with `_`, so a
/// value taken from database/teacher-entered data (a section name, a
/// subject name, ...) can be safely embedded in a single filename
/// component. Does not otherwise validate length or reserved names
/// (`CON`, `NUL`, ...) — a failure there surfaces as an ordinary I/O
/// error from `std::fs::write`, not a security issue.
pub fn sanitize_filename_component(value: &str) -> String {
    value.replace(RESERVED_FILENAME_CHARS, "_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_every_windows_reserved_character() {
        assert_eq!(
            sanitize_filename_component(r#"a<b>c:d"e/f\g|h?i*j"#),
            "a_b_c_d_e_f_g_h_i_j"
        );
    }

    #[test]
    fn a_colon_which_can_form_an_ntfs_alternate_data_stream_is_replaced() {
        assert_eq!(sanitize_filename_component("foo:bar"), "foo_bar");
    }

    #[test]
    fn an_already_safe_name_is_returned_unchanged() {
        assert_eq!(sanitize_filename_component("Mabini"), "Mabini");
    }
}
