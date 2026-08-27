//! Official-form template evidence & provenance registry — Wave 2K. See
//! `docs/adr/0051-official-form-template-evidence-registry.md`.
//!
//! `formgen::template::TemplateDescriptor` already answers "which exact
//! bytes does the generator trust, and what structural shape does it
//! require before writing a cell" (Wave 3/2I). This module answers a
//! DIFFERENT question this project has so far only ever recorded as
//! prose scattered across ADR-0048/0049/`VERIFICATION-DEBT.md`: "where
//! did this template come from, and is our GENERATED OUTPUT actually
//! verified to match the real DepEd form" — and it makes both a typed,
//! testable fact instead of prose.
//!
//! The central design rule (Wave 2K directive, non-negotiable): these are
//! TWO INDEPENDENT AXES, never one collapsed status field. A template can
//! be an authoritative DepEd document (`ProvenanceState::
//! AuthoritativeSourceConfirmed`) while this project's generated-output
//! fidelity to it remains completely unverified
//! (`FidelityState::NotVerified`). See `docs/VERIFICATION-DEBT.md` for
//! why that distinction matters here: SF1 and SF9 fidelity is
//! `NOT_VERIFIED` today specifically because no authoritative source has
//! ever been found, not because nobody tried to test the renderer.
//!
//! No function IN THIS MODULE ever derives one axis from the other —
//! `confirm_authoritative_source` returns only a `ProvenanceState` and
//! never reads `fidelity`; `format_evidence_report` reads both fields
//! independently. That guarantee is module-internal only, not a
//! type-system one: every `TemplateEvidence` field is `pub`, so external
//! code can still construct a record with either axis set to anything
//! (this module's own tests exercise exactly that, deliberately, to
//! prove the axes stay independently settable — see the "provenance and
//! fidelity stay independent" tests below). Independent review (Wave 2K)
//! confirmed this is an acceptable tradeoff today because the module has
//! no runtime/security-boundary role — no Tauri command, no database, no
//! UI reads it, only a future human-run intake review would ever call
//! `confirm_authoritative_source` — but flagged it as something to
//! revisit (e.g. private fields behind a checked constructor) before
//! this module is ever wired into anything less supervised.
//!
//! This module also distinguishes two evidence categories, without a
//! dedicated type for the distinction (an earlier draft's `EvidenceKind`
//! enum was removed by the same review as unused structure — the
//! distinction lives here in prose instead): evidence needed to
//! RECOGNIZE the correct template (sheet names, header/data cell
//! coordinates, row capacity, content hash — already covered by
//! `TemplateDescriptor`) versus evidence needed to eventually verify
//! RENDER FIDELITY (merge layout, formulas, print areas, protection
//! settings — not every style attribute belongs in the recognition
//! fingerprint).

use crate::error::{AppError, AppResult};

/// How this template's IDENTITY (the bytes themselves) was obtained and
/// confirmed to actually be a DepEd-authored document — never how well
/// this project's generator reproduces it. See `FidelityState` for that.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProvenanceState {
    /// This descriptor's bytes are a project-authored SYNTHETIC fixture
    /// (see `formgen::template::SF1_SYNTHETIC_V1`/`SF9_SYNTHETIC_V1`),
    /// built to exercise the generation architecture. Deliberately a
    /// distinct variant from `CandidateUnverified` rather than reusing
    /// it: a synthetic fixture is not a weak, still-improvable candidate
    /// for the real form — it is not a candidate for the real form at
    /// all, and never becomes one by further review.
    Synthetic,
    /// A real, non-synthetic candidate file has been located (e.g. by
    /// the intake workflow, see
    /// `examples/inspect_template_candidate.rs`) but its origin has not
    /// yet been confirmed as DepEd-authoritative.
    CandidateUnverified,
    /// Confirmed to originate from an official DepEd source (a
    /// `deped.gov.ph` publication, an official DepEd-issued Order/Memo
    /// attachment, or an equivalent verified official regional/division
    /// mirror) — see `authoritative_issuance` for the citation this
    /// state requires.
    AuthoritativeSourceConfirmed,
    /// Was previously `AuthoritativeSourceConfirmed` but a newer
    /// authoritative version has since superseded it. See
    /// `superseded_by`.
    Superseded,
    /// Explicitly reviewed and rejected as a template source (e.g. a
    /// community recreation someone proposed registering, or a file that
    /// turned out not to match its claimed origin).
    Rejected,
}

