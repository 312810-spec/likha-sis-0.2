# SF2 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 2 (SF2) "Daily
Attendance Report of Learners" template candidate acquired 2026-09-02.
See `docs/form-evidence/sf1/README.md` for this session's shared
network-egress limitation note (applies identically here).

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::NotVerified`.

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

## Governing issuance (found, not primary-source-read)

Same founding order as SF1: **DepEd Order No. 4, s. 2014**. SF2 =
"Daily Attendance Report of Learners," replacing old Form 1, Form 2, and
STS Form 4 (Absenteeism and Dropout Profile).

**Confirmed later revisions (search-corroborated, not primary-read)**:

- **DepEd Memorandum No. 014, s. 2021** (March 26, 2021) — pandemic-era
  interim guidelines; changed SF4's "Dropout" column to "NLPA" (No
  Longer Participating in Learning Activities) and shifted submission
  cadence — explicitly scoped as SY 2020-2021 only, by its own title.
- A September 2022 "Updated SF1, SF2 and SF3" template refresh on
  `support.lis.deped.gov.ph` (no specific order number confirmed).
- A 2026-era secondary source suggests "NLPA" is being reverted to "NLS"
  (No Longer in School) post-pandemic — order number not confirmed.

## Classification

**NOT CONFIRMABLE FROM AVAILABLE SOURCES.** Same reasoning as SF1: a
real founding order exists and is well-corroborated, but the exact
candidate version string is not tied to any citable primary source in
this session, and the template has plausibly been revised at least
twice since 2014 (2021 pandemic interim, 2022 refresh) — whether the
candidate reflects the current official shape is unconfirmed.

## Next step

Same as SF1 — needs a session with working `deped.gov.ph`/LIS-portal
fetch access. Additionally worth checking directly: whether the
pandemic-era NLPA/NLS column naming has been finally settled, since
that affects the candidate's currency independent of provenance.
