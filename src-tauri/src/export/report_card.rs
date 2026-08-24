//! Builds a class-record-level, DepEd-grade-computation-inspired report
//! card export as CSV — one row per learner, their computed Initial Grade
//! and Term Grade (see `repository::grading_computation`), or an explicit
//! "not yet available" marker for a learner whose grade isn't computable
//! yet. Reuses the exact `FieldDisclosure` pattern `sf2.rs` established:
//! the CSV's trailing comment block and the on-screen disclaimer are both
//! rendered from the same struct this function returns, so they cannot
//! silently drift from each other or from the file.
//!
//! **Not gated per subject.** `grading_computation::compute_term_grade`
//! applies the single DepEd weight group this app currently implements
//! (core K-10 English/Filipino/Math/Science/AP/GMRC — see
//! `docs/adr/0013-deped-grade-computation.md`) to every class record
//! uniformly; there is no `Subject`-level classification in this schema
//! to gate an export on, and inventing one without further DepEd research
//! into how this app's free-text subject names map to DepEd's own
//! subject-group categories would itself be a guess. This export
//! therefore inherits M13's own established choice: disclose the
//! limitation prominently (see `disclosure()` below and the on-screen
//! warning in `ReportCardScreen`), don't silently refuse.

use crate::export::csv;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::class_record::ClassRecordDetail;
use crate::repository::grading_computation::ComputedTermGrade;
use crate::repository::school::School;

/// One learner's row for the report card — their computed grade if one
/// exists yet, `None` otherwise. Built by the caller (the `export_report_card`
/// command), which composes `section_membership::roster_for_section_over_range`
/// (the class record's section roster) with
/// `grading_computation::compute_term_grade` (one call per learner) —
/// this module only formats already-fetched data, matching `sf2.rs`'s own
/// separation between isolation-enforcing data access and pure formatting.
pub struct ReportCardRow {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    /// See `learner::Learner::lrn`. `None` renders blank rather than a
    /// fabricated placeholder -- see the "LRN" `OmittedField`-adjacent note
    /// in `disclosure()` below and `docs/adr/0017-learner-reference-number-and-sex.md`.
    pub lrn: Option<String>,
    pub grade: Option<ComputedTermGrade>,
}

pub struct ReportCardExport {
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
            "LRN".to_string(),
            "Initial Grade".to_string(),
            "Term Grade".to_string(),
            "Grading Basis (Transmuted / Zero-Based)".to_string(),
            "Note (e.g. raised to the minimum of 60)".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "LRN for a learner who does not yet have one recorded".to_string(),
                reason: "LRN was added in M17 (docs/adr/0017-learner-reference-number-and-sex.md) and is optional per learner -- a learner enrolled before this milestone, or simply not yet given one, renders blank in that column rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "Weighting for EPP/TLE, MAPEH, and any Senior High School subject".to_string(),
                reason: "LIKHA-SIS currently implements only DepEd Order No. 015, s. 2026's core K-10 weighting (English, Filipino, Mathematics, Science, Araling Panlipunan, GMRC/Values Education — 20% Written Works / 50% Performance Tasks / 30% Examinations). If this class record's subject falls outside that group, the Term Grade shown here is not DepEd-compliant for it — see docs/adr/0013-deped-grade-computation.md.".to_string(),
            },
            OmittedField {
                field: "Qualitative Descriptor (e.g. Outstanding, Very Satisfactory)".to_string(),
                reason: "DepEd Order No. 015, s. 2026's descriptor table was not independently re-verified at sufficient resolution against the primary source this milestone — omitted rather than risk a wrong label.".to_string(),
            },
            OmittedField {
                field: "Grade 12 (DepEd Order No. 8, s. 2015 carryover weights)".to_string(),
                reason: "A primary source for DO 8, s. 2015's exact weighting percentages could not be located this session and was not guessed at.".to_string(),
            },
            OmittedField {
                field: "General Average across a learner's full course load".to_string(),
                reason: "This export is scoped to one class record (one section, one subject, one grading period) — a learner's full report card spans multiple class records, which this app does not yet aggregate.".to_string(),
            },
            OmittedField {
                field: "Signature of Teacher / Signature of School Head".to_string(),
                reason: "The certification block is a physical/manual step, intentionally left for the teacher to complete after printing.".to_string(),
            },
        ],
    }
}

