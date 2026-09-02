# DepEd Order No. 015, s. 2026 and DepEd Order No. 009, s. 2026 — cross-cutting research

Shared evidence record for two 2026 DepEd Orders that cut across SF5,
SF6, and SF9's provenance work (`docs/form-evidence/{sf5,sf6,sf9}/README.md`
each reference this file rather than duplicating it) and affect
LIKHA-SIS's own `grading`/`grading_computation` domain modules.

First recorded 2026-09-02 (WebSearch-only). **Updated 2026-09-02, same
day: both orders' primary-source PDFs were supplied directly by the
project owner** (`DO_s2026_015r1.pdf`, 242 pages, and `DO_s2026_009r.pdf`,
196 pages) after this session's network egress proxy blocked all
`WebFetch`/`curl` access to `deped.gov.ph` and every other content
domain tested (`depedclub.com`, `en.wikipedia.org`, `web.archive.org`),
confirmed as a deliberate organization-policy 403 (`github.com`
remained reachable, ruling out a general network fault). Per the
proxy's own guidance ("do not retry or route around it"), no bypass was
attempted; the owner was informed and chose to supply the source files
directly rather than authorize circumventing the policy. Both PDFs were
read directly in this session (`Read` tool, page-rendered images via
`pdftoppm`/`poppler-utils`, installed this session — the PDFs are
scanned/flattened with no extractable text layer, confirmed via
`pdftotext -layout` returning empty output).

