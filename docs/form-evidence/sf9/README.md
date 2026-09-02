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
  `docs/form-evidence/esf7/README.md`). **Re-checked 2026-09-02, still
  unresolved**: a second WebSearch pass found only the same Caloocan
  Division source, no independent national-level citation.
- **New this pass**: `depedtambayanph.net` hosts downloadable SF9
  templates explicitly labeled "DO 15 s. 2026" for two grade bands —
  "Grade 1, 2, and 3" and "Grades 4, 5, and 6" (dated August 2026,
  after DO 015 s.2026's confirmed issuance). This is independent
  confirmation that **current, actively-circulated 2026 SF9 templates
  are explicitly tied to DO 015 s.2026** (matches this project's own
  primary-source read of DO 015's Annex C/F naming SF9 as "the
  Learner's Progress Report") — but these are third-party redistributed
  files, not deped.gov.ph/LIS-support-portal originals, and were not
  compared cell-by-cell against this project's three candidate files.
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

## ⚠️ Important findings: two separate 2026 DepEd Orders — now primary-source confirmed

Neither previously on this project's radar. Both orders' full text was
read directly this session from owner-supplied primary-source PDFs
(`ProvenanceState::AuthoritativeSourceConfirmed` for both orders
themselves). Full record: `docs/form-evidence/grading-2026-orders/README.md`.

- **DepEd Order No. 015, s. 2026** — revised classroom assessment/
  grading system. Confirmed: SF9 is explicitly named in this order's own
  text (Annex C, Annex F) as "the Learner's Progress Report (SF9)" — the
  KS1 reporting instrument tied directly to the order's descriptive
  five-level grading scale (Advancing/Benchmarking/Connecting/
  Developing/Emerging) and the PACE Form recording process.
- **DepEd Order No. 009, s. 2026** — a **separate** order establishing
  a new **three-term (trimestral) school calendar** for SY 2026-2027
  (specific term dates confirmed verbatim from the order's own Figure 3:
  June 8 - Sep 15 [69 days], Sep 16 - Dec 18 [65 days], Jan 4 - Apr 8
  [67 days], 201 class days total), replacing the prior quarterly/
  semestral structure, for all public elementary/secondary schools and
  CLCs.

Current (2026) SF9 templates found via search are explicitly described
as "three-term" under these two orders. **Whether our three candidate
files reflect the older quarterly structure or the new three-term
structure was not determined** — the earlier structural inspection
pass (sheet/merge/formula counts) did not specifically count term
columns. This must be checked by hand before any provenance/fidelity
work proceeds on these candidates.

**Broader implication for the project, resolved, not just flagged**:
`grading`/`grading_computation` already implements the three-term model
(see the correction in `docs/form-evidence/grading-2026-orders/README.md`
— this was implemented in M11/M13, not a new gap). No further action
needed there from this SF9 work specifically.

## Term-column structure: inspected and confirmed three-term (2026-09-02)

Direct structural inspection (`openpyxl`, full-workbook cell scan for
"quarter"/"term" text) of all three original candidate files: **all
three use "Term 1" / "Term 2" / "Term 3" column headers throughout**
(the `SF9-Back (A5)` and `SF9` sheets in every variant, plus the
`HELPER` sheet in both SHS variants). **No "quarter" terminology appears
anywhere in any of the three files.** This directly answers the
previously-open question: these three candidates already reflect the
**post-reform, three-term structure** DO 009 s.2026 establishes for SY
2026-2027 — they are not stale quarterly-era templates. This is
independent structural evidence (not just naming/citation
corroboration) that the candidates are recent, matching the
`depedtambayanph.net` "DO 15 s. 2026"-labeled redistributions noted
above.

## Classification, per variant

All three candidate template files: **upgraded from `CandidateUnverified`
on the term-structure question** — that specific question (quarterly vs.
three-term) is now resolved by direct inspection, confirmed three-term.
**Still `CandidateUnverified` overall**: "DM 576/577 s.2026"'s
national-vs-division status remains unconfirmed (re-checked this
session, still only a Division source found), and no primary DepEd
source (national or LIS-support-portal) was directly read to confirm
these exact files — as opposed to their term-structure and DO-015-era
grading-scale shape — are the official current template. The
**governing orders themselves** (DO 015 s.2026 and DO 009 s.2026) are
`AuthoritativeSourceConfirmed`.

## Next step

Confirm DM 576/577 s.2026's national-vs-division status and read its
primary text, once egress access allows it or the owner supplies the
memo directly — this is now the single remaining gap for these three
candidates (term structure and grading-order tie-in are both resolved).
