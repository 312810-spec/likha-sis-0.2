//! Builds a school-level School Form 6 (SF6) End of School Year (EOSY)
//! Summarized Report on Promotion and Level of Proficiency export as CSV —
//! per DepEd Order No. 8, s. 2015 / DepEd Order No. 58, s. 2017 / DepEd Order No. 4, s. 2014.
//!
//! Consolidates promotion statuses and levels of proficiency across all sections
//! and grade levels in the school for a given school year, with grade-level subtotals
//! and school grand totals disaggregated by sex (Male, Female, Total).
//!
//! Reuses the `ProficiencySummary` and domain structures established in `sf5.rs`.

use crate::export::csv;
use crate::export::sf5::ProficiencySummary;
use crate::export::{FieldDisclosure, OmittedField};
use crate::repository::school::School;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sf6SectionSummary {
    pub section_id: String,
    pub section_name: String,
    pub grade_level: String,
    pub summary: ProficiencySummary,
}

pub struct Sf6Export {
    pub csv: String,
    pub disclosure: FieldDisclosure,
}

fn disclosure() -> FieldDisclosure {
    FieldDisclosure {
        populated_fields: vec![
            "School ID".to_string(),
            "School Name".to_string(),
            "School Year".to_string(),
            "Grade Levels & Section Names".to_string(),
            "Promotion Status Summary by Section, Grade Level, and School Total (Promoted, Conditional, Retained by Sex & Total)".to_string(),
            "Level of Proficiency Summary by Section, Grade Level, and School Total (<75, 75-79, 80-84, 85-89, 90-100 by Sex & Total)".to_string(),
        ],
        omitted_fields: vec![
            OmittedField {
                field: "Division / District / Region".to_string(),
                reason: "Administrative division hierarchy not currently stored on the local school record".to_string(),
            },
            OmittedField {
                field: "School Head Physical Signature Block".to_string(),
                reason: "Official sign-off is completed on the printed submission copy".to_string(),
            },
            OmittedField {
                field: "Division Representative / CID Certification Block".to_string(),
                reason: "External governance and validation block is filled by division officials during EOSY validation".to_string(),
            },
        ],
    }
}