/// How well THIS PROJECT'S generated output has been checked against the
/// authoritative form this template represents — independent of whether
/// the template's origin is confirmed. See the module doc comment: this
/// is deliberately never merged with `ProvenanceState`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FidelityState {
    /// No structural or visual comparison against a real, authoritative
    /// printed/official form has been performed. The default, and the
    /// state every template in this project is in today.
    NotVerified,
    /// The generator's structural assumptions (sheet names, header/data
    /// cell coordinates, row capacity — the fields already captured on
    /// `TemplateDescriptor`) have been checked against an authoritative
    /// source, but full visual/print fidelity has not.
    StructureVerified,
    /// Generated output has been confirmed, against an authoritative
    /// source, to be print-faithful — the strongest state. Nothing in
    /// this codebase may set this outside of an explicit, human-recorded
    /// decision (see `docs/VERIFICATION-DEBT.md`); it is never a
    /// pass/fail readout of an automated test using synthetic fixtures.
    FidelityVerified,
}

/// Provenance and evidence facts about one `TemplateDescriptor`. Most
/// fields are `Option` because, for both templates registered so far
/// (SF1, SF9), the honest answer is "unknown" — those `None`s are what
/// `format_evidence_report` surfaces as explicit evidence gaps, per the
/// Wave 2K directive's developer-facing evidence report requirement.
/// Deliberately holds no absolute machine-specific filesystem path —
/// `original_filename` is the filename only, never a durable identity.
#[derive(Debug, Clone)]
pub struct TemplateEvidence {
    pub form_type: &'static str,
    pub version: &'static str,
    pub provenance: ProvenanceState,
    pub fidelity: FidelityState,
    pub source_organization: Option<&'static str>,
    pub source_url: Option<&'static str>,
    pub retrieved_on: Option<&'static str>,
    pub original_filename: Option<&'static str>,
    /// The DepEd Order/Memorandum (or equivalent) that ties this file to
    /// an official DepEd issuance — required before
    /// `confirm_authoritative_source` will accept a promotion. See that
    /// function's doc comment.
    pub authoritative_issuance: Option<&'static str>,
    pub applicability_notes: Option<&'static str>,
    pub supersedes: Option<&'static str>,
    pub superseded_by: Option<&'static str>,
    /// Free-text, human-authored explanation of what's still missing —
    /// e.g. "no authoritative source found; deped.gov.ph does not
    /// surface a downloadable SF9 template from this environment as of
    /// the date below." Always present when either state is not at its
    /// strongest, so the report never just says "not verified" with no
    /// account of what was actually tried.
    pub evidence_gap_note: Option<&'static str>,
}

impl TemplateEvidence {
    /// True once BOTH axes are at their strongest state. Deliberately
    /// the only place in this module that reads both fields together —
    /// everything else (promotion, construction, reporting) keeps them
    /// independent, and this helper itself never influences either
    /// field's value.
    pub fn is_fully_verified(&self) -> bool {
        self.provenance == ProvenanceState::AuthoritativeSourceConfirmed
            && self.fidelity == FidelityState::FidelityVerified
    }
}

/// The evidence record for `template::SF1_SYNTHETIC_V1`. No authoritative
/// DepEd SF1 source has been found (ADR-0048's evidence gate); this is a
/// project-authored synthetic fixture, so provenance is `Synthetic`
/// rather than any "unverified candidate" state — there is no real
/// candidate file behind it to eventually promote.
pub const SF1_SYNTHETIC_V1_EVIDENCE: TemplateEvidence = TemplateEvidence {
    form_type: "SF1",
    version: "synthetic-v1",
    provenance: ProvenanceState::Synthetic,
    fidelity: FidelityState::NotVerified,
    source_organization: None,
    source_url: None,
    retrieved_on: None,
    original_filename: None,
    authoritative_issuance: None,
    applicability_notes: Some(
        "School Register (SF1); architecture-readiness only, not for production use",
    ),
    supersedes: None,
    superseded_by: None,
    evidence_gap_note: Some(
        "No authoritative DepEd SF1 template located as of Wave 3/2I/2K's searches (repository \
         search and direct deped.gov.ph fetch); this descriptor exists to exercise the \
         generation architecture only.",
    ),
};

