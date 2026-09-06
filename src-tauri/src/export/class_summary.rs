//! Builds a one-page, "at a glance" class summary export as CSV — the
//! section roster for one class record, each learner's current computed
//! average (`repository::grading_computation::compute_term_grade`'s
//! `term_grade`), or an explicit "No grade yet" marker for a learner whose
//! grade isn't computable yet. This is Creation Studio sub-scope 2's
//! **printable class summary** output (see
//! `docs/CURRENT-HANDOFF.md`) — a teacher convenience report, not an
//! official DepEd School Form, so it is not subject to DepEd's
//! official-form formatting/branding rules the way SF9/SF10 are.
//!
//! Deliberately simpler than `report_card.rs`: no Initial Grade, no
//! transmutation/flooring notes, no grading-basis column — the product
//! owner's own wording for this output was "simple," and every richer
//! field already exists in the class-record-level report card export
//! (`export_class_record_report_card`) for a teacher who wants that
//! detail. Reuses the exact `FieldDisclosure` pattern every other export
//! in this module established, and calls
//! `grading_computation::compute_term_grade` rather than reimplementing
//! any grade math — same separation `report_card.rs` documents between
//! isolation-enforcing data access (done by the caller, the
//! `export_class_record_summary` command) and pure formatting (done here).

use crate::export::csv;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::class_record::ClassRecordDetail;
use crate::repository::grading_computation::ComputedTermGrade;
use crate::repository::school::School;

/// One learner's row for the class summary — their current computed
/// average if one exists yet, `None` otherwise.
pub struct ClassSummaryRow {
    pub given_name: String,
    pub family_name: String,
    pub grade: Option<ComputedTermGrade>,
}

pub struct ClassSummaryExport {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "School Name".to_string(),
            "Section".to_string(),
            "Subject".to_string(),
            "Grading Period".to_string(),
            "School Year".to_string(),
            "Learner Name".to_string(),
            "Current Average".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "Initial Grade, grading basis, and flooring/transmutation notes".to_string(),
                reason: "This is the simple, at-a-glance class summary, not the full report card -- those fields already exist in the class record's own report card export (Export report card (CSV)) for a teacher who wants that detail.".to_string(),
            },
            OmittedField {
                field: "LRN and other learner-profile fields".to_string(),
                reason: "This is a section-at-a-glance summary for the teacher's own quick reference, not a records document -- the LRN-carrying exports (report card, SF5, SF10) already cover that need.".to_string(),
            },
            OmittedField {
                field: "Weighting for EPP/TLE, MAPEH, and any Senior High School subject".to_string(),
                reason: "LIKHA-SIS currently implements only DepEd Order No. 015, s. 2026's core K-10 weighting -- see docs/adr/0013-deped-grade-computation.md. If this class record's subject falls outside that group, the average shown here is not DepEd-compliant for it.".to_string(),
            },
            OmittedField {
                field: "Qualitative Descriptor (e.g. Outstanding, Very Satisfactory)".to_string(),
                reason: "DepEd Order No. 015, s. 2026's descriptor table was not independently re-verified at sufficient resolution against the primary source -- omitted rather than risk a wrong label.".to_string(),
            },
        ],
    }
}

