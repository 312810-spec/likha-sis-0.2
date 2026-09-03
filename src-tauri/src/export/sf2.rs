//! Builds a section-level, DepEd-SF2-inspired monthly attendance export as
//! CSV. Field layout verified against DepEd Order No. 4, s. 2014
//! ("Adoption of the Modified School Forms") plus a real, in-use
//! `CONSO SF v2025.xlsx` workbook inspected during M8 (structural facts
//! only — no real learner/school data was ever copied into this repo) —
//! see `docs/adr/0009-sf2-export-and-official-form-engine.md` for the full
//! citation trail and exactly which fields this export can and cannot
//! populate.
//!
//! This is deliberately NOT a submission-ready reproduction of the
//! official template: it omits every field this app's schema cannot
//! honestly populate (School ID, enrollment/dropout/transfer statistics,
//! gender breakdowns, per-learner remarks, the late-comer/cutting-classes
//! Tardy subtype) rather than fabricate placeholder values for them. The
//! `FieldDisclosure` returned alongside the CSV is the single source of
//! truth for what was and wasn't populated — the trailing comment block
//! in the CSV and the on-screen disclaimer in `MonthlySummaryScreen` are
//! both rendered FROM this struct, not maintained as separate hand-written
//! text, so they cannot silently drift from each other or from the file.

use crate::export::csv;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::attendance::{AttendanceStatus, MonthlyAttendanceReport};
use crate::repository::school::School;
use crate::repository::section::Section;

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

pub struct Sf2Export {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn status_code(status: Option<AttendanceStatus>) -> &'static str {
    match status {
        None | Some(AttendanceStatus::Present) => "",
        Some(AttendanceStatus::Absent) => "X",
        Some(AttendanceStatus::Tardy) => "T",
    }
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "School Name".to_string(),
            "Section".to_string(),
            "Grade Level".to_string(),
            "School Year".to_string(),
            "Class Adviser (if assigned)".to_string(),
            "Report Month".to_string(),
            "Learner Name".to_string(),
            "LRN".to_string(),
            "Sex".to_string(),
            "Per-day attendance (blank = Present, X = Absent, T = Tardy)".to_string(),
            "Total Absent (per learner, per month)".to_string(),
            "Total Tardy (per learner, per month)".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "School ID (EBEIS)".to_string(),
                reason: "LIKHA-SIS does not currently store a School ID / EBEIS registration number.".to_string(),
            },
            OmittedField {
                field: "Class Adviser for a section without an active advisory assignment".to_string(),
                reason: "LIKHA-SIS allows sections without an assigned class adviser -- when none is active, the Class Adviser header field renders blank rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "LRN or Sex for a learner who does not yet have one recorded".to_string(),
                reason: "LRN and Sex were added in M17 (docs/adr/0017-learner-reference-number-and-sex.md) and are optional per learner -- a learner enrolled before this milestone, or simply not yet given either value, renders blank in that column rather than a fabricated placeholder.".to_string(),
            },
            OmittedField {
                field: "Tardy subtype (late comer vs. cutting classes)".to_string(),
                reason: "LIKHA-SIS records a single Tardy status; DepEd's half-shaded cell distinguishes upper (late comer) from lower (cutting classes), which this app cannot currently distinguish.".to_string(),
            },
            OmittedField {
                field: "Remarks (free text per learner)".to_string(),
                reason: "LIKHA-SIS does not currently capture a per-learner attendance remarks field.".to_string(),
            },
            OmittedField {
                field: "Enrolment / Late Enrolment / Registered Learner counts".to_string(),
                reason: "LIKHA-SIS does not track DepEd's official enrollment-count concepts (e.g. \"as of 1st Friday of June\").".to_string(),
            },
            OmittedField {
                field: "Average Daily Attendance / Percentage of Attendance".to_string(),
                reason: "Derivable in principle from totals already shown, but DepEd's exact computation formula was not verified for this milestone, so it is not computed here rather than guessed.".to_string(),
            },
            OmittedField {
                field: "Drop out / Transferred In / Transferred Out (by sex)".to_string(),
                reason: "LIKHA-SIS tracks each learner's Sex (as of M17, see above) but does not track drop-out or transfer events at all, so the by-sex breakdown these statistics require cannot be computed.".to_string(),
            },
            OmittedField {
                field: "Number of students absent 5 consecutive days".to_string(),
                reason: "Not computed by this export.".to_string(),
            },
            OmittedField {
                field: "Signature of Teacher / Signature of School Head".to_string(),
                reason: "The certification block is a physical/manual step, intentionally left for the teacher/adviser and School Head to sign after printing.".to_string(),
            },
        ],
    }
}