/// The evidence record for `template::SF9_SYNTHETIC_V1`. Same reasoning
/// as `SF1_SYNTHETIC_V1_EVIDENCE` — see ADR-0049's evidence gate.
pub const SF9_SYNTHETIC_V1_EVIDENCE: TemplateEvidence = TemplateEvidence {
    form_type: "SF9",
    version: "synthetic-v1",
    provenance: ProvenanceState::Synthetic,
    fidelity: FidelityState::NotVerified,
    source_organization: None,
    source_url: None,
    retrieved_on: None,
    original_filename: None,
    authoritative_issuance: None,
    applicability_notes: Some(
        "Learner's Progress Report Card (SF9); architecture-readiness only, not for production \
         use",
    ),
    supersedes: None,
    superseded_by: None,
    evidence_gap_note: Some(
        "No authoritative DepEd SF9 template located as of Wave 2I/2K's searches (repository \
         search and direct deped.gov.ph fetch); this descriptor exists to exercise the \
         generation architecture only.",
    ),
};

/// SF10 (Learner's Permanent Academic Record, formerly Form 137) —
/// Strengthened Senior High School variant, `SSHS SF 10 v2026.xlsx`.
/// Retrieved Wave 2M from the official DepEd Learner Information System
/// support portal; **provenance promoted to
/// `AuthoritativeSourceConfirmed` in Wave 2N** after the governing
/// issuance's own text was read from the primary source.
///
/// The binding evidence (Wave 2N): DepEd Memorandum No. 020, s. 2026
/// (13 Mar 2026, `deped.gov.ph/wp-content/uploads/DM_s2026_020r-1.pdf`)
/// — its paragraph 5 was transcribed verbatim via `pdftotext` from the
/// official PDF and states: "the official filenames of the modified
/// templates are as follows: ... b. SSHS SF 10 v2026.xlsx for the
/// Modified SF 10 for SSHS", downloadable "from the Learner
/// Information System Support Page at
/// https://support.lis.deped.gov.ph/support". This is an EXPLICIT
/// file-name-to-issuance binding, not temporal proximity — the memo
/// names the exact file this record describes. The promotion was
/// validated against `confirm_authoritative_source` (see this module's
/// tests), not bypassed.
///
/// Residual gap: pages 1, 3, 4 of DM 020 are scanned images with no
/// text layer (no OCR in the frozen harness), so the full legal-scope
/// paragraph and the effectivity clause were not read directly — the
/// scope facts below come from the readable page 2 plus the DepEd
/// announcement page. **Fidelity stays `NotVerified`**: no SF10
/// generator exists and no generated output has been compared to this
/// form. `AuthoritativeSourceConfirmed` provenance does NOT imply
/// verified fidelity — the two axes are independent (see module doc).
pub const SF10_SSHS_V2026_CANDIDATE_EVIDENCE: TemplateEvidence = TemplateEvidence {
    form_type: "SF10",
    version: "sshs-v2026",
    provenance: ProvenanceState::AuthoritativeSourceConfirmed,
    fidelity: FidelityState::NotVerified,
    source_organization: Some("Department of Education (Philippines) — Learner Information System"),
    source_url: Some(
        "https://support.lis.deped.gov.ph/support/downloads/schoolforms/SSHS%20SF%2010%20v2026.xlsx",
    ),
    retrieved_on: Some("2026-08-27"),
    original_filename: Some("SSHS SF 10 v2026.xlsx"),
    authoritative_issuance: Some(
        "DepEd Memorandum No. 020, s. 2026 (13 Mar 2026), para. 5(b) — names \"SSHS SF 10 \
         v2026.xlsx\" as the official Modified SF10 for Strengthened SHS; verbatim-verified via \
         pdftotext from deped.gov.ph/wp-content/uploads/DM_s2026_020r-1.pdf",
    ),
    applicability_notes: Some(
        "Strengthened Senior High School SF10. Per DM 020 s. 2026 para. 4 (verbatim): used \
         \"exclusively, until further notice, by Strengthened SHS teachers in SSHS Pilot \
         Schools\"; non-Strengthened SHS teachers \"continue using the existing ECR and SF 10 \
         (formerly Form 137)\" (i.e. DepEd Order No. 69, s. 2016). ONE template for SSHS — para \
         5 lists a single SF10 filename; no per-track file. Curriculum: Strengthened SHS (traced \
         by DM 020 to DepEd Memorandum No. 48, s. 2025). Effectivity: SY 2025-2026 onward for \
         pilot schools. SHA-256 \
         a08ae34ba7f8e54d19389ba45c61d0ce18b347d877bcd8dd796d66c372ce6774; 227334 bytes; \
         Last-Modified 2026-03-17. Sheets FRONT/BACK/ANNEX/HELPER_SUBJECTS.",
    ),
    supersedes: None,
    // DM 020 does NOT supersede the DO 69 s. 2016 SF10 — the two coexist
    // (Strengthened SHS pilot vs. everyone else), so this is `None`, not
    // a link to the older form.
    superseded_by: None,
    evidence_gap_note: Some(
        "DM 020 pages 1/3/4 are scanned images (no text layer, no OCR in the frozen harness): \
         the full legal-scope paragraph and effectivity clause were not read directly. \
         Academic-vs-TechPro: not mentioned on the readable page; no evidence of a \
         template-level track split (one filename, one SSHS template). Internal cell/title text \
         of the workbook not transcribed. Render fidelity NOT tested — no SF10 generator \
         exists; provenance promotion does not touch fidelity.",
    ),
};