**This is now a genuine primary-source read**, not secondary
corroboration. Neither uploaded PDF is committed to the repo (matches
this project's established form-evidence convention) — they remain only
in the session upload directory.

---

## DepEd Order No. 015, s. 2026 — "Revised Guidelines on Classroom Assessment, Grading System, and Awards and Recognition for the K to 12 Basic Education Program"

**Read**: cover/transmittal, Rationale, Scope and Coverage, Definition of
Terms, Policy Statement, Classroom-based Assessment (Formative/
Summative), AI-use guidance, Grading System (all Key Stages), Section X
"Implementation Roles and Responsibilities" in full, Section XI
Monitoring/Evaluation, Section XII Funding, Section XIII Effectivity/
Severability/Transitory Provision, Section XIV References, and Annexes
A (formative-assessment supplemental guidance), B (integrative-assessment
sample models/rubric), C (KS1 descriptive-grading operational cycle and
conversion matrix), D (KS2-KS4 numeric grading computation steps,
component weights, the Adjusted Transmutation Table, and the zero-based
grading system), and the start of E/F (SF9-adjacent sample templates:
Kindergarten Progress Report, Grade 1-3 Learner's Progress Report, PACE
Form). Not read: the remainder of Annex F and Annexes G/H (SF9 sample
templates for KS2-KS4, awards/recognition detailed criteria) — lower
priority for this project's purposes, since the operative legal/
computational content is already captured below.

### Verbatim/near-verbatim confirmed facts

- **Effectivity** (para 85): takes effect "upon its approval, issuance,
  and fifteen (15) days after its publication in the Official Gazette or
  a newspaper of general circulation and filing with the Office of the
  National Administrative Register (ONAR) at the University of the
  Philippines Law Center (UPLC), Diliman, Quezon City."
- **Repeal clause** (para 87): "All existing DOs, Memoranda, rules and
  regulations, guidelines, and other related issuances or parts thereof
  which are inconsistent with the provisions of this Order are hereby
  repealed, rescinded, or modified accordingly." This is a general
  inconsistency-repeal, not a clause naming DO 8 s.2015/DO 36 s.2016 by
  number — the References section (Section XIV) lists both as related
  prior issuances (DO 8 s.2015 "Policy Guidelines on Classroom Assessment
  for the K to 12 Basic Education Program"; DO 36 s.2016 "Policy
  Guidelines on Awards and Recognition for the K to 12 Basic Education
  Program"), consistent with them being superseded, but the text itself
  does not use an explicit "hereby repeals DO X" naming construction for
  either.
- **Transition provision** (para 86): "The transition to the revised
  assessment, grading system, and awards and recognition system,
  including the implementation of descriptive grading for KS1 and the
  phased shift to zero-based grading for KS2 to KS4, shall be carried
  out in accordance with the provisions set forth in this Order."
- **Key Stage 1 (Grades K-3)**: descriptive (non-numeric) grading using
  five performance levels — Advancing, Benchmarking, Connecting,
  Developing, Emerging — recorded via the PACE (Performance and
  Competency Evaluation) Form and reported via the Learner's Progress
  Report / SF9. A conversion matrix to numeric ranges exists for
  cross-school-transfer cases only (Annex C, para 6): Advancing 90-100,
  Benchmarking 80-89, Connecting 75-79 (table lists "75-79" under a
  "Connecting" row printed as "75 - 79", correcting the OCR-order shown
  as "75-79" i.e. ascending is Emerging 0-64, Developing 65-74,
  Connecting 75-79, Benchmarking 80-89, Advancing 90-100), explicitly
  "shall not be interpreted as exact computed grades."
- **Key Stages 2-4 (Grades 4-12)**: numeric grading, weighted per
  component (Written Works/Performance Tasks/Exams). Confirmed weights
  (Annex D Table 1): Grades 4-10 core subjects 20/50/30 (WW/PT/Ex);
  EPP/TLE and MAPEH 20/60/20. Strengthened SHS (Table 2) uses a more
  granular weight matrix varying by Core, Academic Electives (further
  split by elective type, including Field Experience sub-splits), and
  TechPro Electives — e.g. Core 20/50/30, Work Immersion 20/80/0, SHS
  Research/Design and Innovation Field Experience 15/70/15-style splits.
  GMRC (KS2)/VE (KS3) additionally split each component into
  Cognitive/Affective/Behavioral domains (Table 3).
- **Adjusted Transmutation Table — "only for SY 2026-2027"** (Annex D,
  explicit table heading, paras 9-12, Table 4): a full Initial-Grade →
  Transmuted-Grade lookup table, bounded 60-100. Key anchor points
  confirmed verbatim: IG 70.00-71.17 → TG 75 (the minimum passing IG for
  a passing TG of 75); IG 99.50-100.00 → TG 100; IG below 70 maps to TG
  60-74, with **60 as the minimum reportable/floor grade**. This
  supersedes the general knowledge that DepEd's older (DO 8 s.2015-era)
  transmutation table used a different anchor (70 IG historically also
  mapped to 75 TG under the old table too, so this is a continuity, not
  necessarily a change, in that specific anchor — not independently
  verified against DO 8 s.2015's own table text this session).
- **Zero-Based Grading System** (Annex D, paras 13-18): "Beginning SY
  2027-2028, DepEd shall implement a Zero-Based Grading System for KS2
  (Grades 4-6) to KS3 (Grades 7-10)." (Note: the text as read specifies
  KS2-KS3 for this paragraph, not KS2-KS4 as this project's earlier
  WebSearch-only pass had summarized — KS4/Grades 11-12 zero-based
  scope was not independently re-confirmed in the specific paragraph
  read; para 86 above does use "KS2 to KS4" for the phased shift more
  generally, so the two statements are in tension and should be treated
  as **not fully resolved** — flagged here rather than silently
  reconciled.) "No transmutation or conversion is applied" — the
  computed Initial Grade directly becomes the Term Grade. **Default
  minimum reportable grade under zero-based grading is 60** (para 18),
  distinct from the existing "75 is the minimum passing grade" policy —
  a learner can be reported as low as 60 but the passing threshold for
  promotion purposes remains 75.
- **Attendance/failing-grade rule** (para 22): learners exceeding 20% of
  prescribed class-day absences receive "a failing grade and no credit,
  unless justified"; School Head may grant case-by-case exemptions
  subject to documentation, with required task/assessment completion
  still mandatory.
- **SF9 tie-in confirmed directly**: Annex C Table 1 explicitly names
  "the Learner's Progress Report (SF9)" as the KS1 reporting instrument,
  and Annex F's template is titled "Learner's Progress Report Template"
  for Grades 1-3 — this is the same "Learner's Progress Report" naming
  this project's SF9 evidence record (`docs/form-evidence/sf9/README.md`)
  already flagged as the current official name/definition tied to this
  order.
- **References confirm the related-issuance chain**: DO 8 s.2015, DO 36
  s.2016, DO 31 s.2020 (Interim Guidelines for Assessment and Grading —
  Learning Continuity Plan era), DO 10 s.2024 (Revised K to 10
  Curriculum), DM 074 s.2025 (Pilot Implementation of the Revised Policy
  Guidelines — i.e. this Order was piloted before full issuance), and
  DO 003 s.2026 (Foundational Guidelines on AI in Basic Education) — all
  now cited from the order's own reference list rather than only from
  secondary search results.

## DepEd Order No. 009, s. 2026 — "Guidelines on the Implementation of the Three-Term School Calendar in Basic Education"

**Read in full** (8-page enclosure plus cover transmittal). Signed and
dated **April 16, 2026**, by **Secretary Sonny Angara**. Addressed to
Undersecretaries, Assistant Secretaries, the BARMM Minister for Basic,
Higher, and Technical Education, Bureau/Service Directors, Regional
Directors, Schools Division Superintendents, public and private school
heads, SUC/LUC heads, and "All Others Concerned."

### Verbatim/near-verbatim confirmed facts

- **Legal basis**: RA 7797 (An Act to Lengthen the School Calendar to
  Not More Than 220 Class Days), as amended by RA 11480; the
  Eight-Point Socioeconomic Agenda of President Ferdinand R. Marcos,
  Jr.; DepEd's Five-Point Reform Agenda; and the Q-BEDP 2025-2035.
- **Scope** (paras 5-6): applies to **all public elementary and
  secondary schools and Community Learning Centers (CLCs)**. Private
  schools, Philippine Schools Overseas (PSOs), and SUCs/LUCs _may_
  adopt it for SY 2026-2027 but must still meet RA 11480's 220-class-day
  ceiling and other applicable rules if they don't.
- **SY 2026-2027 exact dates, now primary-source-confirmed and matching
  this project's earlier WebSearch-only finding exactly**: school year
  opens **Monday, June 8, 2026** and ends **Thursday, April 8, 2027**,
  totaling **201 class days**. Figure 3 in the order gives the term
  breakdown: **Term 1: 69 days** (June-Sept, ending Sept 15 per the
  earlier WebSearch pass, consistent with the figure), **Term 2: 65
  days** (Sept-Dec), **Term 3: 67 days** (Jan-Apr). This is materially
  stronger confirmation than the prior WebSearch pass since it is drawn
  from the order's own published figure, not a third-party summary.
- **Structure** (Section V.A): each term = Opening Block (Term 1 only,
  4-5 days, BOSY activities) + Instructional Block (61-62 days,
  teaching/learning + ARAL remediation sessions) + a two-week
  **End-of-Term Block** (8-10 days: grade computation, school-forms
  prep/checking, parent-teacher conferences, remediation/enrichment,
  co/extra-curricular activities, INSET, wellness break).
  - **"Wellness Break"** (defined term, Section III.h): 4 days for
    learners, 2 days for teachers, within the End-of-Term Block —
    distinct from the separate Wellness Leave under DO 002, s. 2026.
  - **Two teacher-developed summative assessments** are required prior
    to the Term Examination in each term's Instructional Block (para
    27); Progress/Performance Reports are issued after each term via a
    working-day Parent-Teacher Conference during the End-of-Term Block
    (para 28) — "a separate issuance on classroom assessments, grading
    system, and awards and recognition shall be released" (this is the
    order's own forward-reference to DO 015 s.2026).
- **Repealing clause** (Section VIII, para 41, and cover letter para 5):
  "This Order repeals in full DepEd Order (DO) No. 012, s. 2025
  (Multi-year Implementing Guidelines on the School Calendar and
  Activities)" and **amends** (not repeals) "the transfer and enrollment
  provisions in DO 017, s. 2025 (Revised Basic Education Enrollment
  Policy)." All other inconsistent issuances are repealed/rescinded/
  modified generally. **DO 12, s. 2025 and DO 17, s. 2025 were not
  previously on this project's radar at all** — new findings from this
  primary read, not carried over from the earlier WebSearch pass.
- **Effectivity** (Section IX, para 42): "This Order shall take effect
  beginning School Year 2026-2027 upon its approval and publication on
  the official DepEd website, the Official Gazette, or in a newspaper
  of general circulation." Certified copies registered with ONAR, UP Law
  Center, Diliman. (Note: no 15-day-after-publication delay clause here,
  unlike DO 015 s.2026's para 85 — DO 009 s.2026 takes effect
  immediately upon publication.)
- **Late enrollment/transfer** (Section V.G): late enrollees admitted if
  they meet 80% of prescribed class days or enroll no later than the
  second summative test of Term 1, per DO 17, s. 2025 (as amended by
  this Order's own para 5 amendment of DO 17's transfer/enrollment
  provisions — the two provisions cross-reference each other).
- **References list** (Section X) — DO 9, s. 2005; DO 19, s. 2008; DO 24,
  s. 2008; DO 55, s. 2016; DO 27, s. 2022; DO 29, s. 2017 — none of
  these were previously flagged in this project's research; they are
  general calendar/assessment/no-collection-policy issuances, not
  independently assessed for continued relevance here.

## Classification — updated

**Both orders: `ProvenanceState::AuthoritativeSourceConfirmed`.** Full
primary-source text was read directly by this session from the
project-owner-supplied official DepEd Order PDFs (cover transmittal with
signature block, enclosure/annex numbering, ONAR filing language, and
the DepEd letterhead/seal all present and consistent with the
Department's standard issuance format). This clears this project's
evidence-gate bar — no longer WebSearch-snippet-only.

**Caveat retained**: DO 015 s.2026's Annexes G/H (SF9 KS2-KS4 sample
templates, detailed awards/recognition criteria) and the remainder of
Annex F were not read this session — if a future task needs those
specific annexes' content, read them before relying on them. The
KS2-KS4-vs-KS2-KS3 zero-based-grading scope tension noted above is also
unresolved and should be checked against the as-published Official
Gazette text before this project's `grading_computation` module treats
either boundary as settled.

## Practical implication for LIKHA-SIS — correction: this is already implemented, not a gap

**This session's earlier framing (both in this file's first version and
in the corresponding `docs/CURRENT-HANDOFF.md` entries) was wrong to
present DO 015/DO 009 s.2026 as unaddressed findings needing a future
review-and-decide pass.** That framing came from the form-evidence
research track alone, without checking whether the domain layer had
already handled them. It had, in earlier milestones this project's own
memory already recorded — the form-evidence work just didn't cross-
reference it. Corrected here after inspecting
`src-tauri/src/repository/{grading,grading_computation}.rs` directly:

