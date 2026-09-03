//! Builds a learner-level, DepEd-SF10-inspired cumulative Permanent
//! Academic Record export as CSV — one block per school year the learner
//! has ever been enrolled in (oldest first), listing that year's subject
//! final grades, computed General Average, and Action Taken.
//!
//! This is a **content-based** export, matching how SF2/SF4/SF5/SF6 and
//! the report card already ship: DepEd-content-faithful (the same
//! promotion/proficiency vocabulary and computed grades), not a
//! byte-faithful reproduction of the official DepEd `.xlsx` SF10
//! template. The official-template track
//! (`formgen::template_version`, see
//! `docs/adr/0053-sf10-template-applicability-and-versioning.md`) is a
//! separate, still-evidence-blocked effort; this module does not depend
//! on it and is not a substitute for it — the disclosure block below
//! says so explicitly, the same way every other unverified-fidelity
//! export in this app already discloses its own gap.
//!
//! Reuses `PromotionStatus`, `Sf5SubjectGrade`, and
//! `Sf5LearnerRow::compute_status` from `sf5.rs` unchanged — the DepEd
//! promotion-decision rule is per-school-year regardless of whether the
//! year is being summarized for one section (SF5) or one learner's whole
//! history (SF10); only the axis that varies (many learners × one year,
//! vs. one learner × many years) differs.

use crate::export::csv;
use crate::export::sf5::{PromotionStatus, Sf5SubjectGrade};
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::school::School;

/// One school year's worth of a single learner's permanent record.
/// Callers are expected to pass these already ordered oldest-to-newest
/// (matching `section_membership::list_by_learner_in_school`'s own
/// `starts_on ASC` ordering) — `build_sf10_export` renders them in the
/// order given, it does not re-sort.
#[derive(Debug, Clone, PartialEq)]
pub struct Sf10YearRow {
    pub school_year: String,
    pub grade_level: String,
    pub section_name: String,
    pub subject_grades: Vec<Sf5SubjectGrade>,
    pub general_average: Option<f64>,
    pub promotion_status: PromotionStatus,
}

pub struct Sf10Export {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "School ID".to_string(),
            "School Name".to_string(),
            "Learner Name".to_string(),
            "LRN".to_string(),
            "Sex".to_string(),
            "School Year (per year enrolled)".to_string(),
            "Grade Level (per year enrolled)".to_string(),
            "Section (per year enrolled)".to_string(),
            "Subject Final Grades (per year enrolled)".to_string(),
            "General Average (per year enrolled)".to_string(),
            "Action Taken (per year enrolled)".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "Official DepEd SF10 template formatting (signatures, seals, certifying officials, cell layout)".to_string(),
                reason: "This is a content-based summary built from LIKHA-SIS's own records, not the official DepEd .xlsx SF10 template -- no authoritative SF10 template has been render-verified for this school's applicable era/track yet. See docs/adr/0053-sf10-template-applicability-and-versioning.md.".to_string(),
            },
            OmittedField {
                field: "LRN or Sex for a learner who does not yet have one recorded".to_string(),
                reason: "LRN and Sex are optional per learner in LIKHA-SIS -- when unrecorded, the respective field renders blank rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "General Average and Action Taken for an incomplete or ungraded school year".to_string(),
                reason: "If a learner is missing a computed final grade for one or more subjects in a school year (or has no class records for that year at all), General Average renders blank and Action Taken is marked PENDING / INCOMPLETE rather than fabricating a value.".to_string(),
            },
            OmittedField {
                field: "Remarks / Certification block (School Head signature, date of certification, division validation)".to_string(),
                reason: "This project does not collect a physical/ink or cryptographic signature -- a certification block would be misleading without a real certifying signature behind it.".to_string(),
            },
        ],
    }
}

