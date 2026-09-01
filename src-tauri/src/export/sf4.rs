//! Builds a school-level School Form 4 (SF4) Monthly Learner Movement and Attendance
//! Consolidation export as CSV — per DepEd Order No. 4, s. 2014 and DepEd Order No. 58, s. 2017.
//!
//! Consolidates monthly attendance metrics (Registered Learners, Daily Average Attendance,
//! and Percentage of Attendance for the Month) across all sections and grade levels in the school,
//! with grade-level subtotals and school grand totals disaggregated by sex (Male, Female, Total).

use crate::export::csv;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::school::School;

const MONTH_NAMES: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

#[derive(Debug, Clone, PartialEq)]
pub struct Sf4SectionSummary {
    pub section_id: String,
    pub section_name: String,
    pub grade_level: String,
    pub adviser_name: Option<String>,
    pub registered_male: u32,
    pub registered_female: u32,
    pub registered_total: u32,
    pub daily_avg_male: f64,
    pub daily_avg_female: f64,
    pub daily_avg_total: f64,
    pub attendance_pct_male: f64,
    pub attendance_pct_female: f64,
    pub attendance_pct_total: f64,
}

pub struct Sf4Export {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "School ID".to_string(),
            "School Name".to_string(),
            "Report Month and Year".to_string(),
            "Grade Levels & Section Names".to_string(),
            "Class Advisers (if assigned)".to_string(),
            "Registered Learners (Male, Female, Total by Section, Grade Level, and Grand Total)"
                .to_string(),
            "Daily Average Attendance (Male, Female, Total by Section, Grade Level, and Grand Total)"
                .to_string(),
            "Percentage of Attendance for the Month (Male, Female, Total by Section, Grade Level, and Grand Total)"
                .to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "Division / District / Region".to_string(),
                reason: "Administrative division hierarchy not currently stored on the local school record".to_string(),
            },
            OmittedField {
                field: "Transferred In / Transferred Out / Dropped Out / NLPA Cause Categorization".to_string(),
                reason: "LIKHA-SIS tracks active section enrollment; specialized dropout/transfer cause codes are not yet recorded".to_string(),
            },
            OmittedField {
                field: "School Head Physical Signature Block".to_string(),
                reason: "Official sign-off is completed on the printed submission copy".to_string(),
            },
        ],
    }
}

/// Helper function to format a floating point number to 2 decimal places.
fn fmt_2dp(val: f64) -> String {
    format!("{:.2}", val)
}

