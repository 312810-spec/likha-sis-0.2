//! Official-form template **applicability resolution** — Wave 2M. See
//! `docs/adr/0053-sf10-template-applicability-and-versioning.md`.
//!
//! `formgen::template::TemplateDescriptor` answers "which exact bytes,
//! what structural shape" and `formgen::evidence::TemplateEvidence`
//! answers "where did it come from, is our output verified". This
//! module answers a THIRD, compliance-critical question those two do
//! not: **given a record's own context (form, school year, grade level,
//! curriculum, track), which template version was AUTHORITATIVE for
//! that context** — not simply the newest one installed.
//!
//! The governing principle (Wave 2M directive, non-negotiable):
//!
//! > Official-form generation must select the template that was
//! > authoritative for the record's applicable period/context. It must
//! > never silently fall back to the newest template for
//! > compliance-sensitive output.
//!
//! Evidence for this: DepEd's own SF10 has had multiple generations
//! within this project's lifetime — DepEd Order No. 4, s. 2014
//! (modified school forms) → DepEd Order No. 69, s. 2016 (ECR + Form
//! 137 for SHS) → the MATATAG revision (2025) → DepEd Memorandum No.
//! 020, s. 2026 (Strengthened SHS SF10). A learner who finished Grade
//! 10 in SY 2022-2023 has a JHS record that must stay rendered on the
//! template of its own era, not rewritten onto whatever is current.
//!
//! Scope (Wave 2M step 12): this module is the centralized resolver
//! only. It does not generate or import SF10, has no Tauri command, no
//! UI, no database, and no migration. It is the seam that later SF10
//! generation work plugs into instead of scattering `school_year <
//! "2025"` checks through form-generation code.

use crate::formgen::evidence::{FidelityState, ProvenanceState, TemplateEvidence};
use crate::formgen::template::TemplateDescriptor;

/// The context of the record a form is being produced for. Every field
/// is the record's OWN applicable context, never "today".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FormContext {
    pub form_type: &'static str,
    /// `"YYYY-YYYY"`, the school year the record's content belongs to
    /// (for a multi-year form like SF10, the year of the specific
    /// segment being rendered).
    pub school_year: &'static str,
    /// `"7"`..`"12"` (or `"K"`, `"1"`..`"6"`). Compared as an exact
    /// string against a template version's `grade_levels`.
    pub grade_level: &'static str,
    /// Curriculum label the record was taught under, e.g. `"K to 12"`,
    /// `"MATATAG"`, `"Strengthened SHS"`. Matched case-sensitively
    /// against a version's `curriculum`.
    pub curriculum: &'static str,
    /// `Some("Academic")` / `Some("TechPro")` for SHS records that need
    /// it; `None` for JHS/elementary or where a form does not split by
    /// track.
    pub track: Option<&'static str>,
}

/// The period/scope a single template version was authoritative for.
/// Mirrors how DepEd issuances are actually scoped (a form, a
/// curriculum, a grade band, a school-year range, sometimes a track).
#[derive(Debug, Clone, Copy)]
pub struct TemplateApplicability {
    pub form_type: &'static str,
    /// Inclusive lower bound, `"YYYY-YYYY"`. `""` means "no lower
    /// bound recorded" (open at the start).
    pub effective_from_school_year: &'static str,
    /// Inclusive upper bound, `"YYYY-YYYY"`. `None` means "still
    /// current" (open at the end).
    pub effective_to_school_year: Option<&'static str>,
    pub grade_levels: &'static [&'static str],
    /// Curriculum label the record was taught under. A plain string,
    /// deliberately NOT a foreign key to `repository::curriculum`'s
    /// seeded `curriculum_versions` — this module is pure domain with
    /// no database. The strings must match the `FormContext.curriculum`
    /// a caller passes; a future SF10 generation path is responsible
    /// for mapping a stored `CurriculumVersion` (e.g. "MATATAG
    /// Curriculum") to the label used here ("MATATAG"). ADR-0053
    /// records this seam.
    pub curriculum: &'static str,
    /// `None` = applies regardless of track; `Some(_)` = track-specific.
    pub track: Option<&'static str>,
}