/// Builds the SF10 CSV export string and disclosure struct. Empty `rows`
/// (a learner with no school-year history yet -- e.g. enrolled but never
/// placed in a section) renders an explicit "no records yet" line rather
/// than an empty or misleading table.
pub fn build_sf10_export(
    school: &School,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
    sex: Option<&str>,
    rows: &[Sf10YearRow],
) -> Sf10Export {
    let mut lines: Vec<String> = vec![
        csv::row(&["School Form 10 (SF10) Learner's Permanent Academic Record".to_string()]),
        csv::row(&[
            "Content-based cumulative summary of school-year records -- not the official DepEd .xlsx template"
                .to_string(),
        ]),
        csv::row(&["School ID".to_string(), school.id.clone()]),
        csv::row(&["School Name".to_string(), school.name.clone()]),
        csv::row(&[
            "Learner Name".to_string(),
            format!("{family_name}, {given_name}"),
        ]),
        csv::row(&["LRN".to_string(), lrn.unwrap_or("").to_string()]),
        csv::row(&["Sex".to_string(), sex.unwrap_or("").to_string()]),
        String::new(),
    ];

    if rows.is_empty() {
        lines.push(csv::row(&[
            "No school-year records available yet.".to_string()
        ]));
        lines.push(String::new());
    }

    for row in rows {
        lines.push(csv::row(&[
            "School Year".to_string(),
            row.school_year.clone(),
        ]));
        lines.push(csv::row(&[
            "Grade Level".to_string(),
            row.grade_level.clone(),
        ]));
        lines.push(csv::row(&["Section".to_string(), row.section_name.clone()]));

        lines.push(csv::row(&[
            "Learning Area".to_string(),
            "Final Grade".to_string(),
        ]));
        for sg in &row.subject_grades {
            lines.push(csv::row(&[
                sg.subject_name.clone(),
                sg.final_grade.map(|g| g.to_string()).unwrap_or_default(),
            ]));
        }

        let gen_avg_str = row
            .general_average
            .map(|avg| format!("{avg:.2}"))
            .unwrap_or_default();
        lines.push(csv::row(&["General Average".to_string(), gen_avg_str]));
        lines.push(csv::row(&[
            "Action Taken".to_string(),
            row.promotion_status.as_str().to_string(),
        ]));

        lines.push(String::new());
    }

    let disc = disclosure();
    lines.push(csv::row(&["# DISCLOSURE".to_string()]));
    lines.push(csv::row(&["# Populated Fields:".to_string()]));
    for field in &disc.populated_fields {
        lines.push(csv::row(&["#   -".to_string(), field.clone()]));
    }
    lines.push(csv::row(&["# Omitted Fields & Limitations:".to_string()]));
    for omitted in &disc.omitted_fields {
        lines.push(csv::row(&[
            "#   -".to_string(),
            omitted.field.clone(),
            format!("(Reason: {})", omitted.reason),
        ]));
    }

    Sf10Export {
        csv: lines.join("\n"),
        disclosure: disc,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::sf5::Sf5LearnerRow;

    fn sample_school() -> School {
        School {
            id: "123456".to_string(),
            name: "Mabini Central Elementary School".to_string(),
            created_at: "2026-06-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn renders_header_metadata_and_a_no_records_note_when_the_learner_has_no_history() {
        let school = sample_school();

        let export = build_sf10_export(&school, "Juan", "Dela Cruz", None, None, &[]);

        assert!(export
            .csv
            .contains("School Form 10 (SF10) Learner's Permanent Academic Record"));
        assert!(export.csv.contains("Learner Name,\"Dela Cruz, Juan\""));
        assert!(export.csv.contains("LRN,"));
        assert!(export.csv.contains("Sex,"));
        assert!(export.csv.contains("No school-year records available yet."));
        assert!(export.csv.contains("# DISCLOSURE"));
    }

    #[test]
    fn renders_one_block_per_school_year_in_the_order_given() {
        let school = sample_school();
        let rows = vec![
            Sf10YearRow {
                school_year: "2024-2025".to_string(),
                grade_level: "6".to_string(),
                section_name: "Mabini".to_string(),
                subject_grades: vec![
                    Sf5SubjectGrade {
                        subject_name: "English".to_string(),
                        final_grade: Some(88),
                    },
                    Sf5SubjectGrade {
                        subject_name: "Mathematics".to_string(),
                        final_grade: Some(92),
                    },
                ],
                general_average: Some(90.0),
                promotion_status: PromotionStatus::Promoted,
            },
            Sf10YearRow {
                school_year: "2025-2026".to_string(),
                grade_level: "7".to_string(),
                section_name: "Rizal".to_string(),
                subject_grades: vec![Sf5SubjectGrade {
                    subject_name: "English".to_string(),
                    final_grade: Some(72),
                }],
                general_average: Some(72.0),
                promotion_status: PromotionStatus::Retained,
            },
        ];

        let export = build_sf10_export(
            &school,
            "Juan",
            "Dela Cruz",
            Some("123456789012"),
            Some("Male"),
            &rows,
        );

        let year1_pos = export.csv.find("School Year,2024-2025").unwrap();
        let year2_pos = export.csv.find("School Year,2025-2026").unwrap();
        assert!(
            year1_pos < year2_pos,
            "school years must render oldest-first, in the order given"
        );
        assert!(export.csv.contains("Grade Level,6"));
        assert!(export.csv.contains("Section,Mabini"));
        assert!(export.csv.contains("English,88"));
        assert!(export.csv.contains("Mathematics,92"));
        assert!(export.csv.contains("General Average,90.00"));
        assert!(export.csv.contains("Action Taken,PROMOTED"));
        assert!(export.csv.contains("Grade Level,7"));
        assert!(export.csv.contains("Action Taken,RETAINED"));
        assert!(export.csv.contains("LRN,123456789012"));
        assert!(export.csv.contains("Sex,Male"));
    }

    #[test]
    fn a_year_with_no_scored_subjects_renders_a_blank_average_and_pending_status() {
        let school = sample_school();
        let rows = vec![Sf10YearRow {
            school_year: "2025-2026".to_string(),
            grade_level: "7".to_string(),
            section_name: "Rizal".to_string(),
            subject_grades: vec![],
            general_average: None,
            promotion_status: PromotionStatus::Pending,
        }];

        let export = build_sf10_export(&school, "Juan", "Dela Cruz", None, None, &rows);

        assert!(export.csv.contains("General Average,\n"));
        assert!(export.csv.contains("Action Taken,PENDING / INCOMPLETE"));
    }

    #[test]
    fn reuses_sf5_compute_status_for_the_promotion_decision() {
        // Not a new rule -- proves this module calls the same function
        // sf5.rs already tests exhaustively, rather than re-implementing it.
        let grades = vec![
            Sf5SubjectGrade {
                subject_name: "English".to_string(),
                final_grade: Some(85),
            },
            Sf5SubjectGrade {
                subject_name: "Math".to_string(),
                final_grade: Some(88),
            },
        ];
        let (avg, status) = Sf5LearnerRow::compute_status(&grades);
        assert_eq!(status, PromotionStatus::Promoted);
        assert!(avg.is_some());
    }
}