/// Builds the School Form 4 (SF4) monthly attendance consolidation export.
pub fn build_sf4_export(
    school: &School,
    year: i32,
    month: u32,
    sections: &[Sf4SectionSummary],
) -> Sf4Export {
    let month_name = if (1..=12).contains(&month) {
        MONTH_NAMES[(month - 1) as usize]
    } else {
        "Unknown"
    };

    let mut lines: Vec<String> = vec![
        csv::row(&[
            "School Form 4 (SF4) Monthly Learner Movement and Attendance Consolidation".to_string(),
        ]),
        csv::row(&[
            "School ID:".to_string(),
            school.id.clone(),
            String::new(),
            "School Name:".to_string(),
            school.name.clone(),
            String::new(),
            "Month & Year:".to_string(),
            format!("{} {}", month_name, year),
        ]),
        String::new(),
        csv::row(&[
            "GRADE LEVEL".to_string(),
            "SECTION NAME".to_string(),
            "CLASS ADVISER".to_string(),
            "REGISTERED (M)".to_string(),
            "REGISTERED (F)".to_string(),
            "REGISTERED (TOTAL)".to_string(),
            "DAILY AVG (M)".to_string(),
            "DAILY AVG (F)".to_string(),
            "DAILY AVG (TOTAL)".to_string(),
            "ATTENDANCE % (M)".to_string(),
            "ATTENDANCE % (F)".to_string(),
            "ATTENDANCE % (TOTAL)".to_string(),
        ]),
    ];

    // Group sections by grade level while preserving ordering
    let mut grade_levels: Vec<String> = Vec::new();
    for sec in sections {
        if !grade_levels.contains(&sec.grade_level) {
            grade_levels.push(sec.grade_level.clone());
        }
    }

    let mut grand_reg_m: u32 = 0;
    let mut grand_reg_f: u32 = 0;
    let mut grand_reg_total: u32 = 0;
    let mut grand_daily_avg_m: f64 = 0.0;
    let mut grand_daily_avg_f: f64 = 0.0;
    let mut grand_daily_avg_total: f64 = 0.0;

    for gl in &grade_levels {
        let gl_sections: Vec<&Sf4SectionSummary> =
            sections.iter().filter(|s| &s.grade_level == gl).collect();

        let mut sub_reg_m: u32 = 0;
        let mut sub_reg_f: u32 = 0;
        let mut sub_reg_total: u32 = 0;
        let mut sub_daily_avg_m: f64 = 0.0;
        let mut sub_daily_avg_f: f64 = 0.0;
        let mut sub_daily_avg_total: f64 = 0.0;

        for sec in &gl_sections {
            sub_reg_m += sec.registered_male;
            sub_reg_f += sec.registered_female;
            sub_reg_total += sec.registered_total;
            sub_daily_avg_m += sec.daily_avg_male;
            sub_daily_avg_f += sec.daily_avg_female;
            sub_daily_avg_total += sec.daily_avg_total;

            lines.push(csv::row(&[
                sec.grade_level.clone(),
                sec.section_name.clone(),
                sec.adviser_name.clone().unwrap_or_default(),
                sec.registered_male.to_string(),
                sec.registered_female.to_string(),
                sec.registered_total.to_string(),
                fmt_2dp(sec.daily_avg_male),
                fmt_2dp(sec.daily_avg_female),
                fmt_2dp(sec.daily_avg_total),
                format!("{}%", fmt_2dp(sec.attendance_pct_male)),
                format!("{}%", fmt_2dp(sec.attendance_pct_female)),
                format!("{}%", fmt_2dp(sec.attendance_pct_total)),
            ]));
        }

        let sub_pct_m = if sub_reg_m > 0 {
            (sub_daily_avg_m / sub_reg_m as f64) * 100.0
        } else {
            0.0
        };
        let sub_pct_f = if sub_reg_f > 0 {
            (sub_daily_avg_f / sub_reg_f as f64) * 100.0
        } else {
            0.0
        };
        let sub_pct_total = if sub_reg_total > 0 {
            (sub_daily_avg_total / sub_reg_total as f64) * 100.0
        } else {
            0.0
        };

        lines.push(csv::row(&[
            format!("SUBTOTAL ({gl})"),
            String::new(),
            String::new(),
            sub_reg_m.to_string(),
            sub_reg_f.to_string(),
            sub_reg_total.to_string(),
            fmt_2dp(sub_daily_avg_m),
            fmt_2dp(sub_daily_avg_f),
            fmt_2dp(sub_daily_avg_total),
            format!("{}%", fmt_2dp(sub_pct_m)),
            format!("{}%", fmt_2dp(sub_pct_f)),
            format!("{}%", fmt_2dp(sub_pct_total)),
        ]));

        grand_reg_m += sub_reg_m;
        grand_reg_f += sub_reg_f;
        grand_reg_total += sub_reg_total;
        grand_daily_avg_m += sub_daily_avg_m;
        grand_daily_avg_f += sub_daily_avg_f;
        grand_daily_avg_total += sub_daily_avg_total;
    }

    let grand_pct_m = if grand_reg_m > 0 {
        (grand_daily_avg_m / grand_reg_m as f64) * 100.0
    } else {
        0.0
    };
    let grand_pct_f = if grand_reg_f > 0 {
        (grand_daily_avg_f / grand_reg_f as f64) * 100.0
    } else {
        0.0
    };
    let grand_pct_total = if grand_reg_total > 0 {
        (grand_daily_avg_total / grand_reg_total as f64) * 100.0
    } else {
        0.0
    };

    lines.push(String::new());
    lines.push(csv::row(&[
        "SCHOOL GRAND TOTAL".to_string(),
        String::new(),
        String::new(),
        grand_reg_m.to_string(),
        grand_reg_f.to_string(),
        grand_reg_total.to_string(),
        fmt_2dp(grand_daily_avg_m),
        fmt_2dp(grand_daily_avg_f),
        fmt_2dp(grand_daily_avg_total),
        format!("{}%", fmt_2dp(grand_pct_m)),
        format!("{}%", fmt_2dp(grand_pct_f)),
        format!("{}%", fmt_2dp(grand_pct_total)),
    ]));

    let d = disclosure();
    lines.push(String::new());
    lines.push("# --- Field Disclosures ---".to_string());
    lines.push("# Populated:".to_string());
    for p in &d.populated_fields {
        lines.push(format!("#   - {p}"));
    }
    lines.push("# Omitted:".to_string());
    for o in &d.omitted_fields {
        lines.push(format!("#   - {}: {}", o.field, o.reason));
    }

    Sf4Export {
        csv: lines.join("\r\n"),
        disclosure: d,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_school() -> School {
        School {
            id: "SCH-001".to_string(),
            name: "Mabini Central Elementary School".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_sf4_export_empty_sections() {
        let school = sample_school();
        let export = build_sf4_export(&school, 2026, 9, &[]);

        assert!(export.csv.contains("Mabini Central Elementary School"));
        assert!(export.csv.contains("September 2026"));
        assert!(export.csv.contains("SCHOOL GRAND TOTAL,,,0,0,0,0.00,0.00,0.00,0.00%,0.00%,0.00%"));
        assert_eq!(export.disclosure.populated_fields.len(), 8);
        assert_eq!(export.disclosure.omitted_fields.len(), 3);
    }

    #[test]
    fn test_sf4_export_single_section() {
        let school = sample_school();
        let sections = vec![Sf4SectionSummary {
            section_id: "sec-1".to_string(),
            section_name: "Grade 7 - Rizal".to_string(),
            grade_level: "Grade 7".to_string(),
            adviser_name: Some("Juan Dela Cruz".to_string()),
            registered_male: 10,
            registered_female: 10,
            registered_total: 20,
            daily_avg_male: 9.5,
            daily_avg_female: 9.0,
            daily_avg_total: 18.5,
            attendance_pct_male: 95.0,
            attendance_pct_female: 90.0,
            attendance_pct_total: 92.5,
        }];

        let export = build_sf4_export(&school, 2026, 9, &sections);
        assert!(export.csv.contains("Grade 7 - Rizal"));
        assert!(export.csv.contains("Juan Dela Cruz"));
        assert!(export.csv.contains("SUBTOTAL (Grade 7),,,10,10,20,9.50,9.00,18.50,95.00%,90.00%,92.50%"));
        assert!(export.csv.contains("SCHOOL GRAND TOTAL,,,10,10,20,9.50,9.00,18.50,95.00%,90.00%,92.50%"));
    }

    #[test]
    fn test_sf4_export_multiple_grades_subtotals_and_grand_totals() {
        let school = sample_school();
        let sections = vec![
            Sf4SectionSummary {
                section_id: "sec-1".to_string(),
                section_name: "Grade 7 - Rizal".to_string(),
                grade_level: "Grade 7".to_string(),
                adviser_name: Some("Adviser 1".to_string()),
                registered_male: 10,
                registered_female: 10,
                registered_total: 20,
                daily_avg_male: 10.0,
                daily_avg_female: 10.0,
                daily_avg_total: 20.0,
                attendance_pct_male: 100.0,
                attendance_pct_female: 100.0,
                attendance_pct_total: 100.0,
            },
            Sf4SectionSummary {
                section_id: "sec-2".to_string(),
                section_name: "Grade 7 - Bonifacio".to_string(),
                grade_level: "Grade 7".to_string(),
                adviser_name: None,
                registered_male: 10,
                registered_female: 10,
                registered_total: 20,
                daily_avg_male: 8.0,
                daily_avg_female: 8.0,
                daily_avg_total: 16.0,
                attendance_pct_male: 80.0,
                attendance_pct_female: 80.0,
                attendance_pct_total: 80.0,
            },
            Sf4SectionSummary {
                section_id: "sec-3".to_string(),
                section_name: "Grade 8 - Luna".to_string(),
                grade_level: "Grade 8".to_string(),
                adviser_name: Some("Adviser 3".to_string()),
                registered_male: 15,
                registered_female: 15,
                registered_total: 30,
                daily_avg_male: 15.0,
                daily_avg_female: 12.0,
                daily_avg_total: 27.0,
                attendance_pct_male: 100.0,
                attendance_pct_female: 80.0,
                attendance_pct_total: 90.0,
            },
        ];

        let export = build_sf4_export(&school, 2026, 10, &sections);
        assert!(export.csv.contains("October 2026"));
        // Grade 7 subtotal: 20 M, 20 F, 40 Total; daily avg: 18 M, 18 F, 36 Total -> (18/20)*100 = 90%
        assert!(export.csv.contains("SUBTOTAL (Grade 7),,,20,20,40,18.00,18.00,36.00,90.00%,90.00%,90.00%"));
        // Grade 8 subtotal: 15 M, 15 F, 30 Total; daily avg: 15 M, 12 F, 27 Total -> 100%, 80%, 90%
        assert!(export.csv.contains("SUBTOTAL (Grade 8),,,15,15,30,15.00,12.00,27.00,100.00%,80.00%,90.00%"));
        // Grand Total: 35 M, 35 F, 70 Total; daily avg: 33 M, 30 F, 63 Total
        // Pct: (33/35)*100 = 94.29%, (30/35)*100 = 85.71%, (63/70)*100 = 90.00%
        assert!(export.csv.contains("SCHOOL GRAND TOTAL,,,35,35,70,33.00,30.00,63.00,94.29%,85.71%,90.00%"));
    }

    #[test]
    fn test_sf4_formula_injection_defense() {
        let mut school = sample_school();
        school.name = "=cmd|' /C calc'!A0".to_string();
        let sections = vec![Sf4SectionSummary {
            section_id: "sec-1".to_string(),
            section_name: "+SUM(A1:A10)".to_string(),
            grade_level: "@Grade 7".to_string(),
            adviser_name: Some("-Adviser".to_string()),
            registered_male: 5,
            registered_female: 5,
            registered_total: 10,
            daily_avg_male: 5.0,
            daily_avg_female: 5.0,
            daily_avg_total: 10.0,
            attendance_pct_male: 100.0,
            attendance_pct_female: 100.0,
            attendance_pct_total: 100.0,
        }];

        let export = build_sf4_export(&school, 2026, 9, &sections);
        // Ensure leading symbols are escaped with single quote in CSV cells
        assert!(export.csv.contains("'=cmd|' /C calc'!A0"));
        assert!(export.csv.contains("'+SUM(A1:A10)"));
        assert!(export.csv.contains("'@Grade 7"));
        assert!(export.csv.contains("'-Adviser"));
    }
}