impl TemplateApplicability {
    /// Whether this version was authoritative for `ctx`. A school-year
    /// string `"YYYY-YYYY"` orders correctly under plain `str`
    /// comparison for any years in the same millennium, which is all
    /// this project will ever see.
    fn covers(&self, ctx: &FormContext) -> bool {
        if self.form_type != ctx.form_type || self.curriculum != ctx.curriculum {
            return false;
        }
        if !self.grade_levels.contains(&ctx.grade_level) {
            return false;
        }
        match (self.track, ctx.track) {
            (Some(t), Some(c)) if t != c => return false,
            (Some(_), None) => return false,
            _ => {}
        }
        if !self.effective_from_school_year.is_empty()
            && ctx.school_year < self.effective_from_school_year
        {
            return false;
        }
        if let Some(to) = self.effective_to_school_year {
            if ctx.school_year > to {
                return false;
            }
        }
        true
    }
}

/// One resolvable template version: its identity, the (optional — SF10
/// has none yet) byte/structure descriptor, its provenance/fidelity
/// evidence, and the context it was authoritative for.
///
/// Supersession is NOT modeled here — `TemplateEvidence` already
/// carries `supersedes`/`superseded_by`, and `resolve` refuses a
/// `Superseded` provenance outright. A version whose effective range
/// has ended simply stops matching new contexts via `covers()`.
#[derive(Debug, Clone, Copy)]
pub struct TemplateVersion {
    pub id: &'static str,
    pub descriptor: Option<&'static TemplateDescriptor>,
    pub evidence: &'static TemplateEvidence,
    pub applicability: TemplateApplicability,
}

/// Why a template version could not be resolved. The resolver returns
/// one of these rather than ever guessing — a wrong SF10 template is a
/// compliance defect, an explicit failure is not.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveError {
    /// No registered version was authoritative for this context.
    NoApplicableTemplate,
    /// More than one registered version claims this context — an
    /// authoring error in the registry, surfaced instead of
    /// arbitrarily picking one.
    AmbiguousTemplates(Vec<&'static str>),
    /// A single version matched, but the caller required at least
    /// `FidelityState::StructureVerified` and this version's evidence
    /// does not meet it. Carries the matched id and its current state.
    FidelityInsufficient {
        id: &'static str,
        have: FidelityState,
    },
    /// A single version matched but its provenance is `Rejected`,
    /// `Superseded`, or `Synthetic` — not usable as an authoritative
    /// source even though its applicability window covers the context.
    ProvenanceUnusable {
        id: &'static str,
        state: ProvenanceState,
    },
}

/// Resolve the template version authoritative for `ctx` from
/// `registry`. `require_verified_fidelity` gates on evidence: pass
/// `false` while SF10 generation is still being built against
/// candidates, `true` for anything a teacher would treat as an
/// official output.
///
/// Never returns a "closest" or "newest" match on failure.
pub fn resolve<'a>(
    registry: &'a [TemplateVersion],
    ctx: &FormContext,
    require_verified_fidelity: bool,
) -> Result<&'a TemplateVersion, ResolveError> {
    let matches: Vec<&TemplateVersion> = registry
        .iter()
        .filter(|v| v.applicability.covers(ctx))
        .collect();

    match matches.as_slice() {
        [] => Err(ResolveError::NoApplicableTemplate),
        [only] => {
            match only.evidence.provenance {
                // `Synthetic` is refused for the same reason `Rejected`/
                // `Superseded` are: a project-authored fixture is never
                // authoritative for a real record's context, even if its
                // applicability window happens to cover it. (There are no
                // `Synthetic` SF10 versions today; this guards a future
                // architecture-readiness fixture from leaking into a
                // compliance-sensitive resolution.)
                ProvenanceState::Rejected
                | ProvenanceState::Superseded
                | ProvenanceState::Synthetic => {
                    return Err(ResolveError::ProvenanceUnusable {
                        id: only.id,
                        state: only.evidence.provenance,
                    });
                }
                ProvenanceState::CandidateUnverified
                | ProvenanceState::AuthoritativeSourceConfirmed => {}
            }
            if require_verified_fidelity && only.evidence.fidelity == FidelityState::NotVerified {
                return Err(ResolveError::FidelityInsufficient {
                    id: only.id,
                    have: only.evidence.fidelity,
                });
            }
            Ok(only)
        }
        many => Err(ResolveError::AmbiguousTemplates(
            many.iter().map(|v| v.id).collect(),
        )),
    }
}

