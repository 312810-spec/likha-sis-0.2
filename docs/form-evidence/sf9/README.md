# SF9 Template Evidence (2026-09-02)

Narrow form-evidence record for three School Form 9 (SF9) "Learner's
Progress Report Card" template candidates acquired 2026-09-02. See
`docs/form-evidence/sf1/README.md` for this session's shared
network-egress limitation note (applies identically here).

**Status (all three variants)**: `ProvenanceState::CandidateUnverified`,
`FidelityState::NotVerified`.

**Prior project context**: ADR-0049 (2026-08-27) previously searched for
an authoritative SF9 template and found none — classified COMMUNITY/
UNVERIFIED. This record supersedes that with materially stronger (but
still not primary-source-confirmed) evidence.

## Candidates

1. **SF9 Grade 7-10 (JHS)** — `.xlsx`, sheets `SF9-Front (A5)`,
   `SF9-Back (A5)`, `SF9`. SHA-256:
   `fc122302055cecbd2a13d0c9dd5fcc9454ff034a7f04e526a6735563c2596aa0`.
2. **SF9 Grade 11 TechPro** — `.xlsx`, same sheet shape plus a `HELPER`
   sheet (`AcademicElectiveTerms`, `DESCRIPTOR` defined names). SHA-256:
   `3a8fc86555eabe7c695351657752fa1096b4975ab0a892143a1148fc82cbfdd3`.
3. **SF9 Grade 11 Academic** — `.xlsx`, same shape as #2. SHA-256:
   `acb1ced2cdd4164d911cd45295589d84a9abaa9ec4380e211b88e45e44c00f0d`.

All three structurally blank templates (321-1670 non-empty cells,
signature-line labels only, no filled learner/parent names) — verified
clean of PII.

## Governing issuances (found, not primary-source-read)

- **DepEd Order No. 4, s. 2014** — founding order for SF9's existence.
- **DepEd Order No. 010, s. 2024** (MATATAG curriculum, already
  primary-source-confirmed elsewhere in this project — see ADR-0053) —
  relevant to the JHS variant's grading/subject structure.
- **DepEd Memorandum No. 576, s. 2026** — "Dissemination and Use of the
  Editable School Form 9 (SF9) or Learner's Progress Report Card
  Templates," with an addendum **DM No. 577, s. 2026**. Found via a
  Division re-post (depedcaloocan.com) — whether "576"/"577" are
  national central-office numbers or a Division's own tracking numbers
  re-issuing a central memo was **not confirmed** this session (the
  same ambiguity found for eSF7's Division-level memo numbers — see
  `docs/form-evidence/esf7/README.md`).
- Grade-band/track-specific templates matching our exact candidate
  shapes are described in multiple independent secondary sources:
  Grades 4-6, Grades 7-10 (JHS), and — **strong structural
  corroboration** — a documented Grade 11 Academic Track vs. Grade 11
  TechPro Track split, matching our two SHS candidates exactly, with
  the TechPro variant described as retaining Strengthened SHS core
  subjects while adding "configurable fields for the school's actual
  TechPro Elective." This aligns precisely with the `HELPER` sheet's
  `AcademicElectiveTerms`/`DESCRIPTOR` defined names found in both SHS
  candidates during structural inspection.

## ⚠️ Important new findings: two separate 2026 DepEd Orders, unread

Neither previously on this project's radar:

- **DepEd Order No. 015, s. 2026** — revised classroom assessment/
  grading system (see `docs/form-evidence/sf5/README.md` for the same
  flag raised independently there).
- **DepEd Order No. 009, s. 2026** — a **separate** order establishing
  a new **three-term (trimestral) school calendar** for SY 2026-2027,
  replacing the prior quarterly/semestral structure.

Current (2026) SF9 templates found via search are explicitly described
as "three-term" under these two orders. **Whether our three candidate
files reflect the older quarterly structure or the new three-term
structure was not determined** — the earlier structural inspection
pass (sheet/merge/formula counts) did not specifically count term
columns. This must be checked by hand before any provenance/fidelity
work proceeds on these candidates.

**Broader implication, flagged for the project owner, not just this
form's evidence record**: if DO 009 s.2026 replaces the quarterly/
semestral calendar with a three-term one, LIKHA-SIS's own
`grading`/`grading_computation` domain modules — built around a
grading-_period_ concept — may need re-examination for SY 2026-2027
onward. This is a new finding outside this research task's original
scope. See `docs/CURRENT-HANDOFF.md`.

## Classification, per variant

All three: **NOT CONFIRMABLE FROM AVAILABLE SOURCES.** Real progress
since ADR-0049 (a plausible governing DM was found, and the
Academic/TechPro split is now well-corroborated structurally), but no
primary-source text was read, "DM 576/577 s.2026"'s national-vs-
division status is unconfirmed, and the candidates' term structure
relative to DO 015/DO 009 s.2026 is unverified.

## Next step

1. Confirm DM 576/577 s.2026's national-vs-division status and read its
   primary text.
2. Read DO 015 s.2026 and DO 009 s.2026 primary text — high priority,
   given the possible impact on this project's core grading-period
   model.
3. Manually inspect the three candidates' term-column structure
   (quarterly vs. three-term) against whatever DO 009 s.2026 actually
   specifies.