/// Assembles the report card export for one class record.
/// `school`/`class_record` must already be verified as belonging to the
/// caller's own school scope, and `rows` already resolved from that class
/// record's section roster — this function does no isolation checking
/// itself, matching `sf2.rs`'s `build_sf2_export`.
pub fn build_report_card_export(
    school: &School,
    class_record: &ClassRecordDetail,
    rows: &[ReportCardRow],
) -> ReportCardExport {
    let disclosure = disclosure();

    let mut lines: Vec<String> = vec![
        csv::row(&["School Name".to_string(), school.name.clone()]),
        csv::row(&["Section".to_string(), class_record.section_name.clone()]),
        csv::row(&["Subject".to_string(), class_record.subject_name.clone()]),
        csv::row(&["Grading Period".to_string(), class_record.grading_period_label.clone()]),
        csv::row(&["School Year".to_string(), class_record.school_year.clone()]),
        String::new(),
        csv::row(&[
            "Learner Name".to_string(),
            "LRN".to_string(),
            "Initial Grade".to_string(),
            "Term Grade".to_string(),
            "Grading Basis".to_string(),
            "Note".to_string(),
        ]),
    ];

    for row in rows {
        let name = format!("{}, {}", row.family_name, row.given_name);
        let lrn = row.lrn.clone().unwrap_or_default();
        let fields = match &row.grade {
            Some(grade) => vec![
                name,
                lrn,
                format!("{:.1}", grade.initial_grade),
                grade.term_grade.to_string(),
                if grade.was_transmuted { "Transmuted".to_string() } else { "Zero-Based".to_string() },
                if grade.was_floored {
                    "Raised to the minimum of 60".to_string()
                } else {
                    String::new()
                },
            ],
            None => vec![
                name,
                lrn,
                "Not yet available".to_string(),
                "Not yet available".to_string(),
                String::new(),
                "Scoring is incomplete for this grading period".to_string(),
            ],
        };
        lines.push(csv::row(&fields));
    }

    lines.push(String::new());
    lines.push("# This report card is inspired by DepEd Order No. 015, s. 2026's grade".to_string());
    lines.push("# computation rules, not a submission-ready official-form reproduction.".to_string());
    lines.push("# Fields NOT included, and important limitations:".to_string());
    for omitted in &disclosure.omitted_fields {
        lines.push(format!("# - {}: {}", omitted.field, omitted.reason));
    }

    ReportCardExport {
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
        let export = build_report_card_export(&a_school(), &a_class_record(), &[]);

        assert!(export.csv.contains("School Name,Rizal Elementary"));
        assert!(export.csv.contains("Section,Mabini"));
        assert!(export.csv.contains("Subject,Science"));
        assert!(export.csv.contains("Grading Period,1st Term"));
        assert!(export.csv.contains("School Year,2026-2027"));
    }

    #[test]
    fn a_computed_grade_renders_ig_tg_and_basis() {
        let rows = vec![ReportCardRow {
            learner_id: "l1".to_string(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: Some("123456789012".to_string()),
            grade: Some(a_grade()),
        }];
        let export = build_report_card_export(&a_school(), &a_class_record(), &rows);

        assert!(export.csv.contains("\"Cruz, Ana\",123456789012,85.8,88,Transmuted,"));
    }

    #[test]
    fn a_floored_grade_carries_a_note() {
        let rows = vec![ReportCardRow {
            learner_id: "l1".to_string(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: None,
            grade: Some(ComputedTermGrade {
                initial_grade: 3.0,
                term_grade: 60,
                was_transmuted: false,
                was_floored: true,
            }),
        }];
        let export = build_report_card_export(&a_school(), &a_class_record(), &rows);

        assert!(export.csv.contains("Raised to the minimum of 60"));
        assert!(export.csv.contains("Zero-Based"));
    }

    #[test]
    fn a_not_yet_computable_grade_is_disclosed_not_dropped() {
        let rows = vec![ReportCardRow {
            learner_id: "l1".to_string(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: None,
            grade: None,
        }];
        let export = build_report_card_export(&a_school(), &a_class_record(), &rows);

        assert!(export.csv.contains("\"Cruz, Ana\",,Not yet available,Not yet available"));
        assert!(export.csv.contains("Scoring is incomplete"));
    }

    #[test]
    fn the_disclosure_lists_every_field_actually_referenced_in_the_comment_block() {
        let export = build_report_card_export(&a_school(), &a_class_record(), &[]);

        assert!(!export.disclosure.omitted_fields.is_empty());
        for omitted in &export.disclosure.omitted_fields {
            assert!(export.csv.contains(&omitted.field));
        }
    }

    #[test]
    fn no_qualitative_descriptor_or_do_8_wording_appears_outside_the_disclosure_block() {
        let rows = vec![ReportCardRow {
            learner_id: "l1".to_string(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: Some("123456789012".to_string()),
            grade: Some(a_grade()),
        }];
        let export = build_report_card_export(&a_school(), &a_class_record(), &rows);

        for forbidden in ["Outstanding", "Very Satisfactory", "Fairly Satisfactory"] {
            assert!(
                !export.csv.lines().any(|line| !line.starts_with('#') && line.contains(forbidden)),
                "'{forbidden}' must not appear outside the disclosure comment block — it was never verified"
            );
        }
    }
}