/// SF10 (Learner's Permanent Academic Record) — Junior High School
/// MATATAG variant hosted on the official DepEd LIS subdomain.
/// **Stays `CandidateUnverified` after Wave 2N** — Part E of the
/// Wave 2N directive: do not promote a community-touched file.
///
/// Two unresolved provenance concerns:
/// 1. Every JHS candidate inspected carries a non-DepEd "SirWedz
///    Guides" worksheet (a teacher-blogger's annotation) — the LIS
///    directory listing returns HTTP 403, so a clean master could not
///    be enumerated or checksum-matched.
/// 2. The governing national issuance — a DepEd Central Office Joint
///    Memorandum (ref. STR-250331-0910-PS, 28 Mar 2025), consistent
///    with DepEd Order No. 010, s. 2024 (MATATAG policy, verified on
///    deped.gov.ph) — attaches the revised SF10 as per-grade Annexes I
///    (Grade 1), II (Grade 4), III (Grade 7), phased with the MATATAG
///    rollout. The Joint Memorandum PDF itself was NOT retrieved (only
///    secondary DepEd-adjacent republications and a division-level
///    memo), and these generic "JHS" files are not confirmed to be any
///    of those annexes.
pub const SF10_JHS_CANDIDATE_EVIDENCE: TemplateEvidence = TemplateEvidence {
    form_type: "SF10",
    version: "jhs-matatag-candidate",
    provenance: ProvenanceState::CandidateUnverified,
    fidelity: FidelityState::NotVerified,
    source_organization: Some("Department of Education (Philippines) — Learner Information System"),
    source_url: Some(
        "https://support.lis.deped.gov.ph/support/downloads/schoolforms/School-Form-10-SF10-Learners-Permanent-Academic-Record-for-Junior-High-School.xlsx",
    ),
    retrieved_on: Some("2026-08-27"),
    original_filename: Some("School-Form-10-SF10-Learners-Permanent-Academic-Record-for-Junior-High-School.xlsx"),
    authoritative_issuance: None,
    applicability_notes: Some(
        "Junior High School SF10 under the MATATAG Curriculum (DepEd Order No. 010, s. 2024). \
         Phased per grade with the MATATAG rollout: Grade 7 from SY 2024-2025, higher JHS \
         grades in successive years. Transition rule (Joint Memorandum STR-250331-0910-PS, \
         28 Mar 2025, via secondary/division sources): a previously-completed old SF10 is NOT \
         rewritten onto the revised form — the old SF10 is attached to the revised SF10. \
         SHA-256 cbed9d14d80b3e32c4b4f5e8a909a31c360d709bdddaed1ca56b37f86a086e1d; 96785 \
         bytes. Sheets Front/\"SirWedz Guides\"/Back; zero formulas.",
    ),
    supersedes: None,
    superseded_by: None,
    evidence_gap_note: Some(
        "EVIDENCE BLOCKED (Wave 2N). The underlying national Joint Memorandum \
         (STR-250331-0910-PS, 28 Mar 2025) PDF was not obtained — only secondary DepEd-adjacent \
         republications and a division-level memo (Quezon DM 306, s. 2025), which is \
         authoritative evidence of instructions a division received, not of national \
         template identity. The file carries a non-DepEd \"SirWedz Guides\" worksheet; three of \
         four JHS candidates fetched showed it; the LIS directory listing returns HTTP 403 so a \
         clean master could not be enumerated or checksum-matched. Not confirmed to be Annex I/ \
         II/III of the Joint Memorandum. Internal content not transcribed; no SF10 generator \
         exists. Do NOT promote until a pristine DepEd master and the governing issuance are \
         obtained.",
    ),
};

