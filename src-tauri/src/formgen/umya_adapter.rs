//! Rust-native `OfficialFormGenerator` adapter — Wave 3. The only
//! PRODUCTION module in this codebase that imports `umya_spreadsheet`
//! (`formgen::fidelity` also does, but is `#[cfg(test)]`-only — see its
//! own doc comment). See `docs/adr/0048-official-form-engine-sf1.md`.

use std::io::Cursor;
use std::path::Path;

use umya_spreadsheet::{reader, writer};

use crate::error::{AppError, AppResult};
use crate::formgen::sf1::{Sf1GenerationRequest, Sf1GenerationResult};
use crate::formgen::sf9::{Sf9GenerationRequest, Sf9GenerationResult};
use crate::formgen::template::{self, TemplateDescriptor, WorkbookFormat};
use crate::formgen::OfficialFormGenerator;

/// Rejects a template descriptor this adapter cannot handle. Called
/// first in every `generate_*` method, before identity verification —
/// the multi-form adapter policy (docs/adr/0048-official-form-engine-
/// sf1.md, "Multi-form adapter policy") is that the AUTHORITATIVE
/// TEMPLATE'S FORMAT selects the adapter, not the form kind: `.xlsx`
/// does not imply this Rust adapter is always right, and a legacy
/// `.xls` descriptor must never silently be parsed as OOXML bytes.
fn reject_unsupported_format(descriptor: &TemplateDescriptor) -> AppResult<()> {
    match descriptor.workbook_format {
        WorkbookFormat::Xlsx => Ok(()),
        WorkbookFormat::LegacyXls => Err(AppError::FormGeneration(
            "this template requires a legacy .xls-capable generator, which this Rust adapter \
             does not implement"
                .to_string(),
        )),
    }
}

pub struct UmyaSf1Generator {
    pub descriptor: TemplateDescriptor,
}

impl UmyaSf1Generator {
    pub fn sf1_synthetic_v1() -> Self {
        UmyaSf1Generator {
            descriptor: template::SF1_SYNTHETIC_V1,
        }
    }
}

pub struct UmyaSf9Generator {
    pub descriptor: TemplateDescriptor,
}

impl UmyaSf9Generator {
    pub fn sf9_synthetic_v1() -> Self {
        UmyaSf9Generator {
            descriptor: template::SF9_SYNTHETIC_V1,
        }
    }
}