/// Builds the School Form 6 (SF6) summarized promotion and proficiency export.
pub fn build_sf6_export(
    school: &School,
    school_year: &str,
    sections: &[Sf6SectionSummary],
) -> Sf6Export {
    // 1. Header Metadata & Table 1 Header
    let mut lines: Vec<String> = vec![
        csv::row(&[
            "School Form 6 (SF6) Summarized Report on Promotion and Level of Proficiency"
                .to_string(),
        ]),
        csv::row(&[
            "School ID:".to_string(),
            school.id.clone(),
            String::new(),
            "School Name:".to_string(),
            school.name.clone(),
            String::new(),
            "School Year:".to_string(),
            school_year.to_string(),
        ]),
        String::new(),
        csv::row(&["TABLE 1: SUMMARY OF PROMOTION STATUS BY SECTION AND GRADE LEVEL".to_string()]),
        csv::row(&[
            "Grade Level".to_string(),
            "Section Name".to_string(),
            "PROMOTED (M)".to_string(),
            "PROMOTED (F)".to_string(),
            "PROMOTED (TOTAL)".to_string(),
            "CONDITIONAL (M)".to_string(),
            "CONDITIONAL (F)".to_string(),
            "CONDITIONAL (TOTAL)".to_string(),
            "RETAINED (M)".to_string(),
            "RETAINED (F)".to_string(),
            "RETAINED (TOTAL)".to_string(),
            "PENDING / INCOMPLETE (M)".to_string(),
            "PENDING / INCOMPLETE (F)".to_string(),
            "PENDING / INCOMPLETE (TOTAL)".to_string(),
            "TOTAL (M)".to_string(),
            "TOTAL (F)".to_string(),
            "TOTAL (COMBINED)".to_string(),
        ]),
    ];

    // Group sections by grade level while preserving ordering
    let mut grade_levels: Vec<String> = Vec::new();
    for sec in sections {
        if !grade_levels.contains(&sec.grade_level) {
            grade_levels.push(sec.grade_level.clone());
        }
    }

    let mut grand_promoted_m = 0;
    let mut grand_promoted_f = 0;
    let mut grand_promoted_total = 0;

    let mut grand_conditional_m = 0;
    let mut grand_conditional_f = 0;
    let mut grand_conditional_total = 0;

    let mut grand_retained_m = 0;
    let mut grand_retained_f = 0;
    let mut grand_retained_total = 0;

    let mut grand_pending_m = 0;
    let mut grand_pending_f = 0;
    let mut grand_pending_total = 0;

    let mut grand_total_m = 0;
    let mut grand_total_f = 0;
    let mut grand_total_combined = 0;

    for gl in &grade_levels {
        let gl_sections: Vec<&Sf6SectionSummary> =
            sections.iter().filter(|s| s.grade_level == *gl).collect();

        let mut gl_promoted_m = 0;
        let mut gl_promoted_f = 0;
        let mut gl_promoted_total = 0;

        let mut gl_conditional_m = 0;
        let mut gl_conditional_f = 0;
        let mut gl_conditional_total = 0;

        let mut gl_retained_m = 0;
        let mut gl_retained_f = 0;
        let mut gl_retained_total = 0;

        let mut gl_pending_m = 0;
        let mut gl_pending_f = 0;
        let mut gl_pending_total = 0;

        let mut gl_total_m = 0;
        let mut gl_total_f = 0;
        let mut gl_total_combined = 0;

        for sec in &gl_sections {
            let p_m = sec.summary.promoted_m;
            let p_f = sec.summary.promoted_f;
            let p_tot = sec.summary.promoted_total;

            let c_m = sec.summary.conditional_m;
            let c_f = sec.summary.conditional_f;
            let c_tot = sec.summary.conditional_total;

            let r_m = sec.summary.retained_m;
            let r_f = sec.summary.retained_f;
            let r_tot = sec.summary.retained_total;

            let pending_m = sec.summary.pending_m;
            let pending_f = sec.summary.pending_f;
            let pending_tot = sec.summary.pending_total;

            let tot_m = p_m + c_m + r_m + pending_m;
            let tot_f = p_f + c_f + r_f + pending_f;
            let tot_comb = p_tot + c_tot + r_tot + pending_tot;

            gl_promoted_m += p_m;
            gl_promoted_f += p_f;
            gl_promoted_total += p_tot;

            gl_conditional_m += c_m;
            gl_conditional_f += c_f;
            gl_conditional_total += c_tot;

            gl_retained_m += r_m;
            gl_retained_f += r_f;
            gl_retained_total += r_tot;

            gl_pending_m += pending_m;
            gl_pending_f += pending_f;
            gl_pending_total += pending_tot;

            gl_total_m += tot_m;
            gl_total_f += tot_f;
            gl_total_combined += tot_comb;

            lines.push(csv::row(&[
                sec.grade_level.clone(),
                sec.section_name.clone(),
                p_m.to_string(),
                p_f.to_string(),
                p_tot.to_string(),
                c_m.to_string(),
                c_f.to_string(),
                c_tot.to_string(),
                r_m.to_string(),
                r_f.to_string(),
                r_tot.to_string(),
                pending_m.to_string(),
                pending_f.to_string(),
                pending_tot.to_string(),
                tot_m.to_string(),
                tot_f.to_string(),
                tot_comb.to_string(),
            ]));
        }

        // Subtotal row for Grade Level
        lines.push(csv::row(&[
            format!("TOTAL {}", gl),
            String::new(),
            gl_promoted_m.to_string(),
            gl_promoted_f.to_string(),
            gl_promoted_total.to_string(),
            gl_conditional_m.to_string(),
            gl_conditional_f.to_string(),
            gl_conditional_total.to_string(),
            gl_retained_m.to_string(),
            gl_retained_f.to_string(),
            gl_retained_total.to_string(),
            gl_pending_m.to_string(),
            gl_pending_f.to_string(),
            gl_pending_total.to_string(),
            gl_total_m.to_string(),
            gl_total_f.to_string(),
            gl_total_combined.to_string(),
        ]));

        grand_promoted_m += gl_promoted_m;
        grand_promoted_f += gl_promoted_f;
        grand_promoted_total += gl_promoted_total;

        grand_conditional_m += gl_conditional_m;
        grand_conditional_f += gl_conditional_f;
        grand_conditional_total += gl_conditional_total;

        grand_retained_m += gl_retained_m;
        grand_retained_f += gl_retained_f;
        grand_retained_total += gl_retained_total;

        grand_pending_m += gl_pending_m;
        grand_pending_f += gl_pending_f;
        grand_pending_total += gl_pending_total;

        grand_total_m += gl_total_m;
        grand_total_f += gl_total_f;
        grand_total_combined += gl_total_combined;
    }

    // Grand Total Row for Table 1
    lines.push(csv::row(&[
        "SCHOOL GRAND TOTAL".to_string(),
        String::new(),
        grand_promoted_m.to_string(),
        grand_promoted_f.to_string(),
        grand_promoted_total.to_string(),
        grand_conditional_m.to_string(),
        grand_conditional_f.to_string(),
        grand_conditional_total.to_string(),
        grand_retained_m.to_string(),
        grand_retained_f.to_string(),
        grand_retained_total.to_string(),
        grand_pending_m.to_string(),
        grand_pending_f.to_string(),
        grand_pending_total.to_string(),
        grand_total_m.to_string(),
        grand_total_f.to_string(),
        grand_total_combined.to_string(),
    ]));

    lines.push(String::new());

    // 3. Table 2: Level of Proficiency Summary
    lines.push(csv::row(&[
        "TABLE 2: SUMMARY OF LEVEL OF PROFICIENCY BY SECTION AND GRADE LEVEL".to_string(),
    ]));
    lines.push(csv::row(&[
        "Grade Level".to_string(),
        "Section Name".to_string(),
        "Did Not Meet Expectations <75 (M)".to_string(),
        "Did Not Meet Expectations <75 (F)".to_string(),
        "Did Not Meet Expectations <75 (TOTAL)".to_string(),
        "Fairly Satisfactory 75-79 (M)".to_string(),
        "Fairly Satisfactory 75-79 (F)".to_string(),
        "Fairly Satisfactory 75-79 (TOTAL)".to_string(),
        "Satisfactory 80-84 (M)".to_string(),
        "Satisfactory 80-84 (F)".to_string(),
        "Satisfactory 80-84 (TOTAL)".to_string(),
        "Very Satisfactory 85-89 (M)".to_string(),
        "Very Satisfactory 85-89 (F)".to_string(),
        "Very Satisfactory 85-89 (TOTAL)".to_string(),
        "Outstanding 90-100 (M)".to_string(),
        "Outstanding 90-100 (F)".to_string(),
        "Outstanding 90-100 (TOTAL)".to_string(),
        "TOTAL (M)".to_string(),
        "TOTAL (F)".to_string(),
        "TOTAL (COMBINED)".to_string(),
    ]));

    let mut grand_dnm_m = 0;
    let mut grand_dnm_f = 0;
    let mut grand_dnm_tot = 0;

    let mut grand_fs_m = 0;
    let mut grand_fs_f = 0;
    let mut grand_fs_tot = 0;

    let mut grand_s_m = 0;
    let mut grand_s_f = 0;
    let mut grand_s_tot = 0;

    let mut grand_vs_m = 0;
    let mut grand_vs_f = 0;
    let mut grand_vs_tot = 0;

    let mut grand_o_m = 0;
    let mut grand_o_f = 0;
    let mut grand_o_tot = 0;

    for gl in &grade_levels {
        let gl_sections: Vec<&Sf6SectionSummary> =
            sections.iter().filter(|s| s.grade_level == *gl).collect();

        let mut gl_dnm_m = 0;
        let mut gl_dnm_f = 0;
        let mut gl_dnm_tot = 0;

        let mut gl_fs_m = 0;
        let mut gl_fs_f = 0;
        let mut gl_fs_tot = 0;

        let mut gl_s_m = 0;
        let mut gl_s_f = 0;
        let mut gl_s_tot = 0;

        let mut gl_vs_m = 0;
        let mut gl_vs_f = 0;
        let mut gl_vs_tot = 0;

        let mut gl_o_m = 0;
        let mut gl_o_f = 0;
        let mut gl_o_tot = 0;

        let mut gl_tot_m = 0;
        let mut gl_tot_f = 0;
        let mut gl_tot_comb = 0;

        for sec in &gl_sections {
            let dnm_m = sec.summary.did_not_meet_m;
            let dnm_f = sec.summary.did_not_meet_f;
            let dnm_tot = sec.summary.did_not_meet_total;

            let fs_m = sec.summary.fairly_satisfactory_m;
            let fs_f = sec.summary.fairly_satisfactory_f;
            let fs_tot = sec.summary.fairly_satisfactory_total;

            let s_m = sec.summary.satisfactory_m;
            let s_f = sec.summary.satisfactory_f;
            let s_tot = sec.summary.satisfactory_total;

            let vs_m = sec.summary.very_satisfactory_m;
            let vs_f = sec.summary.very_satisfactory_f;
            let vs_tot = sec.summary.very_satisfactory_total;

            let o_m = sec.summary.outstanding_m;
            let o_f = sec.summary.outstanding_f;
            let o_tot = sec.summary.outstanding_total;

            let tot_m = dnm_m + fs_m + s_m + vs_m + o_m;
            let tot_f = dnm_f + fs_f + s_f + vs_f + o_f;
            let tot_comb = dnm_tot + fs_tot + s_tot + vs_tot + o_tot;

            gl_dnm_m += dnm_m;
            gl_dnm_f += dnm_f;
            gl_dnm_tot += dnm_tot;

            gl_fs_m += fs_m;
            gl_fs_f += fs_f;
            gl_fs_tot += fs_tot;

            gl_s_m += s_m;
            gl_s_f += s_f;
            gl_s_tot += s_tot;

            gl_vs_m += vs_m;
            gl_vs_f += vs_f;
            gl_vs_tot += vs_tot;

            gl_o_m += o_m;
            gl_o_f += o_f;
            gl_o_tot += o_tot;

            gl_tot_m += tot_m;
            gl_tot_f += tot_f;
            gl_tot_comb += tot_comb;

            lines.push(csv::row(&[
                sec.grade_level.clone(),
                sec.section_name.clone(),
                dnm_m.to_string(),
                dnm_f.to_string(),
                dnm_tot.to_string(),
                fs_m.to_string(),
                fs_f.to_string(),
                fs_tot.to_string(),
                s_m.to_string(),
                s_f.to_string(),
                s_tot.to_string(),
                vs_m.to_string(),
                vs_f.to_string(),
                vs_tot.to_string(),
                o_m.to_string(),
                o_f.to_string(),
                o_tot.to_string(),
                tot_m.to_string(),
                tot_f.to_string(),
                tot_comb.to_string(),
            ]));
        }

        // Subtotal row for Grade Level in Table 2
        lines.push(csv::row(&[
            format!("TOTAL {}", gl),
            String::new(),
            gl_dnm_m.to_string(),
            gl_dnm_f.to_string(),
            gl_dnm_tot.to_string(),
            gl_fs_m.to_string(),
            gl_fs_f.to_string(),
            gl_fs_tot.to_string(),
            gl_s_m.to_string(),
            gl_s_f.to_string(),
            gl_s_tot.to_string(),
            gl_vs_m.to_string(),
            gl_vs_f.to_string(),
            gl_vs_tot.to_string(),
            gl_o_m.to_string(),
            gl_o_f.to_string(),
            gl_o_tot.to_string(),
            gl_tot_m.to_string(),
            gl_tot_f.to_string(),
            gl_tot_comb.to_string(),
        ]));

        grand_dnm_m += gl_dnm_m;
        grand_dnm_f += gl_dnm_f;
        grand_dnm_tot += gl_dnm_tot;

        grand_fs_m += gl_fs_m;
        grand_fs_f += gl_fs_f;
        grand_fs_tot += gl_fs_tot;

        grand_s_m += gl_s_m;
        grand_s_f += gl_s_f;
        grand_s_tot += gl_s_tot;

        grand_vs_m += gl_vs_m;
        grand_vs_f += gl_vs_f;
        grand_vs_tot += gl_vs_tot;

        grand_o_m += gl_o_m;
        grand_o_f += gl_o_f;
        grand_o_tot += gl_o_tot;
    }

    // Grand Total Row for Table 2
    let grand_prof_tot_m = grand_dnm_m + grand_fs_m + grand_s_m + grand_vs_m + grand_o_m;
    let grand_prof_tot_f = grand_dnm_f + grand_fs_f + grand_s_f + grand_vs_f + grand_o_f;
    let grand_prof_tot_comb =
        grand_dnm_tot + grand_fs_tot + grand_s_tot + grand_vs_tot + grand_o_tot;

    lines.push(csv::row(&[
        "SCHOOL GRAND TOTAL".to_string(),
        String::new(),
        grand_dnm_m.to_string(),
        grand_dnm_f.to_string(),
        grand_dnm_tot.to_string(),
        grand_fs_m.to_string(),
        grand_fs_f.to_string(),
        grand_fs_tot.to_string(),
        grand_s_m.to_string(),
        grand_s_f.to_string(),
        grand_s_tot.to_string(),
        grand_vs_m.to_string(),
        grand_vs_f.to_string(),
        grand_vs_tot.to_string(),
        grand_o_m.to_string(),
        grand_o_f.to_string(),
        grand_o_tot.to_string(),
        grand_prof_tot_m.to_string(),
        grand_prof_tot_f.to_string(),
        grand_prof_tot_comb.to_string(),
    ]));

    lines.push(String::new());

    // 4. Structured Field Disclosures
    let disc = disclosure();
    lines.push(csv::row(&["# FIELD DISCLOSURE".to_string()]));
    lines.push(csv::row(&["# Populated Fields:".to_string()]));
    for f in &disc.populated_fields {
        lines.push(csv::row(&["#   -".to_string(), f.clone()]));
    }
    lines.push(csv::row(&["# Omitted Fields & Limitations:".to_string()]));
    for o in &disc.omitted_fields {
        lines.push(csv::row(&[
            "#   -".to_string(),
            o.field.clone(),
            format!("(Reason: {})", o.reason),
        ]));
    }

    Sf6Export {
        csv: lines.join("\n"),
        disclosure: disc,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_school() -> School {
        School {
            id: "SCH-1001".to_string(),
            name: "Mabini Central Elementary School".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_build_sf6_export_empty_sections() {
        let school = dummy_school();
        let export = build_sf6_export(&school, "2025-2026", &[]);

        assert!(export.csv.contains("School Form 6 (SF6)"));
        assert!(export.csv.contains("Mabini Central Elementary School"));
        assert!(export.csv.contains("SCH-1001"));
        assert!(export.csv.contains("2025-2026"));
        assert!(export
            .csv
            .contains("SCHOOL GRAND TOTAL,,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"));
        assert_eq!(export.disclosure.populated_fields.len(), 6);
        assert_eq!(export.disclosure.omitted_fields.len(), 3);
    }

    #[test]
    fn test_build_sf6_export_aggregation_multi_grade_sections() {
        let school = dummy_school();

        let s1 = Sf6SectionSummary {
            section_id: "sec-1".to_string(),
            section_name: "Diamond".to_string(),
            grade_level: "Grade 7".to_string(),
            summary: ProficiencySummary {
                promoted_m: 10,
                promoted_f: 12,
                promoted_total: 22,
                conditional_m: 1,
                conditional_f: 0,
                conditional_total: 1,
                retained_m: 0,
                retained_f: 1,
                retained_total: 1,
                pending_m: 0,
                pending_f: 0,
                pending_total: 0,
                outstanding_m: 3,
                outstanding_f: 5,
                outstanding_total: 8,
                very_satisfactory_m: 5,
                very_satisfactory_f: 5,
                very_satisfactory_total: 10,
                satisfactory_m: 2,
                satisfactory_f: 2,
                satisfactory_total: 4,
                fairly_satisfactory_m: 1,
                fairly_satisfactory_f: 0,
                fairly_satisfactory_total: 1,
                did_not_meet_m: 0,
                did_not_meet_f: 1,
                did_not_meet_total: 1,
            },
        };

        let s2 = Sf6SectionSummary {
            section_id: "sec-2".to_string(),
            section_name: "Emerald".to_string(),
            grade_level: "Grade 7".to_string(),
            summary: ProficiencySummary {
                promoted_m: 8,
                promoted_f: 10,
                promoted_total: 18,
                conditional_m: 0,
                conditional_f: 0,
                conditional_total: 0,
                retained_m: 1,
                retained_f: 0,
                retained_total: 1,
                pending_m: 0,
                pending_f: 0,
                pending_total: 0,
                outstanding_m: 2,
                outstanding_f: 4,
                outstanding_total: 6,
                very_satisfactory_m: 4,
                very_satisfactory_f: 4,
                very_satisfactory_total: 8,
                satisfactory_m: 2,
                satisfactory_f: 2,
                satisfactory_total: 4,
                fairly_satisfactory_m: 0,
                fairly_satisfactory_f: 0,
                fairly_satisfactory_total: 0,
                did_not_meet_m: 1,
                did_not_meet_f: 0,
                did_not_meet_total: 1,
            },
        };

        let s3 = Sf6SectionSummary {
            section_id: "sec-3".to_string(),
            section_name: "Ruby".to_string(),
            grade_level: "Grade 8".to_string(),
            summary: ProficiencySummary {
                promoted_m: 15,
                promoted_f: 15,
                promoted_total: 30,
                conditional_m: 0,
                conditional_f: 0,
                conditional_total: 0,
                retained_m: 0,
                retained_f: 0,
                retained_total: 0,
                pending_m: 0,
                pending_f: 0,
                pending_total: 0,
                outstanding_m: 5,
                outstanding_f: 5,
                outstanding_total: 10,
                very_satisfactory_m: 6,
                very_satisfactory_f: 6,
                very_satisfactory_total: 12,
                satisfactory_m: 4,
                satisfactory_f: 4,
                satisfactory_total: 8,
                fairly_satisfactory_m: 0,
                fairly_satisfactory_f: 0,
                fairly_satisfactory_total: 0,
                did_not_meet_m: 0,
                did_not_meet_f: 0,
                did_not_meet_total: 0,
            },
        };

        let export = build_sf6_export(&school, "2025-2026", &[s1, s2, s3]);

        // Verify Grade 7 subtotal in Table 1:
        // Promoted M: 10 + 8 = 18, F: 12 + 10 = 22, Tot: 40
        // Conditional M: 1 + 0 = 1, F: 0, Tot: 1
        // Retained M: 0 + 1 = 1, F: 1 + 0 = 1, Tot: 2
        // Tot M: 20, F: 23, Tot Comb: 43
        assert!(export
            .csv
            .contains("TOTAL Grade 7,,18,22,40,1,0,1,1,1,2,0,0,0,20,23,43"));

        // Verify Grade 8 subtotal in Table 1:
        // Promoted M: 15, F: 15, Tot: 30
        assert!(export
            .csv
            .contains("TOTAL Grade 8,,15,15,30,0,0,0,0,0,0,0,0,0,15,15,30"));

        // Verify School Grand Total in Table 1:
        // Promoted M: 18 + 15 = 33, F: 22 + 15 = 37, Tot: 70
        // Conditional M: 1, F: 0, Tot: 1
        // Retained M: 1, F: 1, Tot: 2
        // Tot M: 35, F: 38, Tot: 73
        assert!(export
            .csv
            .contains("SCHOOL GRAND TOTAL,,33,37,70,1,0,1,1,1,2,0,0,0,35,38,73"));

        // Verify Table 2 is rendered with section rows and grand total
        assert!(export
            .csv
            .contains("TABLE 2: SUMMARY OF LEVEL OF PROFICIENCY BY SECTION AND GRADE LEVEL"));
        assert!(export
            .csv
            .contains("Grade 7,Diamond,0,1,1,1,0,1,2,2,4,5,5,10,3,5,8,11,13,24"));
    }

    #[test]
    fn pending_learners_are_visible_and_included_in_sf6_totals() {
        let school = dummy_school();
        let section = Sf6SectionSummary {
            section_id: "sec-pending".to_string(),
            section_name: "Mabini".to_string(),
            grade_level: "Grade 7".to_string(),
            summary: ProficiencySummary {
                pending_m: 1,
                pending_f: 2,
                pending_total: 3,
                ..ProficiencySummary::default()
            },
        };

        let export = build_sf6_export(&school, "2025-2026", &[section]);

        assert!(export.csv.contains("PENDING / INCOMPLETE (TOTAL)"));
        assert!(export
            .csv
            .contains("Grade 7,Mabini,0,0,0,0,0,0,0,0,0,1,2,3,1,2,3"));
        assert!(export
            .csv
            .contains("SCHOOL GRAND TOTAL,,0,0,0,0,0,0,0,0,0,1,2,3,1,2,3"));
    }
}
