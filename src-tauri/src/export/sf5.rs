//! Builds a section-level School Form 5 (SF5) End of School Year (EOSY)
//! Report on Promotion and Level of Proficiency export as CSV — per
//! DepEd Order No. 8, s. 2015 / DepEd Order No. 58, s. 2017.
//!
//! One row per enrolled learner in the section, listing their final grades across
//! all learning areas, computed General Average, and Action Taken (PROMOTED,
//! CONDITIONAL, RETAINED, or PENDING if grades are incomplete). Includes the
//! summary distribution table by Level of Proficiency disaggregated by sex.
//!
//! Reuses the exact `FieldDisclosure` pattern established in `sf2.rs` and `report_card.rs`.

use serde::Serialize;

use crate::export::csv;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::school::School;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PromotionStatus {
    Promoted,
    Conditional,
    Retained,
    Pending,
}

impl PromotionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PromotionStatus::Promoted => "PROMOTED",
            PromotionStatus::Conditional => "CONDITIONAL",
            PromotionStatus::Retained => "RETAINED",
            PromotionStatus::Pending => "PENDING / INCOMPLETE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LevelOfProficiency {
    DidNotMeetExpectations, // Below 75
    FairlySatisfactory,     // 75-79
    Satisfactory,           // 80-84
    VerySatisfactory,       // 85-89
    Outstanding,            // 90-100
}