impl OfficialFormGenerator for UmyaSf1Generator {
    fn generate_sf1(
        &self,
        template_bytes: &[u8],
        request: &Sf1GenerationRequest,
        output_path: &Path,
    ) -> AppResult<Sf1GenerationResult> {
        reject_unsupported_format(&self.descriptor)?;
        // Step 1: verify template identity BEFORE any parsing is
        // attempted -- a byte mismatch is rejected without ever trying
        // to interpret the bytes as a spreadsheet at all.
        template::verify_identity(&self.descriptor, template_bytes)?;

        // Step 2: capacity check -- the generator never grows the
        // template (inserting rows would disturb the footer
        // formula/layout this wave's fidelity guarantee depends on).
        if request.learners.len() as u32 > self.descriptor.max_learner_rows {
            return Err(AppError::FormGeneration(format!(
                "this section has {} learners, exceeding this template's capacity of {} rows",
                request.learners.len(),
                self.descriptor.max_learner_rows
            )));
        }

        // Step 3: parse the already-verified bytes (never re-reads from
        // disk here -- no TOCTOU gap between the hash check and the
        // bytes actually parsed).
        let mut book =
            reader::xlsx::read_reader(Cursor::new(template_bytes), true).map_err(|e| {
                log::warn!("SF1 template failed to parse as a spreadsheet: {e}");
                AppError::FormGeneration(
                    "the SF1 template could not be read as a spreadsheet".to_string(),
                )
            })?;

        // Step 4: structural check -- every expected sheet must exist.
        // Defense in depth alongside the hash check: a hash match
        // guarantees the exact trusted bytes, but this still confirms
        // the workbook opens into the shape the generator assumes
        // before it writes anything. Pulled into its own function (see
        // below) specifically so this defense-in-depth layer can be
        // unit-tested directly, without needing a SHA-256 collision to
        // reach it through `generate_sf1` itself.
        let sheet_names: Vec<String> = book
            .sheet_collection()
            .iter()
            .map(|s| s.name().to_string())
            .collect();
        verify_structure(&self.descriptor, &sheet_names)?;

        // Step 5: write header + learner rows. Only these cells are
        // ever touched -- everything else in the workbook (the other
        // sheet, formulas, merges, styles, sizing) is left exactly as
        // umya-spreadsheet's object model already has it.
        let sheet = book
            .sheet_by_name_mut(self.descriptor.data_sheet_name)
            .map_err(|_| {
                AppError::FormGeneration(
                    "the SF1 template is missing its expected data sheet".to_string(),
                )
            })?;

        let header_values = [
            request.school_name.as_str(),
            request.school_year.as_str(),
            request.grade_level.as_str(),
            request.section_name.as_str(),
        ];
        for ((col, row), value) in self.descriptor.header_cells.iter().zip(header_values) {
            sheet
                .cell_mut((*col, *row))
                .set_value_string(value.to_string());
        }

        let &[lrn_col, family_col, given_col, sex_col] = self.descriptor.data_columns else {
            return Err(AppError::FormGeneration(
                "the SF1 template descriptor does not declare exactly 4 data columns".to_string(),
            ));
        };
        for (i, learner) in request.learners.iter().enumerate() {
            let row = self.descriptor.first_data_row + i as u32;
            sheet
                .cell_mut((lrn_col, row))
                .set_value_string(learner.lrn.clone().unwrap_or_default());
            sheet
                .cell_mut((family_col, row))
                .set_value_string(learner.family_name.clone());
            sheet
                .cell_mut((given_col, row))
                .set_value_string(learner.given_name.clone());
            sheet
                .cell_mut((sex_col, row))
                .set_value_string(learner.sex.clone().unwrap_or_default());
        }

        // Step 6: atomic write -- a sibling temp file, written and
        // flushed to disk, then renamed into place. A failure at ANY
        // point in this block -- the write itself, or the final rename
        // -- cleans up the temp file before returning, so a caller can
        // never observe a partially-written file at the path it asked
        // for, and no `.tmp` file is left behind by any of this
        // function's own error returns (a genuine crash/panic mid-write
        // is a separate, disclosed limitation -- see this function's
        // doc comment).
        let tmp_path = sibling_temp_path(output_path)?;
        let result: AppResult<()> = (|| {
            let mut file = std::fs::File::create(&tmp_path)?;
            writer::xlsx::write_writer(&book, &mut file).map_err(|e| {
                log::warn!("failed to write generated SF1 workbook: {e}");
                AppError::FormGeneration("failed to write the generated SF1 workbook".to_string())
            })?;
            file.sync_all()?;
            std::fs::rename(&tmp_path, output_path)?;
            Ok(())
        })();

        if let Err(e) = result {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e);
        }

        Ok(Sf1GenerationResult {
            output_path: output_path.to_string_lossy().to_string(),
            learner_count: request.learners.len(),
            template_form_type: self.descriptor.form_type.to_string(),
            template_version: self.descriptor.version.to_string(),
        })
    }
}

