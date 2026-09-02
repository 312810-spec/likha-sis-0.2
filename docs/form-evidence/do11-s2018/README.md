# DepEd Order No. 11, s. 2018 — primary-source confirmation

Shared evidence record for DepEd Order No. 11, s. 2018, the school-forms
checking-process order — referenced by
`docs/form-evidence/{sf1,sf4,sf5,sf6,sf10}/README.md` rather than
duplicated. First recorded 2026-09-02 via `WebSearch` corroboration
only. **Updated same day: the project owner supplied a primary-source
PDF directly** (`DepEdOrderNo.11S.2018GuidelinesonthePreparationandCheckingofSchoolForms.pdf`,
15-page enclosure, plus cover), read in full. Meets this project's
`ProvenanceState::AuthoritativeSourceConfirmed` bar. Not committed to
the repository.

## The order itself

**"GUIDELINES ON THE PREPARATION AND CHECKING OF SCHOOL FORMS."** DepEd
Order No. 11, s. 2018, dated **07 MAR 2018**, signed by **Leonor
Magtolis Briones, Secretary**. References: DepEd Order Nos. 33, s. 2013;
34, s. 2014; 36, s. 2016; and 58, s. 2017. Repeal clause (para 3):
"All existing Orders, Memoranda, and related issuances inconsistent
with this Order are hereby repealed, rescinded, or modified
accordingly." Effective starting end of SY 2017-2018.

## Key definitions (Section IV, verbatim/near-verbatim)

- **DCC — Division Checking Committee**: the committee at the Schools
  Division Office responsible for the annual checking of forms.
- **SCC — School Checking Committee**: the committee at the school
  level responsible for the review and preparation of learners' records
  in preparation for DCC checking. **Matches this project's earlier
  WebSearch-only finding word for word** — chaired by the School Head,
  two Vice Chairs: **ICT Coordinator/System Administrator for LIS/EBEIS**
  (Enrollment Counts and Learner Profile) and **most capable school
  personnel** (Curriculum and Assessment).
- **SFCR — School Forms Checking Report**: "A report in a matrix format
  summarizing the results of the checking activity at the school,
  district, and division levels." The school-level instance is
  literally named **SFCR1** (Annex 1a) — matching this project's
  earlier WebSearch-only finding exactly. District/Division roll-ups
  are **SFCR2** (Annex 1b, PSDS-consolidated) and **SFCR3** (Annex 1c,
  DCC-consolidated, due to the Schools Division Superintendent no later
  than the second Monday of May each school year).
- **SF5K — School Form 5 for Kindergarten**: a Kinder-specific SF5
  variant, not previously identified by this project's research —
  validated against the ECCD Checklist post-test result and Kindergarten
  Progress Report rather than a numeric general average.
- SF9 = "formerly Form 138"; SF10 = "formerly Form 137" (Learner's
  Permanent Academic Record) — consistent naming with this project's
  own SF9/SF10 evidence files.

## DCC and SCC composition (Section V, Tables 1 and confirmed text)

- **DCC**: Chair = Chief, Curriculum Implementation Division (CID);
  Vice Chairs = Chief, School Governance and Operations Division
  (SGOD) and Public Schools District Supervisor (PSDS); Members =
  Education Program Supervisors, Senior EPS for Planning and Research,
  Division Planning Officer, others as identified.
- **SCC**: as above — School Head Chair, two Vice Chairs.

## The four SFs that are the actual focus of checking

**"These four (4) SFs (SF1, SF4-February & March, SF5, SF6) generated
from the LIS shall be the focus of checking and should be supported by
the appropriate documents."** SF2 and SF10/SF9 serve as supporting/
secondary reference documents (Diagram 1's own "Primary Document" vs.
"Secondary/Supporting Document" split), not independently checked SFs
in their own right under this order.

## Only LIS-generated forms are recognized — directly relevant to LIKHA-SIS

**Verbatim, page 7**: "Electronic forms pre-loaded with learner
information and their general averages downloadable from the LIS are
not subject for editing manually or outside the LIS... The format and
content of system-generated SFs are considered final and official.
**Commercialized electronic school forms** as mentioned in DO No. 58,
s. 2017 Section VII (Special Provision), **shall not be recognized nor
accepted.** To ensure that only SFs generated from the LIS are being
presented during the checking of forms, the designated LIS or ICT
Coordinator is required to sign or initial each SF."

**This is a real, disclosed compliance boundary for LIKHA-SIS, not just
for the specific candidate template files**: any SF1/SF4/SF5/SF6 output
this project ever generates — however faithful to DepEd's field layout
— is not itself "the official SF" for DCC-checking purposes unless it
originates from the LIS. This matches and strengthens the caveat
already recorded in `docs/form-evidence/sf5/README.md`'s "Official
downloadability" section (LIS-generated only, third-party electronic
forms void for official transactions) — now with the exact citation
(DO 58, s. 2017 §VII) and exact enforcement mechanism (LIS/ICT
Coordinator sign-off during DCC checking) behind it. LIKHA-SIS's
form-output features are therefore evidence/content-faithful working
documents for the school's own use, not a substitute for the LIS's own
official-form generation — a distinction this project's `sf10.rs`/
`sf5.rs` exports already implicitly respect (content-based CSV exports,
not claims to be the official `.xlsx`), now with a citable basis for
why that boundary matters.

## Cross-form validation chain (Diagram 1)

LIS-generated SF1 → validated against Birth Certificate → LIS-generated
SF5 (SF5K for Kinder) → cross-checked against SF4 (Feb/March),
SF10/Form 137, SF9/Form 138 or Class Record, Completion Certificate →
LIS-generated SF6. SGOD focuses on enrollment/dropout/transfer counts;
CID focuses on enrollment eligibility and promotion/retention/
acceleration compliance.

## Obsolete forms — no longer required (Section VI.3.a)

"Forms that were replaced by modified school forms through DO No. 4,
s. 2014 are no longer required to be prepared at the school level, such
as but not limited to the List of Graduates, Form 18 (Report on
Promotion), Form 3 (Principal Report of Enrollment & Attendance), Form
19 (Assignment List of Teachers), and Form 29 (Teacher's Program)." Also
confirms **honors-ranking local forms are no longer required** ("not
applicable since SY 2016-2017," per DO 36, s. 2016).

## Classification

**`ProvenanceState::AuthoritativeSourceConfirmed`** for the order
itself — read directly from the project owner's supplied PDF, with the
Secretary's signature, DepEd seal, and Central Office letterhead
present. Every specific detail this project's earlier WebSearch-only
research had found (SCC composition, SFCR1 naming, "LIS-generated
only" rule) is now independently confirmed verbatim from the primary
text, with zero contradictions found.

## Next step

None outstanding for the order itself. What remains open is per-form:
whether each candidate `.xls` file's own internal citations to this
order (several do cite it directly, e.g. SF5's own instructions quote
"DO 11, 2018, page 7" and "page 11" — both now confirmed to match this
PDF's actual page 7 and page 11 content) reflect a genuine, careful
transcription or a coincidental match — see each form's own evidence
file.