impl LevelOfProficiency {
    pub fn from_average(avg: f64) -> Option<Self> {
        let rounded = avg.round() as u32;
        if (90..=100).contains(&rounded) {
            Some(LevelOfProficiency::Outstanding)
        } else if (85..90).contains(&rounded) {
            Some(LevelOfProficiency::VerySatisfactory)
        } else if (80..85).contains(&rounded) {
            Some(LevelOfProficiency::Satisfactory)
        } else if (75..80).contains(&rounded) {
            Some(LevelOfProficiency::FairlySatisfactory)
        } else if rounded < 75 {
            Some(LevelOfProficiency::DidNotMeetExpectations)
        } else {
            None
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            LevelOfProficiency::DidNotMeetExpectations => "Did Not Meet Expectations (Below 75)",
            LevelOfProficiency::FairlySatisfactory => "Fairly Satisfactory (75-79)",
            LevelOfProficiency::Satisfactory => "Satisfactory (80-84)",
            LevelOfProficiency::VerySatisfactory => "Very Satisfactory (85-89)",
            LevelOfProficiency::Outstanding => "Outstanding (90-100)",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sf5SubjectGrade {
    pub subject_name: String,
    pub final_grade: Option<u32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Sf5LearnerRow {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub sex: Option<String>,
    pub lrn: Option<String>,
    pub subject_grades: Vec<Sf5SubjectGrade>,
    pub general_average: Option<f64>,
    pub promotion_status: PromotionStatus,
}

impl Sf5LearnerRow {
    /// Computes the general average and promotion status given a learner's subject grades.
    /// - PROMOTED: All subject grades >= 75 and General Average >= 75.
    /// - CONDITIONAL: 1 or 2 subject grades < 75.
    /// - RETAINED: 3 or more subject grades < 75.
    /// - PENDING: Any subject has a missing/incomplete grade.
    pub fn compute_status(subject_grades: &[Sf5SubjectGrade]) -> (Option<f64>, PromotionStatus) {
        if subject_grades.is_empty() {
            return (None, PromotionStatus::Pending);
        }

        let mut sum = 0.0;
        let mut failed_count = 0;
        let mut has_missing = false;

        for sg in subject_grades {
            match sg.final_grade {
                Some(grade) => {
                    sum += grade as f64;
                    if grade < 75 {
                        failed_count += 1;
                    }
                }
                None => {
                    has_missing = true;
                }
            }
        }

        if has_missing {
            return (None, PromotionStatus::Pending);
        }

        let average = sum / (subject_grades.len() as f64);
        let status = if failed_count == 0 && average.round() as u32 >= 75 {
            PromotionStatus::Promoted
        } else if (1..=2).contains(&failed_count) {
            PromotionStatus::Conditional
        } else {
            PromotionStatus::Retained
        };

        (Some(average), status)
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ProficiencySummary {
    pub did_not_meet_m: u32,
    pub did_not_meet_f: u32,
    pub did_not_meet_total: u32,

    pub fairly_satisfactory_m: u32,
    pub fairly_satisfactory_f: u32,
    pub fairly_satisfactory_total: u32,

    pub satisfactory_m: u32,
    pub satisfactory_f: u32,
    pub satisfactory_total: u32,

    pub very_satisfactory_m: u32,
    pub very_satisfactory_f: u32,
    pub very_satisfactory_total: u32,

    pub outstanding_m: u32,
    pub outstanding_f: u32,
    pub outstanding_total: u32,

    pub promoted_m: u32,
    pub promoted_f: u32,
    pub promoted_total: u32,

    pub conditional_m: u32,
    pub conditional_f: u32,
    pub conditional_total: u32,

    pub retained_m: u32,
    pub retained_f: u32,
    pub retained_total: u32,

    pub pending_m: u32,
    pub pending_f: u32,
    pub pending_total: u32,
}

impl ProficiencySummary {
    pub fn compute(learners: &[Sf5LearnerRow]) -> Self {
        let mut summary = ProficiencySummary::default();

        for l in learners {
            let is_female = l
                .sex
                .as_deref()
                .map(|s| s.eq_ignore_ascii_case("female") || s.eq_ignore_ascii_case("f"))
                .unwrap_or(false);

            match l.promotion_status {
                PromotionStatus::Promoted => {
                    if is_female {
                        summary.promoted_f += 1;
                    } else {
                        summary.promoted_m += 1;
                    }
                    summary.promoted_total += 1;
                }
                PromotionStatus::Conditional => {
                    if is_female {
                        summary.conditional_f += 1;
                    } else {
                        summary.conditional_m += 1;
                    }
                    summary.conditional_total += 1;
                }
                PromotionStatus::Retained => {
                    if is_female {
                        summary.retained_f += 1;
                    } else {
                        summary.retained_m += 1;
                    }
                    summary.retained_total += 1;
                }
                PromotionStatus::Pending => {
                    if is_female {
                        summary.pending_f += 1;
                    } else {
                        summary.pending_m += 1;
                    }
                    summary.pending_total += 1;
                }
            }

            if let Some(avg) = l.general_average {
                if let Some(band) = LevelOfProficiency::from_average(avg) {
                    match band {
                        LevelOfProficiency::DidNotMeetExpectations => {
                            if is_female {
                                summary.did_not_meet_f += 1;
                            } else {
                                summary.did_not_meet_m += 1;
                            }
                            summary.did_not_meet_total += 1;
                        }
                        LevelOfProficiency::FairlySatisfactory => {
                            if is_female {
                                summary.fairly_satisfactory_f += 1;
                            } else {
                                summary.fairly_satisfactory_m += 1;
                            }
                            summary.fairly_satisfactory_total += 1;
                        }
                        LevelOfProficiency::Satisfactory => {
                            if is_female {
                                summary.satisfactory_f += 1;
                            } else {
                                summary.satisfactory_m += 1;
                            }
                            summary.satisfactory_total += 1;
                        }
                        LevelOfProficiency::VerySatisfactory => {
                            if is_female {
                                summary.very_satisfactory_f += 1;
                            } else {
                                summary.very_satisfactory_m += 1;
                            }
                            summary.very_satisfactory_total += 1;
                        }
                        LevelOfProficiency::Outstanding => {
                            if is_female {
                                summary.outstanding_f += 1;
                            } else {
                                summary.outstanding_m += 1;
                            }
                            summary.outstanding_total += 1;
                        }
                    }
                }
            }
        }

        summary
    }
}

pub struct Sf5Export {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "School ID".to_string(),
            "School Name".to_string(),
            "Grade Level".to_string(),
            "Section Name".to_string(),
            "School Year".to_string(),
            "Class Adviser (if assigned)".to_string(),
            "LRN".to_string(),
            "Learner Name".to_string(),
            "Sex".to_string(),
            "Subject Final Grades".to_string(),
            "General Average".to_string(),
            "Action Taken (Promoted / Conditional / Retained / Pending)".to_string(),
            "Summary of Level of Proficiency (Bands by Sex & Total)".to_string(),
            "Summary of Promotion Decisions (By Sex & Total)".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "Class Adviser for a section without an active advisory assignment".to_string(),
                reason: "LIKHA-SIS allows sections without an assigned class adviser -- when none is active, the Class Adviser header field renders blank rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "LRN or Sex for a learner who does not yet have one recorded".to_string(),
                reason: "LRN and Sex are optional per learner in LIKHA-SIS -- when unrecorded, the respective column renders blank rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "General Average and Action Taken for incomplete records".to_string(),
                reason: "If a learner is missing a computed final grade for one or more subjects in the school year, General Average renders blank and Action Taken is marked PENDING / INCOMPLETE rather than fabricating partial averages.".to_string(),
            },
            OmittedField {
                field: "Incomplete/Remedial subjects columns (Learning Areas with deficient grades)".to_string(),
                reason: "Specific remedial schedule tracking and post-remedial re-assessment workflows will be modeled in a subsequent iteration.".to_string(),
            },
        ],
    }
}

/// Builds the SF5 CSV export string and disclosure struct.
pub fn build_sf5_export(
    school: &School,
    section_name: &str,
    grade_level: &str,
    school_year: &str,
    adviser_name: Option<&str>,
    subjects: &[String],
    learners: &[Sf5LearnerRow],
) -> Sf5Export {
    let mut lines: Vec<String> = vec![
        // 1. Header Metadata block
        csv::row(&["School Form 5 (SF5) Report on Promotion and Level of Proficiency".to_string()]),
        csv::row(&[
            "DepEd Order No. 8, s. 2015 / DepEd Order No. 58, s. 2017 compliant section summary"
                .to_string(),
        ]),
        csv::row(&["School ID".to_string(), school.id.clone()]),
        csv::row(&["School Name".to_string(), school.name.clone()]),
        csv::row(&["Grade Level".to_string(), grade_level.to_string()]),
        csv::row(&["Section".to_string(), section_name.to_string()]),
        csv::row(&["School Year".to_string(), school_year.to_string()]),
        csv::row(&[
            "Class Adviser".to_string(),
            adviser_name.unwrap_or("").to_string(),
        ]),
        String::new(),
    ];

    // 2. Table Column Headers
    let mut table_headers = vec![
        "LRN".to_string(),
        "Learner Name (Family, Given)".to_string(),
        "Sex".to_string(),
    ];
    for subj in subjects {
        table_headers.push(subj.clone());
    }
    table_headers.push("General Average".to_string());
    table_headers.push("Action Taken".to_string());
    lines.push(csv::row(&table_headers));

    // 3. Learner Rows
    for l in learners {
        let lrn_str = l.lrn.as_deref().unwrap_or("");
        let name_str = format!("{}, {}", l.family_name, l.given_name);
        let sex_str = l.sex.as_deref().unwrap_or("");

        let mut row_cells = vec![lrn_str.to_string(), name_str, sex_str.to_string()];

        // Subject final grades aligned to `subjects` list
        for subj in subjects {
            let grade_str = l
                .subject_grades
                .iter()
                .find(|sg| sg.subject_name == *subj)
                .and_then(|sg| sg.final_grade)
                .map(|g| g.to_string())
                .unwrap_or_default();
            row_cells.push(grade_str);
        }

        let gen_avg_str = l
            .general_average
            .map(|avg| format!("{:.2}", avg))
            .unwrap_or_default();
        row_cells.push(gen_avg_str);
        row_cells.push(l.promotion_status.as_str().to_string());

        lines.push(csv::row(&row_cells));
    }

    lines.push(String::new());

    // 4. Summary Table: Level of Proficiency & Summary of Promotion Decisions
    let summary = ProficiencySummary::compute(learners);

    lines.push(csv::row(&[
        "SUMMARY TABLE: LEVEL OF PROFICIENCY".to_string()
    ]));
    lines.push(csv::row(&[
        "Level of Proficiency".to_string(),
        "Male".to_string(),
        "Female".to_string(),
        "Total".to_string(),
    ]));
    lines.push(csv::row(&[
        LevelOfProficiency::DidNotMeetExpectations
            .label()
            .to_string(),
        summary.did_not_meet_m.to_string(),
        summary.did_not_meet_f.to_string(),
        summary.did_not_meet_total.to_string(),
    ]));
    lines.push(csv::row(&[
        LevelOfProficiency::FairlySatisfactory.label().to_string(),
        summary.fairly_satisfactory_m.to_string(),
        summary.fairly_satisfactory_f.to_string(),
        summary.fairly_satisfactory_total.to_string(),
    ]));
    lines.push(csv::row(&[
        LevelOfProficiency::Satisfactory.label().to_string(),
        summary.satisfactory_m.to_string(),
        summary.satisfactory_f.to_string(),
        summary.satisfactory_total.to_string(),
    ]));
    lines.push(csv::row(&[
        LevelOfProficiency::VerySatisfactory.label().to_string(),
        summary.very_satisfactory_m.to_string(),
        summary.very_satisfactory_f.to_string(),
        summary.very_satisfactory_total.to_string(),
    ]));
    lines.push(csv::row(&[
        LevelOfProficiency::Outstanding.label().to_string(),
        summary.outstanding_m.to_string(),
        summary.outstanding_f.to_string(),
        summary.outstanding_total.to_string(),
    ]));

    lines.push(String::new());

    lines.push(csv::row(
        &["SUMMARY TABLE: PROMOTION DECISIONS".to_string()],
    ));
    lines.push(csv::row(&[
        "Status".to_string(),
        "Male".to_string(),
        "Female".to_string(),
        "Total".to_string(),
    ]));
    lines.push(csv::row(&[
        "PROMOTED".to_string(),
        summary.promoted_m.to_string(),
        summary.promoted_f.to_string(),
        summary.promoted_total.to_string(),
    ]));
    lines.push(csv::row(&[
        "CONDITIONAL".to_string(),
        summary.conditional_m.to_string(),
        summary.conditional_f.to_string(),
        summary.conditional_total.to_string(),
    ]));
    lines.push(csv::row(&[
        "RETAINED".to_string(),
        summary.retained_m.to_string(),
        summary.retained_f.to_string(),
        summary.retained_total.to_string(),
    ]));
    lines.push(csv::row(&[
        "PENDING / INCOMPLETE".to_string(),
        summary.pending_m.to_string(),
        summary.pending_f.to_string(),
        summary.pending_total.to_string(),
    ]));

    lines.push(String::new());

    // 5. Disclosure Block
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

    Sf5Export {
        csv: lines.join("\n"),
        disclosure: disc,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_school() -> School {
        School {
            id: "123456".to_string(),
            name: "Mabini Central Elementary School".to_string(),
            created_at: "2026-06-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn compute_status_promotes_learner_with_all_passing_grades() {
        let grades = vec![
            Sf5SubjectGrade {
                subject_name: "English".to_string(),
                final_grade: Some(85),
            },
            Sf5SubjectGrade {
                subject_name: "Math".to_string(),
                final_grade: Some(88),
            },
            Sf5SubjectGrade {
                subject_name: "Science".to_string(),
                final_grade: Some(90),
            },
        ];

        let (avg, status) = Sf5LearnerRow::compute_status(&grades);
        assert_eq!(status, PromotionStatus::Promoted);
        assert!(avg.is_some());
        let val = avg.unwrap();
        assert!((val - 87.66666666666667).abs() < 1e-6);
    }

    #[test]
    fn compute_status_conditional_for_one_or_two_failed_subjects() {
        let grades_1_fail = vec![
            Sf5SubjectGrade {
                subject_name: "English".to_string(),
                final_grade: Some(74),
            },
            Sf5SubjectGrade {
                subject_name: "Math".to_string(),
                final_grade: Some(80),
            },
            Sf5SubjectGrade {
                subject_name: "Science".to_string(),
                final_grade: Some(82),
            },
        ];
        let (avg, status) = Sf5LearnerRow::compute_status(&grades_1_fail);
        assert_eq!(status, PromotionStatus::Conditional);
        assert!(avg.is_some());

        let grades_2_fails = vec![
            Sf5SubjectGrade {
                subject_name: "English".to_string(),
                final_grade: Some(73),
            },
            Sf5SubjectGrade {
                subject_name: "Math".to_string(),
                final_grade: Some(70),
            },
            Sf5SubjectGrade {
                subject_name: "Science".to_string(),
                final_grade: Some(85),
            },
        ];
        let (_avg2, status2) = Sf5LearnerRow::compute_status(&grades_2_fails);
        assert_eq!(status2, PromotionStatus::Conditional);
    }

    #[test]
    fn compute_status_retains_learner_with_three_or_more_failed_subjects() {
        let grades = vec![
            Sf5SubjectGrade {
                subject_name: "English".to_string(),
                final_grade: Some(72),
            },
            Sf5SubjectGrade {
                subject_name: "Math".to_string(),
                final_grade: Some(70),
            },
            Sf5SubjectGrade {
                subject_name: "Science".to_string(),
                final_grade: Some(68),
            },
            Sf5SubjectGrade {
                subject_name: "Filipino".to_string(),
                final_grade: Some(85),
            },
        ];
        let (avg, status) = Sf5LearnerRow::compute_status(&grades);
        assert_eq!(status, PromotionStatus::Retained);
        assert!(avg.is_some());
    }

    #[test]
    fn compute_status_pending_when_grades_are_missing() {
        let grades = vec![
            Sf5SubjectGrade {
                subject_name: "English".to_string(),
                final_grade: Some(85),
            },
            Sf5SubjectGrade {
                subject_name: "Math".to_string(),
                final_grade: None,
            },
        ];
        let (avg, status) = Sf5LearnerRow::compute_status(&grades);
        assert_eq!(status, PromotionStatus::Pending);
        assert!(avg.is_none());
    }

    #[test]
    fn proficiency_level_mapping_matches_deped_order() {
        assert_eq!(
            LevelOfProficiency::from_average(95.4),
            Some(LevelOfProficiency::Outstanding)
        );
        assert_eq!(
            LevelOfProficiency::from_average(87.0),
            Some(LevelOfProficiency::VerySatisfactory)
        );
        assert_eq!(
            LevelOfProficiency::from_average(82.5),
            Some(LevelOfProficiency::Satisfactory)
        );
        assert_eq!(
            LevelOfProficiency::from_average(77.0),
            Some(LevelOfProficiency::FairlySatisfactory)
        );
        assert_eq!(
            LevelOfProficiency::from_average(74.4),
            Some(LevelOfProficiency::DidNotMeetExpectations)
        );
    }

    #[test]
    fn sf5_export_renders_assigned_adviser_and_tables() {
        let school = sample_school();
        let subjects = vec!["English".to_string(), "Mathematics".to_string()];

        let learners = vec![
            Sf5LearnerRow {
                learner_id: "l1".to_string(),
                given_name: "Juan".to_string(),
                family_name: "Dela Cruz".to_string(),
                sex: Some("Male".to_string()),
                lrn: Some("123456789012".to_string()),
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
            Sf5LearnerRow {
                learner_id: "l2".to_string(),
                given_name: "Maria".to_string(),
                family_name: "Santos".to_string(),
                sex: Some("Female".to_string()),
                lrn: Some("987654321098".to_string()),
                subject_grades: vec![
                    Sf5SubjectGrade {
                        subject_name: "English".to_string(),
                        final_grade: Some(72),
                    },
                    Sf5SubjectGrade {
                        subject_name: "Mathematics".to_string(),
                        final_grade: Some(80),
                    },
                ],
                general_average: Some(76.0),
                promotion_status: PromotionStatus::Conditional,
            },
        ];

        let export = build_sf5_export(
            &school,
            "Grade 6 - Diamond",
            "Grade 6",
            "2026-2027",
            Some("Maria Clara"),
            &subjects,
            &learners,
        );

        assert!(export.csv.contains("School Form 5 (SF5)"));
        assert!(export
            .csv
            .contains("School Name,Mabini Central Elementary School"));
        assert!(export.csv.contains("Class Adviser,Maria Clara"));
        assert!(export
            .csv
            .contains("123456789012,\"Dela Cruz, Juan\",Male,88,92,90.00,PROMOTED"));
        assert!(export
            .csv
            .contains("987654321098,\"Santos, Maria\",Female,72,80,76.00,CONDITIONAL"));
        assert!(export.csv.contains("SUMMARY TABLE: LEVEL OF PROFICIENCY"));
        assert!(export.csv.contains("Outstanding (90-100),1,0,1"));
        assert!(export.csv.contains("Fairly Satisfactory (75-79),0,1,1"));
        assert!(export.csv.contains("PROMOTED,1,0,1"));
        assert!(export.csv.contains("CONDITIONAL,0,1,1"));
        assert!(export.csv.contains("# DISCLOSURE"));
    }

    #[test]
    fn sf5_export_renders_blank_for_unassigned_adviser() {
        let school = sample_school();
        let subjects = vec!["English".to_string()];
        let learners = vec![];

        let export = build_sf5_export(
            &school,
            "Grade 6 - Emerald",
            "Grade 6",
            "2026-2027",
            None,
            &subjects,
            &learners,
        );

        assert!(export.csv.contains("Class Adviser,"));
    }
}