impl crate::formgen::Sf9FormGenerator for UmyaSf9Generator {
    fn generate_sf9(
        &self,
        template_bytes: &[u8],
        request: &Sf9GenerationRequest,
        output_path: &Path,
    ) -> AppResult<Sf9GenerationResult> {
        reject_unsupported_format(&self.descriptor)?;
        template::verify_identity(&self.descriptor, template_bytes)?;

        if request.subject_grades.len() as u32 > self.descriptor.max_learner_rows {
            return Err(AppError::FormGeneration(format!(
                "this learner has {} subject/term rows, exceeding this template's capacity of \
                 {} rows",
                request.subject_grades.len(),
                self.descriptor.max_learner_rows
            )));
        }

        let mut book =
            reader::xlsx::read_reader(Cursor::new(template_bytes), true).map_err(|e| {
                log::warn!("SF9 template failed to parse as a spreadsheet: {e}");
                AppError::FormGeneration(
                    "the SF9 template could not be read as a spreadsheet".to_string(),
                )
            })?;

        let sheet_names: Vec<String> = book
            .sheet_collection()
            .iter()
            .map(|s| s.name().to_string())
            .collect();
        verify_structure(&self.descriptor, &sheet_names)?;

        let sheet = book
            .sheet_by_name_mut(self.descriptor.data_sheet_name)
            .map_err(|_| {
                AppError::FormGeneration(
                    "the SF9 template is missing its expected data sheet".to_string(),
                )
            })?;

        let header_values = [
            request.learner_name.as_str(),
            request.lrn.as_deref().unwrap_or(""),
            request.sex.as_deref().unwrap_or(""),
            request.grade_level.as_str(),
            request.section_name.as_str(),
            request.school_year.as_str(),
        ];
        for ((col, row), value) in self.descriptor.header_cells.iter().zip(header_values) {
            sheet
                .cell_mut((*col, *row))
                .set_value_string(value.to_string());
        }

        let &[subject_col, period_col, grade_col, _unused_col] = self.descriptor.data_columns
        else {
            return Err(AppError::FormGeneration(
                "the SF9 template descriptor does not declare exactly 4 data columns".to_string(),
            ));
        };
        for (i, row_data) in request.subject_grades.iter().enumerate() {
            let row = self.descriptor.first_data_row + i as u32;
            sheet
                .cell_mut((subject_col, row))
                .set_value_string(row_data.subject_name.clone());
            sheet
                .cell_mut((period_col, row))
                .set_value_string(row_data.grading_period_label.clone());
            sheet.cell_mut((grade_col, row)).set_value_string(
                row_data
                    .term_grade
                    .map(|g| g.to_string())
                    .unwrap_or_default(),
            );
        }

        let tmp_path = sibling_temp_path(output_path)?;
        let result: AppResult<()> = (|| {
            let mut file = std::fs::File::create(&tmp_path)?;
            writer::xlsx::write_writer(&book, &mut file).map_err(|e| {
                log::warn!("failed to write generated SF9 workbook: {e}");
                AppError::FormGeneration("failed to write the generated SF9 workbook".to_string())
            })?;
            file.sync_all()?;
            std::fs::rename(&tmp_path, output_path)?;
            Ok(())
        })();

        if let Err(e) = result {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e);
        }

        Ok(Sf9GenerationResult {
            output_path: output_path.to_string_lossy().to_string(),
            subject_count: request.subject_grades.len(),
            template_form_type: self.descriptor.form_type.to_string(),
            template_version: self.descriptor.version.to_string(),
        })
    }
}

/// Confirms `sheet_names` contains every sheet `descriptor` expects.
/// Extracted from `generate_sf1` so this defense-in-depth layer can be
/// exercised directly by a unit test — reaching it through
/// `generate_sf1` itself would require a SHA-256 collision with the
/// trusted template's hash, which is by design not something a test
/// can construct (an earlier version of this module's test suite had a
/// test NAMED for this check that, per its own comment, actually
/// verified the hash check instead — an independent review caught the
/// mismatch between the test's name and what it exercised).
fn verify_structure(descriptor: &TemplateDescriptor, sheet_names: &[String]) -> AppResult<()> {
    if !sheet_names.iter().any(|n| n == descriptor.data_sheet_name) {
        return Err(AppError::FormGeneration(format!(
            "the {} template is missing its expected data sheet",
            descriptor.form_type
        )));
    }
    for expected in descriptor.other_expected_sheet_names {
        if !sheet_names.iter().any(|n| n == expected) {
            return Err(AppError::FormGeneration(format!(
                "the {} template is missing an expected sheet",
                descriptor.form_type
            )));
        }
    }
    Ok(())
}