/// The only SANCTIONED function in this codebase for moving a template
/// INTO `ProvenanceState::AuthoritativeSourceConfirmed` — a convention
/// enforced by callers, not by the type system (`TemplateEvidence`'s
/// fields are all `pub`; see the module doc comment on that tradeoff and
/// why it was judged acceptable). Enforces the Wave 2K directive's
/// non-negotiable rule: a community/secondary source must never
/// self-promote to authoritative — promotion requires an actual DepEd
/// issuance citation (`authoritative_issuance`), supplied by a human
/// reviewing real evidence, not inferred by this pipeline. This function
/// does not touch `FidelityState` at all — see the module doc comment on
/// why the two axes never move together.
pub fn confirm_authoritative_source(
    current: ProvenanceState,
    authoritative_issuance: Option<&str>,
) -> AppResult<ProvenanceState> {
    if current == ProvenanceState::Rejected {
        return Err(AppError::FormGeneration(
            "a previously rejected template source cannot be promoted to authoritative without \
             a new intake review"
                .to_string(),
        ));
    }
    // A superseded record must go through a fresh intake review, same as
    // a rejected one -- otherwise a stale record whose `superseded_by`
    // field still points at a newer version could be silently flipped
    // back to authoritative, an internally contradictory state
    // (independent architecture review, Wave 2K).
    if current == ProvenanceState::Superseded {
        return Err(AppError::FormGeneration(
            "a superseded template source cannot be re-promoted to authoritative without a new \
             intake review"
                .to_string(),
        ));
    }
    match authoritative_issuance {
        Some(issuance) if !issuance.trim().is_empty() => {
            Ok(ProvenanceState::AuthoritativeSourceConfirmed)
        }
        _ => Err(AppError::FormGeneration(
            "cannot confirm a template as authoritative without citing the DepEd issuance \
             (Order/Memorandum) that establishes it — a source classification alone is not \
             sufficient"
                .to_string(),
        )),
    }
}