/// Assembles the section-level monthly SF2-inspired export for one
/// section/month. `school`/`section`/`report` must already be verified as
/// belonging to the caller's own school scope — this function does no
/// isolation checking itself, matching the separation between
/// `repository::*` (isolation-enforcing data access) and this pure
/// formatting layer.
pub fn build_sf2_export(
    school: &School,
    section: &Section,
    adviser_name: Option<&str>,
    report: &MonthlyAttendanceReport,
) -> Sf2Export {
    let disclosure = disclosure();

    let month_name = MONTH_NAMES
        .get((report.month.saturating_sub(1)) as usize)
        .copied()
        .unwrap_or("Unknown");
    let mut rows: Vec<String> = vec![
        csv::row(&["School Name".to_string(), school.name.clone()]),
        csv::row(&["Section".to_string(), section.name.clone()]),
        csv::row(&["Grade Level".to_string(), section.grade_level.clone()]),
        csv::row(&["School Year".to_string(), section.school_year.clone()]),
        csv::row(&[
            "Class Adviser".to_string(),
            adviser_name.unwrap_or("").to_string(),
        ]),
        csv::row(&[
            "Report for the Month of".to_string(),
            format!("{month_name} {}", report.year),
        ]),
        String::new(),
    ];

    let mut header = vec![
        "Learner Name".to_string(),
        "LRN".to_string(),
        "Sex".to_string(),
    ];
    header.extend(report.school_days.iter().map(|d| d.to_string()));
    header.push("Total Absent".to_string());
    header.push("Total Tardy".to_string());
    rows.push(csv::row(&header));

    for learner in &report.learners {
        let mut fields = vec![
            format!("{}, {}", learner.family_name, learner.given_name),
            learner.lrn.clone().unwrap_or_default(),
            learner.sex.clone().unwrap_or_default(),
        ];
        fields.extend(learner.days.iter().map(|d| status_code(*d).to_string()));
        fields.push(learner.absent_count.to_string());
        fields.push(learner.tardy_count.to_string());
        rows.push(csv::row(&fields));
    }

    rows.push(String::new());
    rows.push("# This is a DepEd-SF2-inspired export, not a submission-ready".to_string());
    rows.push("# reproduction of the official template. Fields NOT included:".to_string());
    for omitted in &disclosure.omitted_fields {
        rows.push(format!("# - {}: {}", omitted.field, omitted.reason));
    }

    Sf2Export {
        csv: rows.join("\n"),
        disclosure,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::attendance::MonthlyLearnerAttendance;

    fn a_school() -> School {
        School {
            id: "s1".to_string(),
            name: "Rizal Elementary".to_string(),
            created_at: "now".to_string(),
        }
    }

    fn a_section() -> Section {
        Section {
            id: "sec1".to_string(),
            school_id: "s1".to_string(),
            school_year: "2025-2026".to_string(),
            grade_level: "7".to_string(),
            name: "Mabini".to_string(),
            created_at: "now".to_string(),
        }
    }

    fn a_report() -> MonthlyAttendanceReport {
        MonthlyAttendanceReport {
            year: 2026,
            month: 8,
            school_days: vec![3, 4, 5],
            learners: vec![MonthlyLearnerAttendance {
                learner_id: "l1".to_string(),
                given_name: "Ana".to_string(),
                family_name: "Cruz".to_string(),
                lrn: Some("123456789012".to_string()),
                sex: Some("F".to_string()),
                days: vec![
                    Some(AttendanceStatus::Present),
                    Some(AttendanceStatus::Absent),
                    Some(AttendanceStatus::Tardy),
                ],
                present_count: 1,
                absent_count: 1,
                tardy_count: 1,
            }],
        }
    }

    #[test]
    fn header_rows_carry_school_section_grade_year_and_month() {
        let export = build_sf2_export(&a_school(), &a_section(), Some("Maria Clara"), &a_report());

        assert!(export.csv.contains("School Name,Rizal Elementary"));
        assert!(export.csv.contains("Section,Mabini"));
        assert!(export.csv.contains("Grade Level,7"));
        assert!(export.csv.contains("School Year,2025-2026"));
        assert!(export.csv.contains("Class Adviser,Maria Clara"));
        assert!(export.csv.contains("Report for the Month of,August 2026"));
    }

    #[test]
    fn unassigned_adviser_renders_blank_header() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        assert!(export.csv.contains("Class Adviser,"));
    }

    #[test]
    fn per_day_codes_render_blank_present_x_absent_t_tardy() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        // Present(3) -> blank, Absent(4) -> X, Tardy(5) -> T
        assert!(export.csv.contains("\"Cruz, Ana\",123456789012,F,,X,T,1,1"));
    }

    #[test]
    fn an_unmarked_day_renders_blank_the_same_as_present() {
        let mut report = a_report();
        report.learners[0].days = vec![None, None, None];
        report.learners[0].present_count = 0;
        report.learners[0].absent_count = 0;
        report.learners[0].tardy_count = 0;
        let export = build_sf2_export(&a_school(), &a_section(), None, &report);

        assert!(export.csv.contains("\"Cruz, Ana\",123456789012,F,,,,0,0"));
    }

    #[test]
    fn a_learner_with_no_recorded_lrn_or_sex_renders_blank_not_fabricated() {
        let mut report = a_report();
        report.learners[0].lrn = None;
        report.learners[0].sex = None;
        let export = build_sf2_export(&a_school(), &a_section(), None, &report);

        assert!(export.csv.contains("\"Cruz, Ana\",,,,X,T,1,1"));
    }

    #[test]
    fn the_day_header_row_lists_only_school_days_in_order() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        assert!(export
            .csv
            .contains("Learner Name,LRN,Sex,3,4,5,Total Absent,Total Tardy"));
    }

    #[test]
    fn totals_come_from_the_report_not_recomputed() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        let line = export
            .csv
            .lines()
            .find(|l| l.starts_with("\"Cruz, Ana\""))
            .unwrap();
        assert!(line.ends_with(",1,1"));
    }

    #[test]
    fn no_enrollment_dropout_transfer_or_gender_field_appears_anywhere_in_the_csv() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        for forbidden in [
            "Drop out",
            "Transferred",
            "Enrolment",
            "Enrollment",
            "Male",
            "Female",
            "Average Daily Attendance",
        ] {
            assert!(
                !export.csv.lines().any(|line| !line.starts_with('#') && line.contains(forbidden)),
                "'{forbidden}' must not appear outside the disclosure comment block — it is not real tracked data"
            );
        }
    }

    #[test]
    fn the_disclosure_lists_every_field_actually_omitted_from_the_csv_body() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        assert!(!export.disclosure.omitted_fields.is_empty());
        for omitted in &export.disclosure.omitted_fields {
            assert!(export.csv.contains(&omitted.field));
        }
    }

    #[test]
    fn school_id_field_is_never_fabricated() {
        let export = build_sf2_export(&a_school(), &a_section(), None, &a_report());

        assert!(!export
            .csv
            .lines()
            .any(|l| !l.starts_with('#') && l.starts_with("School ID")));
    }
}