/// A same-directory `.tmp` sibling of `output_path`, so the final
/// rename is same-filesystem (required for it to be atomic) and a
/// leftover temp file (on a crash between write and rename) is easy to
/// recognize and clean up manually if it ever happens.
///
/// **Disclosed limitation**: cleanup here covers every `Result::Err`
/// this function can return, but not a genuine PANIC partway through
/// the write (e.g. an allocation failure, or a bug inside
/// `umya-spreadsheet` itself) — a panic unwinds past the cleanup code
/// entirely, and the `.tmp` file could be left behind. This is a real,
/// low-severity gap (it requires an actual crash/bug to trigger, is not
/// reachable by a malicious template since that's rejected by identity
/// verification before any write begins, and the residual artifact is
/// only a `.tmp` file inside the user's own already-visible output
/// folder) — recorded as accepted verification debt rather than
/// wrapped in `catch_unwind`, per independent security review.
fn sibling_temp_path(output_path: &Path) -> AppResult<std::path::PathBuf> {
    let file_name = output_path
        .file_name()
        .ok_or_else(|| AppError::FormGeneration("the output path has no file name".to_string()))?;
    let mut tmp_name = file_name.to_os_string();
    tmp_name.push(".tmp");
    Ok(output_path.with_file_name(tmp_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formgen::sf1::{Sf1GenerationRequest, Sf1LearnerRow};
    use crate::formgen::sf9::{Sf9GenerationRequest, Sf9SubjectTermGrade};
    use crate::formgen::Sf9FormGenerator as _;

    fn template_bytes() -> Vec<u8> {
        std::fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/sf1_template_synthetic.xlsx"),
        )
        .unwrap()
    }

    fn sf9_template_bytes() -> Vec<u8> {
        std::fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/sf9_template_synthetic.xlsx"),
        )
        .unwrap()
    }

    fn sf9_sample_request() -> Sf9GenerationRequest {
        Sf9GenerationRequest {
            school_name: "TEST ELEMENTARY SCHOOL (SYNTHETIC)".to_string(),
            school_year: "2026-2027".to_string(),
            grade_level: "7".to_string(),
            section_name: "Sampaguita".to_string(),
            learner_name: "DELA CRUZ, ANA".to_string(),
            lrn: Some("123456789012".to_string()),
            sex: Some("F".to_string()),
            subject_grades: vec![
                Sf9SubjectTermGrade {
                    subject_name: "Mathematics".to_string(),
                    grading_period_label: "Term 1".to_string(),
                    term_grade: Some(88),
                },
                Sf9SubjectTermGrade {
                    subject_name: "Mathematics".to_string(),
                    grading_period_label: "Term 2".to_string(),
                    term_grade: None,
                },
            ],
        }
    }

    #[test]
    fn generates_an_sf9_workbook_with_the_expected_subject_rows() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf9_output.xlsx");
        let generator = UmyaSf9Generator::sf9_synthetic_v1();

        let result = generator
            .generate_sf9(&sf9_template_bytes(), &sf9_sample_request(), &output_path)
            .unwrap();
        assert_eq!(result.subject_count, 2);

        let book = reader::xlsx::read(&output_path).unwrap();
        let sheet = book.sheet_by_name("SF9").unwrap();
        assert_eq!(sheet.value((1, 10)), "Mathematics"); // A10: subject
        assert_eq!(sheet.value((2, 10)), "Term 1");
        assert_eq!(sheet.value((3, 10)), "88");
        // A missing computed grade writes as empty, never a placeholder.
        assert_eq!(sheet.value((3, 11)), "");
        // Header cells.
        assert_eq!(sheet.value((2, 3)), "DELA CRUZ, ANA");
        assert_eq!(sheet.value((2, 4)), "123456789012");
    }

    #[test]
    fn rejects_a_template_declaring_legacy_xls_format() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf9_output.xlsx");
        let mut descriptor = template::SF9_SYNTHETIC_V1;
        descriptor.workbook_format = WorkbookFormat::LegacyXls;
        let generator = UmyaSf9Generator { descriptor };

        let result =
            generator.generate_sf9(&sf9_template_bytes(), &sf9_sample_request(), &output_path);
        assert!(
            result.is_err(),
            "a legacy-.xls descriptor must be rejected before any parsing is attempted, \
             proving .xlsx does not implicitly cover every workbook_format"
        );
        assert!(!output_path.exists());
    }

    #[test]
    fn rejects_more_subject_rows_than_the_sf9_template_has_capacity_for() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf9_output.xlsx");
        let generator = UmyaSf9Generator::sf9_synthetic_v1();

        let mut request = sf9_sample_request();
        request.subject_grades = (0..13)
            .map(|i| Sf9SubjectTermGrade {
                subject_name: format!("Subject {i}"),
                grading_period_label: "Term 1".to_string(),
                term_grade: Some(80),
            })
            .collect();

        let result = generator.generate_sf9(&sf9_template_bytes(), &request, &output_path);
        assert!(result.is_err());
        assert!(!output_path.exists());
    }

    fn sample_request(learner_count: usize) -> Sf1GenerationRequest {
        Sf1GenerationRequest {
            school_name: "TEST ELEMENTARY SCHOOL (SYNTHETIC)".to_string(),
            school_year: "2026-2027".to_string(),
            grade_level: "1".to_string(),
            section_name: "Sampaguita".to_string(),
            learners: (0..learner_count)
                .map(|i| Sf1LearnerRow {
                    lrn: Some(format!("{i:012}")),
                    family_name: format!("SAMPLE FAMILY {i}"),
                    given_name: format!("SAMPLE GIVEN {i}"),
                    sex: Some(if i % 2 == 0 { "M" } else { "F" }.to_string()),
                })
                .collect(),
        }
    }

    #[test]
    fn generates_a_workbook_with_the_expected_learner_rows() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let result = generator
            .generate_sf1(&template_bytes(), &sample_request(3), &output_path)
            .unwrap();

        assert_eq!(result.learner_count, 3);
        assert!(output_path.exists());

        let book = reader::xlsx::read(&output_path).unwrap();
        let sheet = book.sheet_by_name("SF1").unwrap();
        assert_eq!(sheet.value((1, 9)), "000000000000"); // A9: first learner LRN
        assert_eq!(sheet.value((2, 9)), "SAMPLE FAMILY 0");
        assert_eq!(sheet.value((3, 9)), "SAMPLE GIVEN 0");
        assert_eq!(sheet.value((4, 9)), "M");
        // Third learner (row 11) too -- not just the first, so a row-stride
        // bug wouldn't hide behind only ever checking row 9.
        assert_eq!(sheet.value((1, 11)), "000000000002");
        assert_eq!(sheet.value((2, 11)), "SAMPLE FAMILY 2");
        // All four header cells -- an earlier version of this test only
        // checked B3/B6, so a transposition of B4/B5 (school year, grade
        // level) would have passed unnoticed (an independent review
        // finding).
        assert_eq!(sheet.value((2, 3)), "TEST ELEMENTARY SCHOOL (SYNTHETIC)"); // B3
        assert_eq!(sheet.value((2, 4)), "2026-2027"); // B4
        assert_eq!(sheet.value((2, 5)), "1"); // B5
        assert_eq!(sheet.value((2, 6)), "Sampaguita"); // B6
    }

    #[test]
    fn writing_the_full_learner_capacity_leaves_the_footer_formula_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let result = generator
            .generate_sf1(&template_bytes(), &sample_request(30), &output_path)
            .unwrap();
        assert_eq!(result.learner_count, 30);

        let book = reader::xlsx::read(&output_path).unwrap();
        let sheet = book.sheet_by_name("SF1").unwrap();
        // Row 38 is the last reachable data row (first_data_row=9 + 30 - 1);
        // row 40 is the footer formula, one buffer row (39) below capacity.
        assert_eq!(sheet.value((1, 38)), "000000000029"); // A38: 30th learner LRN
        let footer_cell = sheet.cell((2, 40)).unwrap(); // B40
        assert!(footer_cell.is_formula());
        assert_eq!(footer_cell.formula(), "COUNTA(A9:A38)");
    }

    #[test]
    fn rejects_a_template_that_fails_identity_verification() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let mut corrupted = template_bytes();
        let last = corrupted.len() - 1;
        corrupted[last] ^= 0xFF;

        let result = generator.generate_sf1(&corrupted, &sample_request(1), &output_path);
        assert!(result.is_err());
        assert!(
            !output_path.exists(),
            "a rejected template must never produce an output file"
        );
    }

    #[test]
    fn rejects_more_learners_than_the_template_has_capacity_for() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let result = generator.generate_sf1(&template_bytes(), &sample_request(31), &output_path);
        assert!(result.is_err());
        assert!(!output_path.exists());
    }

    #[test]
    fn a_workbook_with_the_wrong_bytes_is_rejected_by_hash_verification_before_parsing() {
        // Any workbook other than the exact trusted bytes is rejected at
        // the identity-verification step (step 1), before parsing is
        // even attempted -- this test documents that this is the
        // earliest rejection point, not the structural check (see
        // `verify_structure`'s own direct tests below for that layer).
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let mut wrong_book = umya_spreadsheet::new_file();
        wrong_book.new_sheet("NotSF1").unwrap();
        let mut buf = Vec::new();
        writer::xlsx::write_writer(&wrong_book, &mut buf).unwrap();

        let result = generator.generate_sf1(&buf, &sample_request(1), &output_path);
        assert!(result.is_err());
        assert!(!output_path.exists());
    }

    #[test]
    fn verify_structure_accepts_a_workbook_with_every_expected_sheet() {
        let descriptor = template::SF1_SYNTHETIC_V1;
        let sheet_names = vec!["SF1".to_string(), "Notes".to_string(), "Extra".to_string()];
        assert!(verify_structure(&descriptor, &sheet_names).is_ok());
    }

    #[test]
    fn verify_structure_rejects_a_workbook_missing_the_data_sheet() {
        let descriptor = template::SF1_SYNTHETIC_V1;
        let sheet_names = vec!["Notes".to_string()];
        assert!(verify_structure(&descriptor, &sheet_names).is_err());
    }

    #[test]
    fn verify_structure_rejects_a_workbook_missing_an_other_expected_sheet() {
        let descriptor = template::SF1_SYNTHETIC_V1;
        let sheet_names = vec!["SF1".to_string()]; // missing "Notes"
        assert!(verify_structure(&descriptor, &sheet_names).is_err());
    }

    #[test]
    fn a_failed_generation_never_leaves_a_temp_file_behind() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let mut corrupted = template_bytes();
        let last = corrupted.len() - 1;
        corrupted[last] ^= 0xFF;
        let _ = generator.generate_sf1(&corrupted, &sample_request(1), &output_path);

        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(
            leftovers.is_empty(),
            "a rejected/failed generation must not leave any file (temp or final) behind"
        );
    }

    /// The rejection above happens at step 1 (identity verification),
    /// before the temp file is even created, so it doesn't exercise the
    /// cleanup-on-error branch inside the write/rename closure itself.
    /// This test forces failure AFTER the temp file has been written --
    /// by pointing `output_path` at a path that already exists as a
    /// DIRECTORY, so `std::fs::rename` fails (can't rename a file onto
    /// an existing directory) -- to prove that branch's cleanup also
    /// runs. This is also what caught a real gap during independent
    /// review: an earlier version of `generate_sf1` cleaned up the temp
    /// file on a write failure but NOT on a rename failure, since the
    /// rename call sat outside the cleanup closure entirely.
    #[test]
    fn a_rename_failure_after_a_successful_write_still_cleans_up_the_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output_as_a_directory");
        std::fs::create_dir(&output_path).unwrap();
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let result = generator.generate_sf1(&template_bytes(), &sample_request(1), &output_path);
        assert!(
            result.is_err(),
            "renaming onto an existing directory must fail, not silently succeed"
        );

        // The sibling temp path is output_path's file name + ".tmp";
        // recompute it the same way the production code does rather
        // than hardcoding a guess, so this test doesn't silently stop
        // checking anything if that scheme ever changes.
        let expected_tmp_name = {
            let mut n = output_path.file_name().unwrap().to_os_string();
            n.push(".tmp");
            n
        };
        let expected_tmp_path = output_path.with_file_name(expected_tmp_name);
        assert!(
            !expected_tmp_path.exists(),
            "a rename failure must still clean up the temp file, not leave it behind"
        );
    }

    #[test]
    fn generating_twice_overwrites_cleanly_and_produces_a_valid_workbook_each_time() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        generator
            .generate_sf1(&template_bytes(), &sample_request(2), &output_path)
            .unwrap();
        generator
            .generate_sf1(&template_bytes(), &sample_request(5), &output_path)
            .unwrap();

        let book = reader::xlsx::read(&output_path).unwrap();
        let sheet = book.sheet_by_name("SF1").unwrap();
        assert_eq!(sheet.value((1, 13)), "000000000004"); // A13: 5th learner LRN
    }

    #[test]
    fn the_source_template_file_is_never_modified_by_generation() {
        let template_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/sf1_template_synthetic.xlsx");
        let before = std::fs::read(&template_path).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();
        generator
            .generate_sf1(&template_bytes(), &sample_request(1), &output_path)
            .unwrap();

        let after = std::fs::read(&template_path).unwrap();
        assert_eq!(
            before, after,
            "generation must never mutate the source template file"
        );
    }

    /// `set_value_string("")` writes an explicit empty-string cell value
    /// (confirmed against umya-spreadsheet's own source), not a truly
    /// absent/blank cell — a distinction an earlier version of this
    /// test's name claimed to rule out but could not actually prove,
    /// since `sheet.value(...)` reads `""` either way (an independent
    /// review finding). This test only asserts what's actually true:
    /// the read-back value is empty, not that the cell is absent.
    #[test]
    fn a_missing_optional_field_reads_back_as_an_empty_string_cell() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let request = Sf1GenerationRequest {
            school_name: "TEST ELEMENTARY SCHOOL".to_string(),
            school_year: "2026-2027".to_string(),
            grade_level: "1".to_string(),
            section_name: "Sampaguita".to_string(),
            learners: vec![Sf1LearnerRow {
                lrn: None,
                family_name: "DELA CRUZ".to_string(),
                given_name: "ANA".to_string(),
                sex: None,
            }],
        };
        generator
            .generate_sf1(&template_bytes(), &request, &output_path)
            .unwrap();

        let book = reader::xlsx::read(&output_path).unwrap();
        let sheet = book.sheet_by_name("SF1").unwrap();
        assert_eq!(sheet.value((1, 9)), "");
        assert_eq!(sheet.value((4, 9)), "");
    }

    #[test]
    fn unicode_and_long_filipino_names_round_trip_correctly() {
        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();

        let request = Sf1GenerationRequest {
            school_name: "PAARALANG SENTRAL NG SAN JOSÉ (SYNTHETIC)".to_string(),
            school_year: "2026-2027".to_string(),
            grade_level: "1".to_string(),
            section_name: "Ñañari".to_string(),
            learners: vec![Sf1LearnerRow {
                lrn: Some("123456789012".to_string()),
                family_name: "DE LA PEÑA-BAUTISTA".to_string(),
                given_name: "MARÍA FE JOSEFINA ANGELICA DEL ROSARIO".to_string(),
                sex: Some("F".to_string()),
            }],
        };
        generator
            .generate_sf1(&template_bytes(), &request, &output_path)
            .unwrap();

        let book = reader::xlsx::read(&output_path).unwrap();
        let sheet = book.sheet_by_name("SF1").unwrap();
        assert_eq!(sheet.value((2, 9)), "DE LA PEÑA-BAUTISTA");
        assert_eq!(
            sheet.value((3, 9)),
            "MARÍA FE JOSEFINA ANGELICA DEL ROSARIO"
        );
        assert_eq!(sheet.value((2, 6)), "Ñañari");
    }

    #[test]
    fn fidelity_is_preserved_across_generation() {
        use crate::formgen::fidelity::{compare, SheetFidelitySnapshot};

        let before_book = reader::xlsx::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/sf1_template_synthetic.xlsx"),
        )
        .unwrap();
        let descriptor = template::SF1_SYNTHETIC_V1;
        // Excludes columns A-D, rows 3-38 from the formula comparison:
        // rows 3-6 are the header cells the generator writes, rows 9-38
        // are the full learner-data capacity. NOTE (disclosed limitation,
        // per independent review): this is a single rectangular bounding
        // box, so it also excludes rows 7-8 (the "LRN/Family Name/..."
        // column-header labels), which the generator never actually
        // writes to — harmless against this fixture (no formulas live
        // there), but a real template with a formula in that wider,
        // over-excluded area would not have a break there detected by
        // this comparison. `SheetFidelitySnapshot` only supports one
        // rectangular exclusion region; a real template with a
        // non-rectangular write pattern would need this widened
        // accordingly.
        let write_region_and_header = Some((
            1u32,
            3u32,
            4u32,
            descriptor.first_data_row + descriptor.max_learner_rows - 1,
        ));

        let before_sf1 = SheetFidelitySnapshot::capture(
            before_book.sheet_by_name("SF1").unwrap(),
            write_region_and_header,
        );
        let before_notes =
            SheetFidelitySnapshot::capture(before_book.sheet_by_name("Notes").unwrap(), None);

        let dir = tempfile::tempdir().unwrap();
        let output_path = dir.path().join("sf1_output.xlsx");
        let generator = UmyaSf1Generator::sf1_synthetic_v1();
        generator
            .generate_sf1(&template_bytes(), &sample_request(10), &output_path)
            .unwrap();

        let after_book = reader::xlsx::read(&output_path).unwrap();
        let after_sf1 = SheetFidelitySnapshot::capture(
            after_book.sheet_by_name("SF1").unwrap(),
            write_region_and_header,
        );
        let after_notes =
            SheetFidelitySnapshot::capture(after_book.sheet_by_name("Notes").unwrap(), None);

        let sf1_report = compare(&before_sf1, &after_sf1);
        assert!(
            sf1_report.is_fidelity_preserved(),
            "SF1 sheet fidelity differences: {:?}",
            sf1_report.differences
        );
        let notes_report = compare(&before_notes, &after_notes);
        assert!(
            notes_report.is_fidelity_preserved(),
            "Notes sheet (untouched by generation) fidelity differences: {:?}",
            notes_report.differences
        );

        // Sheet order/count itself must also survive.
        assert_eq!(before_book.sheet_count(), after_book.sheet_count());
        assert_eq!(
            before_book
                .sheet_collection()
                .iter()
                .map(|s| s.name())
                .collect::<Vec<_>>(),
            after_book
                .sheet_collection()
                .iter()
                .map(|s| s.name())
                .collect::<Vec<_>>()
        );
    }
}
