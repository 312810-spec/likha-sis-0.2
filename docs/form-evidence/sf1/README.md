# SF1 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 1 (SF1) "School Register"
template candidate acquired 2026-09-02. Kept out of `docs/PROJECT-MEMORY.md`
deliberately (no large workbook reverse-engineering in project memory —
citations/provenance only), matching `docs/form-evidence/sf10/README.md`'s
convention.

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::NotVerified`.

## Candidate

One user-supplied file, `SF1.xls` (legacy BIFF `.xls`, sheet
`school_form_1_ver2014.2.1.1`). SHA-256: `0397c1fa7d42512ec3379e3aadc0f8ba03b995f9f236f23b0e6f3db1650578e1`.
Structurally a blank template (63 non-empty cells, all header/label text,
no learner data) — verified clean of PII via full-cell scan
(`xlrd`) before this record was written. The file itself is **not**
committed to this repository (matches this project's established
convention — see `docs/form-evidence/sf10/README.md`'s own note on this).

## Environment limitation (applies to every form evidence file added this

## session — recorded once here, referenced by the others)

This session's network egress proxy blocked `WebFetch`/direct HTTP access
to essentially every external domain tested, including `deped.gov.ph`,
`support.lis.deped.gov.ph`, DepEd regional/division sites, and even
`en.wikipedia.org` as a control — confirmed via the proxy's own
`/__agentproxy/status` diagnostic, which classified these as
organization-policy denials (403), not transient failures. Per the
proxy's own documented guidance, this is not something to retry or route
around. Only `WebSearch` (a separate, non-proxied backend) was reachable.

**Consequence for every provenance finding below**: everything is built
from WebSearch result snippets/AI-summarized excerpts of primary and
secondary sources, not from directly opening and reading a primary
DepEd page or PDF. This is a materially weaker evidentiary basis than
prior waves (e.g. Wave 2N's SF10 SSHS confirmation, which used a direct
`curl` fetch + `pdftotext` read of the actual DM 020 PDF). No candidate
in this session's batch is promoted past `CandidateUnverified` /
`NOT CONFIRMABLE FROM AVAILABLE SOURCES` as a result — this is a
disclosed research-tooling gap, not a finding that the sources don't
exist. **Revisit with working egress to `deped.gov.ph` before promoting
any of this session's candidates.**

## Governing issuance (found, not primary-source-read)

**DepEd Order No. 4, s. 2014** — "Adoption of the Modified School Forms
(SFs) for Public Elementary and Secondary Schools, Effective End of
School Year 2013-2014" (January 30, 2014). This is the same founding
order for SF1 through SF7 (all of this session's candidates trace to
it). Per WebSearch-snippet synthesis (not a verbatim primary read):
consolidated 16 legacy forms into 7 modified forms; SF1 = "School
Register — Master List of Learners"; effective full adoption by all
public elementary/secondary schools SY 2014-2015; prepared by the class
adviser via LIS at the beginning of the school year.

Primary URL (not fetched this session):
`https://www.deped.gov.ph/2014/01/30/do-4-s-2014-adoption-of-the-modified-school-forms-sfs-for-public-elementary-and-secondary-schools-eeffective-end-of-school-year-2013-2014/`

**Possible later revision, unconfirmed**: search snippets reference an
"Updated SF1, SF2 and SF3" release dated September 28, 2022 on
`support.lis.deped.gov.ph`, with no specific DepEd Order/Memorandum
number identified for it. The candidate's `ver2014.2.1.1` version string
is consistent with the original 2014 rollout, not this 2022 update — it
is not established whether the candidate reflects a current or
superseded template shape.

## Classification

**NOT CONFIRMABLE FROM AVAILABLE SOURCES.** A governing founding order
(DO 4, s. 2014) is identified with reasonable confidence via multiple
independent secondary corroborations, but no source — primary or
secondary — ties the exact candidate version string
`school_form_1_ver2014.2.1.1` to an official DepEd citation, and the
primary source itself could not be read this session. The only exact
match for that literal version string anywhere search could find is a
teacher-submitted **filled-in sample data file** on Scribd (community/
secondary, not a blank official template).

## Next step

A session with working `deped.gov.ph`/`support.lis.deped.gov.ph` fetch
access should directly read DO 4, s. 2014's text and the LIS support
portal's downloads/changelog page to confirm or refute this candidate's
exact provenance.