/// Assembles the class summary export for one class record. `school`/
/// `class_record` must already be verified as belonging to the caller's
/// own school scope, and `rows` already resolved from that class record's
/// section roster -- this function does no isolation checking itself,
/// matching `report_card.rs`'s `build_report_card_export`.
pub fn build_class_summary_export(
    school: &School,
    class_record: &ClassRecordDetail,
    rows: &[ClassSummaryRow],
) -> ClassSummaryExport {
    let disclosure = disclosure();

    let mut lines: Vec<String> = vec![
        csv::row(&["School Name".to_string(), school.name.clone()]),
        csv::row(&["Section".to_string(), class_record.section_name.clone()]),
        csv::row(&["Subject".to_string(), class_record.subject_name.clone()]),
        csv::row(&[
            "Grading Period".to_string(),
            class_record.grading_period_label.clone(),
        ]),
        csv::row(&["School Year".to_string(), class_record.school_year.clone()]),
        String::new(),
        csv::row(&["Learner Name".to_string(), "Current Average".to_string()]),
    ];

    for row in rows {
        let name = format!("{}, {}", row.family_name, row.given_name);
        let average = match &row.grade {
            Some(grade) => grade.term_grade.to_string(),
            None => "No grade yet".to_string(),
        };
        lines.push(csv::row(&[name, average]));
    }

    lines.push(String::new());
    lines.push(
        "# This is a simple class summary for your own quick reference, not an official"
            .to_string(),
    );
    lines.push("# DepEd form. Fields NOT included, and important limitations:".to_string());
    for omitted in &disclosure.omitted_fields {
        lines.push(format!("# - {}: {}", omitted.field, omitted.reason));
    }

    ClassSummaryExport {
        csv: lines.join("\n"),
        disclosure,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a_school() -> School {
        School {
            id: "s1".to_string(),
            name: "Rizal Elementary".to_string(),
            created_at: "now".to_string(),
        }
    }

    fn a_class_record() -> ClassRecordDetail {
        ClassRecordDetail {
            id: "cr1".to_string(),
            school_id: "s1".to_string(),
            section_id: "sec1".to_string(),
            section_name: "Mabini".to_string(),
            subject_id: "sub1".to_string(),
            subject_name: "Science".to_string(),
            grading_period_id: "gp1".to_string(),
            grading_period_label: "1st Term".to_string(),
            school_year: "2026-2027".to_string(),
            weight_policy_id: "wp1".to_string(),
            weight_policy_name: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)".to_string(),
            created_at: "now".to_string(),
            item_count: 0,
            recorded_count: 0,
            total_eligible: 0,
        }
    }

    fn a_grade() -> ComputedTermGrade {
        ComputedTermGrade {
            initial_grade: 85.8,
            term_grade: 88,
            was_transmuted: true,
            was_floored: false,
        }
    }

    #[test]
    fn header_rows_carry_school_section_subject_period_and_year() {
        let export = build_class_summary_export(&a_school(), &a_class_record(), &[]);

        assert!(export.csv.contains("School Name,Rizal Elementary"));
        assert!(export.csv.contains("Section,Mabini"));
        assert!(export.csv.contains("Subject,Science"));
        assert!(export.csv.contains("Grading Period,1st Term"));
        assert!(export.csv.contains("School Year,2026-2027"));
    }

    #[test]
    fn a_computed_grade_renders_the_current_average() {
        let rows = vec![ClassSummaryRow {
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            grade: Some(a_grade()),
        }];
        let export = build_class_summary_export(&a_school(), &a_class_record(), &rows);

        assert!(export.csv.contains("\"Cruz, Ana\",88"));
    }

    #[test]
    fn a_learner_with_no_scores_yet_shows_no_grade_yet_not_a_crash() {
        let rows = vec![ClassSummaryRow {
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            grade: None,
        }];
        let export = build_class_summary_export(&a_school(), &a_class_record(), &rows);

        assert!(export.csv.contains("\"Cruz, Ana\",No grade yet"));
    }

    #[test]
    fn multiple_learners_each_get_their_own_row() {
        let rows = vec![
            ClassSummaryRow {
                given_name: "Ana".to_string(),
                family_name: "Cruz".to_string(),
                grade: Some(a_grade()),
            },
            ClassSummaryRow {
                given_name: "Mabini".to_string(),
                family_name: "Torres".to_string(),
                grade: None,
            },
        ];
        let export = build_class_summary_export(&a_school(), &a_class_record(), &rows);

        assert!(export.csv.contains("\"Cruz, Ana\",88"));
        assert!(export.csv.contains("\"Torres, Mabini\",No grade yet"));
    }

    #[test]
    fn the_disclosure_lists_every_field_actually_referenced_in_the_comment_block() {
        let export = build_class_summary_export(&a_school(), &a_class_record(), &[]);

        assert!(!export.disclosure.omitted_fields.is_empty());
        for omitted in &export.disclosure.omitted_fields {
            assert!(export.csv.contains(&omitted.field));
        }
    }

    #[test]
    fn no_initial_grade_or_grading_basis_wording_appears_outside_the_disclosure_block() {
        let rows = vec![ClassSummaryRow {
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            grade: Some(a_grade()),
        }];
        let export = build_class_summary_export(&a_school(), &a_class_record(), &rows);

        for forbidden in ["Transmuted", "Zero-Based", "Initial Grade"] {
            assert!(
                !export
                    .csv
                    .lines()
                    .any(|line| !line.starts_with('#') && line.contains(forbidden)),
                "'{forbidden}' must not appear outside the disclosure comment block"
            );
        }
    }
}
