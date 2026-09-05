# ADR-0068 — Grade 12 DO 8 weighting carryover

Status: Accepted for implementation; native Rust verification complete
and the DO 8 Table 5 weight transcription independently re-verified
against the cited regional source directly (2026-09-05, see
"Verification" below). The Central Office primary-source PDF itself
remains unretrieved from this environment (still 403); a fresh reviewer
pass on the carryover _applicability_ reasoning (which learners fall
into which of the five groups) is still owed, distinct from the weight
figures this addendum confirms.

## Context

DepEd Order No. 015, s. 2026 already supplies six Strengthened Senior High
School weighting groups, and LIKHA implemented all six in migration 12. Annex
D paragraph 49, however, keeps Grade 12 learners who have not yet adopted the
Strengthened SHS Curriculum in SY 2026-2027 on the weights from DepEd Order
No. 8, s. 2015, together with DO 015's adjusted transmutation table.

The remaining gap was therefore not the six current SHS groups. It was the
five Grade 12 legacy applicability groups in DO 8 Table 5.

## Evidence

- DepEd Central Office's official issuance page identifies DO 8, s. 2015,
  states its nationwide effect from SY 2015-2016, and links the official
  `DO_s2015_08.pdf` enclosure:
  `https://www.deped.gov.ph/2015/04/01/do-8-s-2015-policy-guidelines-on-classroom-assessment-for-the-k-to-12-basic-education-program/`.
- An official DepEd Caraga school-policy handbook reproduces DO 8 Table 5 and
  its five SHS applicability columns:
  `https://caraga.deped.gov.ph/public-files/4670`.
- ADR-0013's primary-source reading of DO 015 paragraph 49 establishes why
  those legacy weights, rather than Table 10's Strengthened-SHS weights,
  apply to Grade 12 in the transition year.

The Central Office PDF returned HTTP 403 to this environment, so this record
does not pretend the bytes were freshly downloaded here. The figures were
cross-checked against the official regional reproduction and multiple
independent transcriptions. A future successful intake of the Central Office
PDF should be checksum-recorded in `SOURCE-REGISTRY.md`.

## Decision

The owner confirmed on 2026-09-04 that Grade 12 remains under the old
curriculum and must therefore use the old grading format. In LIKHA this means
the legacy DO 8 assessment structure and the applicable legacy subject-group
weights below for SY 2026-2027. The owner separately confirmed that the new
Zero-Based Grading System becomes effective the following school year,
SY 2027-2028. That changes the grade-calculation step; it must not be treated
as proof, by itself, that Grade 12's curriculum or form template also changes.

Add five non-default, explicitly Grade-12-labeled policies using the existing
legacy DO 8 assessment categories (`Written Work`, `Performance Task`,
`Quarterly Assessment`):

| Applicability group                                                                   |  WW |  PT |  QA |
| ------------------------------------------------------------------------------------- | --: | --: | --: |
| Core Subjects                                                                         | 25% | 50% | 25% |
| Academic — All Other Subjects                                                         | 25% | 45% | 30% |
| Academic — Work Immersion/Research/Business Enterprise Simulation/Exhibit/Performance | 35% | 40% | 25% |
| TVL/Sports/Arts and Design — All Other Subjects                                       | 20% | 60% | 20% |
| TVL/Sports/Arts and Design — Work Immersion/Research/Exhibit/Performance              | 20% | 60% | 20% |

The last two groups intentionally remain separate even though their numeric
weights match. Their applicability is different, and collapsing them would
erase which DepEd row the teacher selected.

No computation algorithm changes. The existing algorithm is data-driven and
already handles three top-level, non-nested legacy categories. For SY
2026-2027 it applies the adjusted transmutation table, satisfying DO 015's
transition rule. For SY 2027-2028 onward, the existing year boundary applies
Zero-Based Grading and no transmutation.

Migration 30 is stacked after ADR-0067's migrations 28-29 to avoid colliding
with the active sync work.

## Safety and UX constraints

- These policies are non-default and visibly labeled Grade 12 legacy.
- They must be paired with the legacy DO 8 category set. A mismatch fails
  closed as “not yet computable”; it cannot silently compute with DO 015
  categories.
- They are not valid for current Grade 11 Strengthened-SHS records.
- Automatic subject-name inference remains prohibited; teachers select the
  applicable group explicitly.

## Verification

Authored tests prove that all five rows exist, each totals 100%, every
component belongs to the legacy category set, the two equal-weight track
groups remain separately selectable, and an end-to-end 35/40/25 computation
produces IG 57.5 then TG 72 under the SY 2026-2027 adjusted table.

Genuinely run on a Rust-capable runner (2026-09-05, previously recorded as
owed while this ADR was authored on a runner with no Cargo toolchain):
`cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
clean; `cargo test` (full crate) 762 lib tests + all integration binaries,
0 failed, including the three DO 8-specific tests named above, each
confirmed in isolation too. Full record: `docs/VERIFICATION-DEBT.md`'s
Grade 12 DO 8 entry.

## Addendum (2026-09-05) — direct read of the cited regional source

This ADR's own Evidence section already cited
`https://caraga.deped.gov.ph/public-files/4670` but disclosed the Central
Office PDF itself as unretrievable (403); it is not clear from the
original text whether that regional document was actually opened and
read, or only cited from a secondary description. Retrieved and read it
directly this session (an 80-page DepEd Caraga "Unified Student School
Handbook" draft; a plain HTML fetch cannot parse it, but paginated PDF
extraction can). Found the table explicitly under a section headed
"Section 2. Grading System (DepEd Order No. 8, s 2015)": **Table 2,
"Weight of the Components for Senior High"** (the handbook's own Table 1
is the separate Junior High weight table, not used by this ADR).

Independently transcribed from the source image, the table's five
columns (Core Subjects; Academic Track — All other subjects; Academic
Track — Work Immersion/Research/Business Enterprise Simulation/Exhibit/
Performance; Technical-Vocational Livelihood — All other subjects;
Technical-Vocational Livelihood — Work Immersion/Research/Exhibit/
Performance, the last two sharing one merged value cell per row) read:

| Component            | Core | Acad. other | Acad. immersion | TVL (both sub-groups) |
| -------------------- | ---: | ----------: | --------------: | --------------------: |
| Written Work         |  25% |         25% |             35% |                   20% |
| Performance Tasks    |  50% |         45% |             40% |                   60% |
| Quarterly Assessment |  25% |         30% |             25% |                   20% |

This matches this ADR's own Decision table and migration 30's seeded
`grading_weight_components` rows **exactly**, digit for digit, across all
five applicability groups (including the TVL Other/TVL Immersion pair
sharing identical merged-cell values, matching this ADR's own note about
why they still remain separate rows). No discrepancy found.

This closes the weight-transcription half of the still-owed independent
review with a genuine primary-adjacent source read, not a re-trust of the
existing citation. It does **not** close: (a) obtaining the actual DepEd
Central Office `DO_s2015_08.pdf` (still 403 from this environment --
`SOURCE-REGISTRY.md`'s checksum-recording instruction remains
unactionable until that changes), or (b) an independent check of the
_applicability_ reasoning (which real learners/subjects fall into each of
the five groups) -- only the weight figures themselves were re-verified
here.