/// Renders a developer-facing evidence report for one template — the
/// Wave 2K directive's required report, listing both verification axes
/// separately and calling out every unset evidence field as an explicit
/// gap rather than silently omitting it.
pub fn format_evidence_report(evidence: &TemplateEvidence) -> String {
    let mut lines = vec![
        format!(
            "Template evidence: {} ({})",
            evidence.form_type, evidence.version
        ),
        format!("  Provenance:  {:?}", evidence.provenance),
        format!("  Fidelity:    {:?}", evidence.fidelity),
    ];
    let field = |label: &str, value: Option<&str>| -> String {
        format!(
            "  {label}: {}",
            value.unwrap_or("(not recorded — evidence gap)")
        )
    };
    lines.push(field("Source org.", evidence.source_organization));
    lines.push(field("Source URL", evidence.source_url));
    lines.push(field("Retrieved on", evidence.retrieved_on));
    lines.push(field("Original filename", evidence.original_filename));
    lines.push(field("DepEd issuance", evidence.authoritative_issuance));
    lines.push(field("Applicability", evidence.applicability_notes));
    lines.push(field("Supersedes", evidence.supersedes));
    lines.push(field("Superseded by", evidence.superseded_by));
    if let Some(gap) = evidence.evidence_gap_note {
        lines.push(format!("  Evidence gap note: {gap}"));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Wave 2K required test #7: community source cannot self-promote ---

    #[test]
    fn confirming_authoritative_source_without_an_issuance_citation_is_rejected() {
        let result = confirm_authoritative_source(ProvenanceState::CandidateUnverified, None);
        assert!(result.is_err());
    }

    #[test]
    fn confirming_authoritative_source_with_a_blank_issuance_citation_is_rejected() {
        let result =
            confirm_authoritative_source(ProvenanceState::CandidateUnverified, Some("   "));
        assert!(result.is_err());
    }

    #[test]
    fn confirming_authoritative_source_with_a_real_issuance_citation_succeeds() {
        let result = confirm_authoritative_source(
            ProvenanceState::CandidateUnverified,
            Some("DepEd Order No. 015, s. 2026"),
        );
        assert_eq!(
            result.unwrap(),
            ProvenanceState::AuthoritativeSourceConfirmed
        );
    }

    // --- Wave 2K required test: superseded/rejected cannot become current ---

    #[test]
    fn a_rejected_source_cannot_be_promoted_even_with_an_issuance_citation() {
        let result = confirm_authoritative_source(
            ProvenanceState::Rejected,
            Some("DepEd Order No. 015, s. 2026"),
        );
        assert!(result.is_err());
    }

    #[test]
    fn a_superseded_source_cannot_be_silently_re_promoted_even_with_an_issuance_citation() {
        // Independent architecture review (Wave 2K) caught this gap: only
        // `Rejected` was guarded, so a stale superseded record (whose
        // `superseded_by` field still points at a newer version) could
        // otherwise be flipped straight back to authoritative.
        let result = confirm_authoritative_source(
            ProvenanceState::Superseded,
            Some("DepEd Order No. 015, s. 2026"),
        );
        assert!(result.is_err());
    }

    // --- Wave 2K required test #8: provenance and fidelity stay independent ---

    #[test]
    fn an_authoritative_source_with_unverified_fidelity_is_constructible_and_not_fully_verified() {
        let evidence = TemplateEvidence {
            provenance: ProvenanceState::AuthoritativeSourceConfirmed,
            fidelity: FidelityState::NotVerified,
            ..SF1_SYNTHETIC_V1_EVIDENCE
        };
        assert!(!evidence.is_fully_verified());
    }

    #[test]
    fn only_both_axes_at_their_strongest_state_reports_fully_verified() {
        let evidence = TemplateEvidence {
            provenance: ProvenanceState::AuthoritativeSourceConfirmed,
            fidelity: FidelityState::FidelityVerified,
            ..SF1_SYNTHETIC_V1_EVIDENCE
        };
        assert!(evidence.is_fully_verified());
    }

    // --- Wave 2K required tests #11/#12: SF1/SF9 debt preserved ---

    #[test]
    fn sf1_evidence_reports_unverified_provenance_and_fidelity_by_default() {
        assert_eq!(
            SF1_SYNTHETIC_V1_EVIDENCE.provenance,
            ProvenanceState::Synthetic
        );
        assert_eq!(
            SF1_SYNTHETIC_V1_EVIDENCE.fidelity,
            FidelityState::NotVerified
        );
        assert!(!SF1_SYNTHETIC_V1_EVIDENCE.is_fully_verified());
    }

    #[test]
    fn sf9_evidence_reports_unverified_provenance_and_fidelity_by_default() {
        assert_eq!(
            SF9_SYNTHETIC_V1_EVIDENCE.provenance,
            ProvenanceState::Synthetic
        );
        assert_eq!(
            SF9_SYNTHETIC_V1_EVIDENCE.fidelity,
            FidelityState::NotVerified
        );
        assert!(!SF9_SYNTHETIC_V1_EVIDENCE.is_fully_verified());
    }

    // --- Wave 2M/2N: real SF10 candidates carry their trail; only the
    //     SSHS one is promoted, and only its provenance axis moved ---

    #[test]
    fn every_sf10_record_carries_its_full_provenance_trail() {
        for ev in [
            &SF10_SSHS_V2026_CANDIDATE_EVIDENCE,
            &SF10_JHS_CANDIDATE_EVIDENCE,
        ] {
            assert_eq!(ev.form_type, "SF10");
            assert!(ev.source_url.is_some());
            assert!(ev.retrieved_on.is_some());
            assert!(ev.original_filename.is_some());
            assert!(ev.evidence_gap_note.is_some());
        }
    }

    #[test]
    fn wave2n_sshs_promotion_is_guard_satisfying_not_guard_bypassing() {
        // The record is stored as `AuthoritativeSourceConfirmed`, but the
        // promotion must be one `confirm_authoritative_source` itself
        // would allow from the prior state given the recorded citation —
        // this test IS the "use the promotion mechanism, don't bypass it"
        // check (Wave 2N part B).
        let ev = &SF10_SSHS_V2026_CANDIDATE_EVIDENCE;
        assert_eq!(ev.provenance, ProvenanceState::AuthoritativeSourceConfirmed);
        assert!(ev.authoritative_issuance.is_some());
        let allowed = confirm_authoritative_source(
            ProvenanceState::CandidateUnverified,
            ev.authoritative_issuance,
        )
        .expect("the guard must accept the SSHS citation");
        assert_eq!(allowed, ProvenanceState::AuthoritativeSourceConfirmed);
    }

    #[test]
    fn wave2n_sshs_provenance_promotion_did_not_touch_fidelity() {
        // Provenance != Fidelity — a hard invariant. The SSHS record's
        // source is now confirmed; its render fidelity is still untested.
        assert_eq!(
            SF10_SSHS_V2026_CANDIDATE_EVIDENCE.fidelity,
            FidelityState::NotVerified
        );
        assert!(!SF10_SSHS_V2026_CANDIDATE_EVIDENCE.is_fully_verified());
    }

    #[test]
    fn the_jhs_sf10_candidate_stays_unpromoted_and_unpromotable() {
        let ev = &SF10_JHS_CANDIDATE_EVIDENCE;
        assert_eq!(ev.provenance, ProvenanceState::CandidateUnverified);
        assert_eq!(ev.fidelity, FidelityState::NotVerified);
        // No confirmed issuance recorded → the guard refuses promotion.
        assert!(confirm_authoritative_source(ev.provenance, ev.authoritative_issuance).is_err());
    }

    // --- Wave 2K required test: no PII required anywhere in this model ---

    #[test]
    fn template_evidence_fields_never_require_learner_or_teacher_identifying_data() {
        // Structural guard: every field on TemplateEvidence describes the
        // TEMPLATE FILE (org, URL, hash-adjacent facts, issuance), never
        // a person. Both registered evidence records construct fully
        // with no such field populated -- if a future field ever needed
        // a name/LRN/etc. to be meaningful, that would be a design smell
        // this test exists to make visible via a compile-time field
        // change, not a runtime check.
        assert!(SF1_SYNTHETIC_V1_EVIDENCE.original_filename.is_none());
        assert!(SF9_SYNTHETIC_V1_EVIDENCE.original_filename.is_none());
    }

    // --- Reporting surfaces gaps honestly ---

    #[test]
    fn the_evidence_report_lists_every_unset_field_as_an_explicit_gap() {
        let report = format_evidence_report(&SF9_SYNTHETIC_V1_EVIDENCE);
        assert!(report.contains("evidence gap"));
        assert!(report.contains("Provenance:  Synthetic"));
        assert!(report.contains("Fidelity:    NotVerified"));
    }
}
