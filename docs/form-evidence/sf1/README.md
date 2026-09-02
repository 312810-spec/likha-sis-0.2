# SF1 Template Evidence (2026-09-02)

Narrow form-evidence record for the School Form 1 (SF1) "School Register"
template candidate acquired 2026-09-02. Kept out of `docs/PROJECT-MEMORY.md`
deliberately (no large workbook reverse-engineering in project memory —
citations/provenance only), matching `docs/form-evidence/sf10/README.md`'s
convention.

**Status**: `ProvenanceState::CandidateUnverified`, `FidelityState::StructureVerified`
(updated 2026-09-02 — see the structural comparison below; the
candidate file's own provenance is still unconfirmed, but its structure
has now genuinely been checked against a primary source).

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

## Governing issuance — now primary-source confirmed (2026-09-02)

**DepEd Order No. 4, s. 2014** — "Adoption of the Modified School Forms
(SFs) for Public Elementary and Secondary Schools, Effective End of
School Year 2013-2014" (January 30, 2014), signed by Br. Armin A.
Luistro FSC, Secretary. The project owner supplied a primary-source
PDF directly (a Division-disseminated copy carrying the order itself);
full detail in the shared record: `docs/form-evidence/do4-s2014/README.md`
(`ProvenanceState::AuthoritativeSourceConfirmed` for the order itself).
SF1 = "School Register," replacing old Form 1 (Master List) and STS
Form 2 (Family Background and Profile).

**Possible later revision, still not fully resolved**: search snippets
reference an "Updated SF1, SF2 and SF3" release dated September 28,
2022 on `support.lis.deped.gov.ph`, with no specific DepEd Order/
Memorandum number identified for it. The candidate's `ver2014.2.1.1`
version string names the 2014 base but does not by itself confirm
which later revision (if any) it reflects — the structural comparison
below suggests it reflects _some_ revision beyond the pure 2014
baseline, though not necessarily this specific 2022 one.

## Structural comparison against DO 4 s.2014's Enclosure No. 2 (2026-09-02)

Direct field-by-field comparison of the candidate's actual header row
against the order's own primary-source field list
(`docs/form-evidence/do4-s2014/README.md`'s SF1 section):

- **Matches**: LRN, Name, Sex, Birth Date, Age as of 1st Friday June,
  Mother Tongue, IP (Ethnic Group), Religion, full Address block
  (House#/Street/Sitio/Purok, Barangay, Municipality/City, Province),
  Parents (Father's Name, Mother's Maiden Name), Guardian (Name,
  Relationship), Contact Number, Remarks — all present in the candidate
  exactly as the 2014 order's Enclosure 2 describes them.
- **Difference 1 — an added field**: the candidate has a **"Learning
  Modality"** column that does **not** appear anywhere in DO 4 s.2014's
  own Enclosure 2 field list. This is very likely a pandemic-era
  addition (Distance/Blended/In-Person Learning categorization became
  relevant from SY 2020-2021 onward, well after this 2014 order), from
  a later, unidentified issuance — not chased down further this
  session.
- **Difference 2 — a field the candidate's header row doesn't carry
  explicitly**: DO 4's Enclosure 2 lists **"Place of Birth (Province)"**
  as its own numbered field (#10); the candidate's header row does not
  show it as a separate labeled column (it may be folded into the
  Address block, or genuinely dropped — not disambiguated from the
  header text alone this session).
- The candidate also carries **"(Grade 1 to 3 Only)"** as a qualifier
  on Mother Tongue — the 2014 order's own field description does not
  state this grade restriction, though it is consistent with how
  Mother-Tongue-Based Multilingual Education is generally scoped in
  DepEd policy (K-3), so this reads as an accurate practical
  clarification rather than a genuine structural discrepancy.

## Classification

**Governing order: `ProvenanceState::AuthoritativeSourceConfirmed`**
(see the shared record). **This specific candidate file: still
`ProvenanceState::CandidateUnverified`** — the comparison above shows
real, specific overlap with DO 4 s.2014 plus at least one clear
post-2014 addition, which is evidence the file is a maintained
descendant of the 2014 form rather than an unrelated community
fabrication, but does not by itself confirm the file is DepEd's own
current official artifact (as opposed to a community-maintained
version incorporating real, but unidentified, later changes).
`FidelityState::StructureVerified` — a genuine field-by-field structural
check was performed, with disclosed results (not a clean pass).

## Next step

Identify the specific issuance that added "Learning Modality" to SF1
(a candidate: DepEd's pandemic-era Basic Education Learning Continuity
Plan issuances, unconfirmed) and resolve whether "Place of Birth" was
genuinely dropped or just visually folded into the Address block —
neither pursued this session. DepEd Order No. 11, s. 2018 (the SCC/DCC
checking-process order, relevant to this form's validation workflow)
also remains unread in primary form.