1. **DO 009 s.2026's three-term calendar was implemented in M11**
   (`docs/adr/0010-grading-period-foundation.md`, 2026-08): the
   `grading_policies`/`grading_policy_periods`/`grading_periods` schema
   is already policy-driven and versioned specifically _because_ M11's
   own research anticipated DepEd's terminology could change, seeding
   "DepEd Three-Term School Calendar" (Term 1/2/3) as the **default**
   policy, citing this exact order, alongside a legacy four-quarter
   policy for historical/transitioning records. This session's
   primary-source read confirms M11's WebSearch-sourced facts (SY
   2026-2027 term dates, 201 class days) were already correct — a
   validation, not a new requirement.
2. **DO 015 s.2026's grading computation was implemented in M13**
   (`docs/adr/0013-deped-grade-computation.md`, 2026-08): a prior
   session's `WebSearch` located and directly read the order's own PDF
   from `deped.gov.ph` (network access worked in that session; this
   session's own egress block is session-specific, not a standing
   project condition). `grading_computation::ADJUSTED_TRANSMUTATION_TABLE`
   is the verbatim Annex D Table 4 this session independently
   re-transcribed from the owner-supplied PDF — **the two transcriptions
   match exactly, band for band**, a strong independent cross-check that
   both are accurate. `transmute_adjusted`/`round_zero_based`/
   `uses_zero_based_grading` (keyed off `grading_periods.school_year`,
   switching at 2027) and the explicit 60-floor are all already coded
   and tested against the order's own two worked examples (Science KS2
   IG 85.8 → TG 88 transmuted; Mathematics KS3 IG 83.6 → TG 84
   zero-based) — both examples this session also independently found
   in the primary PDF and confirm match.
