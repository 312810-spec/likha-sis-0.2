# SF5 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 5 (SF5) "Report on
Promotion and Level of Proficiency & Achievement" template candidate
acquired 2026-09-02. See `docs/form-evidence/sf1/README.md` for this
session's shared network-egress limitation note (applies identically
here).

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::StructureVerified`
(updated 2026-09-02 — both governing orders now primary-source
confirmed; see the structural comparison below).

Note: this is separate from and does not affect the already-shipped
`export::sf5` CSV export (ADR-0057) — that feature computes promotion
status per DepEd Order No. 8, s. 2015's rules and is unaffected by this
authoritative-_template_ evidence work.

## Candidate

One user-supplied file, `SF5.xls` (legacy `.xls`, sheet
`school_form_5`). SHA-256:
`f8e0b059adb207046bf9ac142cf3cfac33d1c47584d5e20b4b90f23e0e4bccee`.
Structurally a blank template (51 non-empty cells, all header/label
text, no learner data) — verified clean of PII.

## Governing issuances — both now primary-source confirmed (2026-09-02)

- **DepEd Order No. 4, s. 2014** — founding order (same as SF1/SF2/SF4),
  read directly this session; full detail:
  `docs/form-evidence/do4-s2014/README.md`
  (`ProvenanceState::AuthoritativeSourceConfirmed`). The candidate's own
  instructions text ("This replaces Forms 18-E1, 18-E2, 18A and List of
  Graduates") is **confirmed accurate, not a discrepancy** — the order's
  own para 2 table lists exactly this breakdown; the earlier "Forms 18
  and 20" phrasing in secondary sources was just a coarser summary
  covering SF5 _and_ SF6 together (para 3's own prose). Resolved, see
  the shared record.
- **DepEd Order No. 11, s. 2018** — "Guidelines on the Preparation and
  Checking of School Forms," read directly this session; full detail:
  `docs/form-evidence/do11-s2018/README.md`
  (`ProvenanceState::AuthoritativeSourceConfirmed`). **The candidate's
  own instructions text cites this order twice by page number** ("Only
  LIS generated SF5 shall be recognized (DO 11, 2018, page 7)" and
  "shall be submitted to the DCC together with the accomplished SFCR1 —
  (Deped Order 11, 2018, page 11)") — **both citations independently
  verified accurate**: page 7 of the actual order does state the
  LIS-only-recognition rule, and page 11 does describe the SFCR1
  submission step. This is strong evidence the candidate's author
  worked from the real order, not a garbled secondhand summary.
  Everything this project's earlier WebSearch-only pass found (SCC
  composition, SFCR1 naming) is now confirmed verbatim, with **one
  addition**: SF5's checking is against **SF1** (total learner count
  consistency), **SF4** (Feb/March), **SF10/SF9** (or Class Record),
  per the order's own Diagram 1.
- **DepEd Order No. 8, s. 2015** ("Policy Guidelines on Classroom
  Assessment") — defines the proficiency bands (Outstanding 90-100,
  Very Satisfactory 85-89, Satisfactory 80-84, Fairly Satisfactory
  75-79, Did Not Meet Expectations <75) and the promotion/retention
  rule (≤2 failed learning areas → remedial; more → retained) that SF5
  computes and reports. Clarified by DO 29, s. 2015. Not itself
  primary-source-read this session (only DO 4/DO 11/DO 015 s.2026
  were).

## Structural comparison against DO 4 s.2014's Enclosure No. 2 (2026-09-02)

Direct field-by-field comparison of the candidate's actual cells
against the order's own primary-source SF5 field list:

- **Matches**: LRN, Learner's Name, General Average, Incomplete
  Subject/s columns, Summary Table (Promoted/Retained split), School
  ID/Year/Curriculum/Grade Level/Section header block, Name/Signature
  of Class Adviser and School Head.
- **Terminology drift, both confirmed by direct inspection**:
  - **Action Taken**: the candidate reads **"PROMOTED, CONDITIONAL or
    RETAINED"**; DO 4 s.2014's own Enclosure 2 reads **"Promoted /
    Irregular / Retained."** "Conditional[ly Promoted]" has replaced
    "Irregular" — consistent with the same shift seen in SF6's own
    candidate (see that file) and matching DO 11 s.2018's own text,
    which itself uses "conditionally promoted" throughout (e.g. "as of
    end of school year (promoted, conditionally promoted or retained)
    in the LIS"). This looks like a genuine, DepEd-sourced terminology
    update sometime after 2014, not a candidate-author invention.
  - **Level of Proficiency bands — corrects an earlier mistaken claim
    in this file's first version**, which had said this candidate uses
    the DO 4-original Beginning/Developing/Approaching/Proficient/
    Advanced scale. **Direct re-inspection (2026-09-02) found this was
    wrong**: the candidate's actual band labels are **"Did Not Meet
    Expectations (74 and below), Fairly Satisfactory (75-79),
    Satisfactory (80-84), Very Satisfactory (85-89), Outstanding
    (90-100)"** — this is **DO 8, s. 2015's** classroom-assessment
    descriptor scale (already cited in this file's own "Governing
    issuances" section above), not DO 4 s.2014's original five-band
    scale. The candidate blends a DO-4-era structure with DO-8-era
    terminology.
- **Internal citations, both verified accurate against the primary
  text** (see DO 11 s.2018 discussion above): "Deped Order 4, 2014
  par.5" (school head accountability for wrongful entries) and the two
  DO 11 s.2018 page citations.

## ⚠️ Important finding: DepEd Order No. 015, s. 2026 — now primary-source confirmed

**Not previously on this project's radar, not cited by the candidate
file, and directly relevant to SF5's core computation.** Full text of
this order (and the related DO 009, s. 2026 three-term calendar order)
was read directly this session from owner-supplied primary-source PDFs.
Record: `docs/form-evidence/grading-2026-orders/README.md`
(`ProvenanceState::AuthoritativeSourceConfirmed`). Confirmed: DO 015,
s. 2026 supersedes the assessment/grading rules SF5's proficiency bands
and promotion rule were built on (DO 8, s. 2015 is listed in DO 015's
own references as a prior related issuance), introduces descriptive/
non-numeric grading for Key Stage 1, and a phased transition (SY
2026-2027 adjusted transmutation table, SY 2027-2028 zero-based grading)
for Key Stages 2 onward. **Flagged explicitly for the project owner** —
see `docs/CURRENT-HANDOFF.md`.

## Official downloadability — now confirmed with an exact citation

**No longer just search-summarized guidance**: DO 11 s.2018 itself
states, verbatim (page 7, see `docs/form-evidence/do11-s2018/README.md`),
that "Commercialized electronic school forms... shall not be recognized
nor accepted" and that only LIS-generated SFs, signed off by the
designated LIS/ICT Coordinator, are accepted during DCC checking. This
confirms — with an exact citation, not a paraphrase — that **the
authoritative SF5 is one generated by the LIS itself for a specific
school/year, not a standalone downloadable template used
independently**. Matters for LIKHA-SIS: even a verified-authentic blank
template, or a byte-perfect LIKHA-SIS-generated SF5, is evidence of
content/layout provenance only — not proof it would be accepted as the
official SF5 for DCC-checking purposes without going through the LIS.
This is consistent with, and now grounds, `export::sf5`'s existing
design as a content-faithful working export rather than a claimed
official-LIS-equivalent artifact.

## Classification

**Governing orders: `ProvenanceState::AuthoritativeSourceConfirmed`**
for DO 4 s.2014, DO 11 s.2018, and DO 015 s.2026 (all three now read
directly this session). **The candidate template file itself: still
`ProvenanceState::CandidateUnverified`** — the structural comparison
above shows real, disclosed drift (terminology shifts, a different
grading-band scale than the 2014 original) rather than a byte-perfect
match, which is evidence of an actively-maintained descendant, not
proof of current official status. `FidelityState::StructureVerified`.
Separately and more urgently: DO 015 s.2026 confirms the grading rules
this candidate's Level-of-Proficiency section reports on (already
identified above as DO-8-era, not even DO-4-era) are **superseded**
for SY 2026-2027 onward — this candidate's grading-band section should
be treated as outdated regardless of its structural provenance,
pending the grading-domain review already recorded in
`docs/form-evidence/grading-2026-orders/README.md`.

## Next step

Nothing outstanding for DO 4 s.2014 or DO 11 s.2018 — both fully read.
What remains: identify the specific issuance that shifted "Irregular"
to "Conditionally Promoted" (not chased down this session — DO 11
s.2018's own text already uses the newer term, so the change predates
2018, narrowing the search window to 2014-2018).
