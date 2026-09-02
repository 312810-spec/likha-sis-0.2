# SF2 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 2 (SF2) "Daily
Attendance Report of Learners" template candidate acquired 2026-09-02.
See `docs/form-evidence/sf1/README.md` for this session's shared
network-egress limitation note (applies identically here).

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::StructureVerified`
(updated 2026-09-02 — see the structural comparison below).

## Candidate — PII found and redacted before this record was written

One user-supplied file, `SF2.xls` (legacy `.xls`, sheet
`school_form_2_ver2014.2.1.1`). SHA-256 of the **original as-uploaded**
file: `14038f51b0cd51316dc5fc9d583de1b0e6185f52174541c72371547bbeb88bff`.

**A real name — a School Head's — was found filled into the
"Signature of School Head over Printed Name" attestation cell (the only
non-blank data cell in an otherwise blank template).** Per this
project's absolute synthetic-data-only rule, this was redacted (the
single cell blanked, nothing else touched) before any further work; the
original as-uploaded file was never committed to this repository. The
user (project owner) confirmed and authorized the redaction. Everything
else in the file — 97 of the original 98 non-empty cells — is template
labels/headers only, no other PII.

## Governing issuance — now primary-source confirmed (2026-09-02)

Same founding order as SF1: **DepEd Order No. 4, s. 2014**, read
directly this session — full detail:
`docs/form-evidence/do4-s2014/README.md`
(`ProvenanceState::AuthoritativeSourceConfirmed` for the order itself).
SF2 = "Daily Attendance Report for Learner," replacing old Form 1,
Form 2, and STS Form 4 (Absenteeism and Dropout Profile) — the
candidate's own subtitle text matches this exactly.

**Confirmed later revisions (search-corroborated, not primary-read)**:

- **DepEd Memorandum No. 014, s. 2021** (March 26, 2021) — pandemic-era
  interim guidelines; changed SF4's "Dropout" column to "NLPA" (No
  Longer Participating in Learning Activities) and shifted submission
  cadence — explicitly scoped as SY 2020-2021 only, by its own title.
- A September 2022 "Updated SF1, SF2 and SF3" template refresh on
  `support.lis.deped.gov.ph` (no specific order number confirmed).
- A 2026-era secondary source suggests "NLPA" is being reverted to "NLS"
  (No Longer in School) post-pandemic — order number not confirmed.

## Structural comparison against DO 4 s.2014's Enclosure No. 2 (2026-09-02)

The candidate's header row (School ID, School Year, Report Month, Name
of School, Grade Level, Section, No., Name, daily M/T/W/Th/F columns,
Total for the Month, Remarks) and its printed guidelines page (found
during earlier structural inspection — six numbered guideline items
covering the Registered Learners/Average Daily Attendance/Percentage of
Attendance/Percentage of Enrolment formulas, and the same 1st-Friday-of-
June BoSY cutoff the order itself states) **match DO 4 s.2014's
Enclosure 2 SF2 field list closely** — School ID, School Year, School
Name, Grade Level, Section, Month, Learner's Name, Date (Daily),
Total Days Absent/Tardy, Remarks, Enrolment as of 1st Friday of June,
Percentage of Enrolment, Average Daily Attendance, Percentage of
Attendance, Signature of Teacher, Signature of School Head — all
present, with the order's own exact computation formulas reproduced on
the candidate's own guidelines page nearly verbatim. This is the
closest match to the 2014 baseline found among this session's five
`.xls` candidates so far.

## Classification

**Governing order: `ProvenanceState::AuthoritativeSourceConfirmed`**
(see the shared record). **This candidate file: still
`ProvenanceState::CandidateUnverified`**, but with the strongest
structural match to the 2014 baseline of any candidate checked this
session — no added/missing top-level field was found (unlike SF1's
"Learning Modality" addition). `FidelityState::StructureVerified`.

## Next step

The NLPA/NLS pandemic-era column-naming question (noted above) applies
to **SF4**, not this SF2 candidate directly — see
`docs/form-evidence/sf4/README.md`'s own updated comparison, which
found the SF4 candidate does use a "NLPA"-shaped column, consistent
with DM 014, s. 2021's reported change. DepEd Order No. 11, s. 2018
remains unread in primary form for this form's own checking-process
context.