3. **Weight-group coverage has since been substantially expanded past
   M13's original one-group scope**: M15 added EPP/TLE & MAPEH
   (`docs/adr/0015-expand-grading-policy-coverage.md`); M16 added all six
   Key Stage 4/SHS weight groups from DO 015's Table 10
   (`docs/adr/0016-shs-and-exceptional-grading-policies.md`), including
   the two structurally exceptional shapes (Field Exposure/Arts
   Apprenticeship/Creative Production's Term-Examination-only
   Examinations component; Research Electives/Work Immersion's
   no-Examinations-component shape). See `docs/PROJECT-MEMORY.md`'s M15/
   M16 entries for the full detail.
4. **What genuinely remains open**, per ADR-0013's own disclosed scope
   and this session's new findings — not urgent, not blocking, listed
   for a future milestone to pick up if/when needed, not as a standing
   recommendation to act now:
   - **Key Stage 1 descriptive grading** (five-level scale, PACE Form,
     cross-transfer numeric conversion matrix) is a structurally
     different computation from the weighted-numeric one
     `grading_computation` implements — not yet modeled at all.
   - **Grade 12's DO 8 s.2015 carryover weights** — ADR-0013 could not
     primary-source-confirm DO 8's own percentages; this session's read
     of DO 015 s.2026 did not include DO 8's text either (DO 015 only
     lists DO 8 in its References, doesn't restate its numbers), so this
     remains unresolved.
   - **The KS2-KS4-vs-KS2-KS3 zero-based-grading scope tension** flagged
     above (DO 015's own text is internally inconsistent on this) is not
     currently load-bearing — `uses_zero_based_grading` applies
     uniformly by school year with no Key-Stage parameter, which matches
     the broader "KS2 to KS4" reading; if a future milestone ever needs
     KS-specific zero-based rollout timing, resolve the ambiguity against
     the Official Gazette text first.
   - **DO 12, s. 2025 and DO 17, s. 2025** (newly identified this
     session from DO 009's own repeal/amendment clauses) — worth a quick
     check only if LIKHA-SIS's enrollment or calendar features ever cite
     either by number; no current feature does.

**No code change is recommended from this evidence-gathering work.**
The grading domain's DepEd-compliance posture for DO 015/DO 009 s.2026
is materially stronger than this file's first version suggested — this
was a documentation-accuracy correction, not a new engineering task.