/// The SF10 template versions this project can currently reason about.
///
/// - `sf10-sshs-v2026`: provenance **`AuthoritativeSourceConfirmed`**
///   (Wave 2N — DepEd Memorandum No. 020, s. 2026 para. 5(b) names the
///   exact file; fidelity still `NotVerified`).
/// - `sf10-jhs-matatag-candidate`: **still `CandidateUnverified`** —
///   EVIDENCE BLOCKED (community-touched file, national Joint
///   Memorandum PDF not obtained). Applicability is an evidence-based
///   lead, deliberately narrowed to Grade 7 (see below).
///
/// See ADR-0053 (+ its Wave 2N addendum) and
/// `docs/form-evidence/sf10/README.md`.
pub const SF10_TEMPLATE_VERSIONS: &[TemplateVersion] = &[
    TemplateVersion {
        id: "sf10-jhs-matatag-candidate",
        descriptor: None,
        evidence: &crate::formgen::evidence::SF10_JHS_CANDIDATE_EVIDENCE,
        applicability: TemplateApplicability {
            form_type: "SF10",
            effective_from_school_year: "2024-2025",
            effective_to_school_year: None,
            // MATATAG phases in per grade (DepEd Order No. 010, s. 2024):
            // Grade 7 from SY 2024-2025, higher JHS grades in successive
            // years. Modeled as Grade 7 only until the per-grade Annexes
            // (I/II/III) of the governing Joint Memorandum are obtained —
            // an under-claim is safe (resolver fails closed for the
            // grades it cannot yet vouch for); an over-claim is not.
            grade_levels: &["7"],
            curriculum: "MATATAG",
            track: None,
        },
    },
    TemplateVersion {
        id: "sf10-sshs-v2026",
        descriptor: None,
        evidence: &crate::formgen::evidence::SF10_SSHS_V2026_EVIDENCE,
        applicability: TemplateApplicability {
            form_type: "SF10",
            effective_from_school_year: "2025-2026",
            effective_to_school_year: None,
            grade_levels: &["11", "12"],
            curriculum: "Strengthened SHS",
            // DM 020 s. 2026 (readable page) describes ONE "School Form 10
            // for Strengthened Senior High School" and para. 5 lists a
            // single SF10 filename — no per-track file. Track is NOT a
            // template-selection axis on current evidence; if Academic vs
            // TechPro matters it is workbook content, not template
            // identity. `None` is evidence-backed, not a placeholder.
            track: None,
        },
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_the_confirmed_sshs_v2026_for_a_strengthened_shs_grade_11_context() {
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2025-2026",
            grade_level: "11",
            curriculum: "Strengthened SHS",
            track: None,
        };
        // Wave 2N: provenance is now confirmed, so a non-fidelity-gated
        // caller gets the version back.
        let v = resolve(SF10_TEMPLATE_VERSIONS, &ctx, false).unwrap();
        assert_eq!(v.id, "sf10-sshs-v2026");
        assert_eq!(
            v.evidence.provenance,
            ProvenanceState::AuthoritativeSourceConfirmed
        );
    }

    #[test]
    fn resolves_the_jhs_candidate_for_a_matatag_grade_7_context() {
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2025-2026",
            grade_level: "7",
            curriculum: "MATATAG",
            track: None,
        };
        let v = resolve(SF10_TEMPLATE_VERSIONS, &ctx, false).unwrap();
        assert_eq!(v.id, "sf10-jhs-matatag-candidate");
        assert_eq!(v.evidence.provenance, ProvenanceState::CandidateUnverified);
    }

    #[test]
    fn a_matatag_grade_9_context_does_not_yet_resolve_only_grade_7_is_modeled() {
        // The JHS band is deliberately narrowed to Grade 7 until the
        // per-grade Annexes are obtained — Grades 8-10 fail closed.
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2026-2027",
            grade_level: "9",
            curriculum: "MATATAG",
            track: None,
        };
        assert!(matches!(
            resolve(SF10_TEMPLATE_VERSIONS, &ctx, false),
            Err(ResolveError::NoApplicableTemplate)
        ));
    }

    #[test]
    fn a_pre_matatag_jhs_context_resolves_to_nothing_rather_than_the_newest_template() {
        // A learner who finished Grade 10 under K to 12 in SY 2020-2021:
        // this project has NO registered template for that era. The
        // resolver must say so, not hand back the MATATAG or SSHS file.
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2020-2021",
            grade_level: "10",
            curriculum: "K to 12",
            track: None,
        };
        assert!(matches!(
            resolve(SF10_TEMPLATE_VERSIONS, &ctx, false),
            Err(ResolveError::NoApplicableTemplate)
        ));
    }

    #[test]
    fn a_grade_11_matatag_context_does_not_match_the_jhs_grade_band() {
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2025-2026",
            grade_level: "11",
            curriculum: "MATATAG",
            track: None,
        };
        assert!(matches!(
            resolve(SF10_TEMPLATE_VERSIONS, &ctx, false),
            Err(ResolveError::NoApplicableTemplate)
        ));
    }

    #[test]
    fn requiring_verified_fidelity_rejects_a_candidate_whose_output_is_unverified() {
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2025-2026",
            grade_level: "11",
            curriculum: "Strengthened SHS",
            track: None,
        };
        match resolve(SF10_TEMPLATE_VERSIONS, &ctx, true) {
            Err(ResolveError::FidelityInsufficient { id, have }) => {
                // Provenance is confirmed but fidelity is not — the
                // Provenance != Fidelity invariant, enforced at resolve.
                assert_eq!(id, "sf10-sshs-v2026");
                assert_eq!(have, FidelityState::NotVerified);
            }
            other => panic!("expected FidelityInsufficient, got {other:?}"),
        }
    }

    #[test]
    fn ambiguous_overlap_is_reported_not_silently_resolved() {
        // Two versions covering the same context is a registry authoring
        // bug; the resolver surfaces it instead of picking one.
        static A: TemplateEvidence = crate::formgen::evidence::SF10_JHS_CANDIDATE_EVIDENCE;
        let overlap: &[TemplateVersion] = &[
            TemplateVersion {
                id: "dup-a",
                descriptor: None,
                evidence: &A,
                applicability: TemplateApplicability {
                    form_type: "SF10",
                    effective_from_school_year: "2024-2025",
                    effective_to_school_year: None,
                    grade_levels: &["9"],
                    curriculum: "MATATAG",
                    track: None,
                },
            },
            TemplateVersion {
                id: "dup-b",
                descriptor: None,
                evidence: &A,
                applicability: TemplateApplicability {
                    form_type: "SF10",
                    effective_from_school_year: "",
                    effective_to_school_year: None,
                    grade_levels: &["9"],
                    curriculum: "MATATAG",
                    track: None,
                },
            },
        ];
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2025-2026",
            grade_level: "9",
            curriculum: "MATATAG",
            track: None,
        };
        match resolve(overlap, &ctx, false) {
            Err(ResolveError::AmbiguousTemplates(ids)) => {
                assert_eq!(ids.len(), 2);
                assert!(ids.contains(&"dup-a") && ids.contains(&"dup-b"));
            }
            other => panic!("expected AmbiguousTemplates, got {other:?}"),
        }
    }

    #[test]
    fn a_superseded_version_is_refused_even_inside_its_own_window() {
        static SUP: TemplateEvidence = TemplateEvidence {
            provenance: ProvenanceState::Superseded,
            ..crate::formgen::evidence::SF10_JHS_CANDIDATE_EVIDENCE
        };
        let reg: &[TemplateVersion] = &[TemplateVersion {
            id: "old",
            descriptor: None,
            evidence: &SUP,
            applicability: TemplateApplicability {
                form_type: "SF10",
                effective_from_school_year: "",
                effective_to_school_year: None,
                grade_levels: &["9"],
                curriculum: "MATATAG",
                track: None,
            },
        }];
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2024-2025",
            grade_level: "9",
            curriculum: "MATATAG",
            track: None,
        };
        match resolve(reg, &ctx, false) {
            Err(ResolveError::ProvenanceUnusable { id, state }) => {
                assert_eq!(id, "old");
                assert_eq!(state, ProvenanceState::Superseded);
            }
            other => panic!("expected ProvenanceUnusable, got {other:?}"),
        }
    }

    #[test]
    fn a_synthetic_fixture_is_never_resolved_as_authoritative_for_a_real_context() {
        static SYN: TemplateEvidence = crate::formgen::evidence::SF1_SYNTHETIC_V1_EVIDENCE;
        let reg: &[TemplateVersion] = &[TemplateVersion {
            id: "syn",
            descriptor: None,
            evidence: &SYN,
            applicability: TemplateApplicability {
                form_type: "SF10",
                effective_from_school_year: "",
                effective_to_school_year: None,
                grade_levels: &["9"],
                curriculum: "MATATAG",
                track: None,
            },
        }];
        let ctx = FormContext {
            form_type: "SF10",
            school_year: "2024-2025",
            grade_level: "9",
            curriculum: "MATATAG",
            track: None,
        };
        match resolve(reg, &ctx, false) {
            Err(ResolveError::ProvenanceUnusable { id, state }) => {
                assert_eq!(id, "syn");
                assert_eq!(state, ProvenanceState::Synthetic);
            }
            other => panic!("expected ProvenanceUnusable, got {other:?}"),
        }
    }

    #[test]
    fn no_registered_sf10_version_claims_verified_fidelity() {
        // Wave 2N promoted the SSHS provenance; NOTHING has established
        // render fidelity for any SF10 (no generator exists). Every
        // registered version must still be `NotVerified` on the fidelity
        // axis regardless of its provenance.
        for v in SF10_TEMPLATE_VERSIONS {
            assert_eq!(v.evidence.form_type, "SF10");
            assert_eq!(
                v.evidence.fidelity,
                FidelityState::NotVerified,
                "{} must not claim verified fidelity — no SF10 generator exists",
                v.id
            );
        }
    }

    #[test]
    fn exactly_the_sshs_v2026_version_is_provenance_confirmed_the_jhs_one_is_not() {
        let by_id = |id: &str| SF10_TEMPLATE_VERSIONS.iter().find(|v| v.id == id).unwrap();
        assert_eq!(
            by_id("sf10-sshs-v2026").evidence.provenance,
            ProvenanceState::AuthoritativeSourceConfirmed
        );
        assert_eq!(
            by_id("sf10-jhs-matatag-candidate").evidence.provenance,
            ProvenanceState::CandidateUnverified
        );
    }

    #[test]
    fn every_confirmed_registry_entry_would_pass_the_promotion_guard() {
        // Registry-wide invariant (not just the SSHS record): any version
        // stored as `AuthoritativeSourceConfirmed` must carry a citation
        // that `confirm_authoritative_source` itself would accept from the
        // pre-promotion state. Catches a hand-edited const that flips
        // provenance without a real issuance — `resolve` reads
        // `.provenance` directly and never re-validates.
        use crate::formgen::evidence::confirm_authoritative_source;
        for v in SF10_TEMPLATE_VERSIONS {
            if v.evidence.provenance == ProvenanceState::AuthoritativeSourceConfirmed {
                let citation = v.evidence.authoritative_issuance;
                assert!(
                    citation.is_some(),
                    "{} is AuthoritativeSourceConfirmed but records no issuance citation",
                    v.id
                );
                let produced =
                    confirm_authoritative_source(ProvenanceState::CandidateUnverified, citation)
                        .unwrap_or_else(|e| {
                            panic!(
                                "{}'s citation would not satisfy the promotion guard: {e}",
                                v.id
                            )
                        });
                assert_eq!(produced, ProvenanceState::AuthoritativeSourceConfirmed);
            }
        }
    }
}
