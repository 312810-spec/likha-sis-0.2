# eSF7 Template Evidence (2026-09-02)

Narrow form-evidence record for the eSF7 "School Form 7 (SF7) School
Personnel Assignment List and Basic Profile" candidate acquired
2026-09-02. See `docs/form-evidence/sf1/README.md` for this session's
shared network-egress limitation note (applies identically here).

**Status** (updated 2026-09-02): the underlying SF7/eSF7 _requirement_
is `ProvenanceState::AuthoritativeSourceConfirmed` — DO 4 s.2014 and
DM 052 s.2023 both read directly this session (see below); this
**specific candidate file** is still `ProvenanceState::CandidateUnverified`,
`FidelityState::NotVerified` (no field-by-field baseline exists yet to
run a structural comparison against, unlike SF1-SF6).

## Candidate

One user-supplied file, `UPDATED_eSF7RSDO_SchoolID_SchoolName_SY2025-2026_1.xlsb`
(macro-enabled binary workbook; sheets DB_USER, IMPORTANT, REFERENCE,
SCHOOL_DASHBOARD, USERFORM, VERIFICATION, VIEW). SHA-256:
`4ec0ef2b0b6a879ef45f5724bb2ace5a3fdfc776aa8c2ceea5dbfc9d0e48d064`.
Structurally a blank template (34,427 non-empty cells, but the large
majority are REFERENCE-sheet lookup lists — job-title dropdowns, ethnic
groups, region names, etc. — not filled personnel data; the VIEW sheet
where actual entries would render is entirely zero-valued) — verified
clean of PII in cell content across the whole workbook, not just a
sample.

**Correction (2026-09-02, later same day)**: the original "verified
clean of PII" claim above covered cell content only, not document
metadata — a real methodology gap, not specific to this file (checked
retroactively across all 11 of this session's candidates, see below).
The file's `docProps/core.xml` carried a real, non-self-credited name
in its `lastModifiedBy` field (distinct from the `dc:creator` field,
which held what looks like a username/ID code, not a personal name).
Unlike the SF9/SF10 candidates' metadata (see their own evidence
files — self-credited template authorship, not a live-record leak),
this name had no such context. **Redacted with the project owner's
explicit authorization**: a working copy (`eSF7_redacted.xlsb`, session
scratchpad only, not committed) has both the `dc:creator` and
`cp:lastModifiedBy` fields blanked, verified empty by re-reading the
zip's `docProps/core.xml` after the edit. The original as-uploaded file
is untouched and, per this project's standing convention, was never
committed. All 5 `.xls` candidates (SF1/SF2/SF4/SF5/SF6) were also
checked (OLE `SummaryInformation` stream via `olefile`) and carry only
the project owner's own name in `last_saved_by` — no third-party PII
found there.

## Two distinct issuances: paper SF7 vs. electronic eSF7

- **DepEd Order No. 4, s. 2014** — founding order (same as SF1/SF2/SF4/
  SF5/SF6, now primary-source confirmed —
  `docs/form-evidence/do4-s2014/README.md`). Established SF7 = "School
  Personnel Assignment List and Basic Profile," replacing old Forms 12,
  19, 29, and 31.
- **DepEd Memorandum No. 052, s. 2023 — now primary-source confirmed
  (2026-09-02)**. The project owner supplied a primary-source PDF
  directly (a Schools Division of Misamis Oriental dissemination memo,
  DM No. 523, s. 2023, September 7, 2023, signed by Schools Division
  Superintendent Edilberto L. Oplenaria, with the actual national
  memorandum attached in full). **"ADOPTION OF THE DEPED ELECTRONIC
  SCHOOL FORM 7 (eSF7)"** — DepEd Memorandum No. 052, s. 2023, dated
  **SEP 05 2023**, issued "By Authority of the Secretary" and signed by
  **Gloria Jumamil-Mercado, Undersecretary**. References: DepEd Order
  Nos. 4, s. 2014 and 58, s. 2017. `ProvenanceState::AuthoritativeSourceConfirmed`.
  Key confirmed facts:
  - Effective **SY 2023-2024**, adopted by all public schools, as part
    of the MATATAG Agenda's digitization commitment.
  - Para 6 (verbatim): "In adherence to DO 4, s. 2014, the
    accomplishment of this electronic form is the primary
    responsibility and accountability of the **School Head**." Matches
    this project's earlier search-only finding exactly.
  - Para 7: official download at `bit.ly/eSF7` (a data-consolidator
    template for Division use is at the same link) — a live, specific
    URL, not resolved/fetched this session (still egress-blocked).
  - Para 9: **eSF7's commercialization is "highly discouraged"** —
    explicitly cautions against selling digitized copies of this form
    "as well as other modified school forms released through DO 4,
    s. 2014 and DO 58, s. 2017." Directly relevant to this candidate's
    own provenance question (below).
  - Enclosure (General Guidelines): accomplished at BoSY by the School
    Head (non-teaching personnel may assist); **Senior High Schools
    also resubmit at the start of the Second Semester (Third Grading
    Period)**; updated on any personnel movement; personnel
    auto-ranked highest-to-lowest; **one eSF7 per School ID** (an
    integrated school does not file separately per level); shared-
    service non-teaching personnel are recorded in their "mother
    school only"; submitted as both the Excel file and a School-Head-
    signed scanned PDF to the Division Office by the fourth Friday
    from the opening of classes.
- **DM-OUHROD-2024-3470** — "Issuance and Adoption of the Revised
  Electronic School Form 7 (ESF7) Tool Starting School Year 2024-2025,"
  issued by the Office of the Undersecretary for Human Resource and
  Organizational Development (OUHROD) — revises the DM 052 s.2023 tool.
  **Still not primary-text-read** (only DM 052 s.2023 was supplied in
  full; this later memo's own body text has not been seen), but its
  existence, exact title, and SY 2024-2025 scope are now corroborated
  by a **second, independent Division source**: DepEd City Schools
  Division of Dasmariñas, Division Memorandum No. 078, s. 2025 (January
  24, 2025, signed by OIC-Schools Division Superintendent Elias A.
  Alicaya, Jr.), disseminating an orientation on this exact memo,
  quoting its title verbatim and confirming it "aims to streamline and
  simplify processes in accomplishing reports in relation to
  school-based workforce management." This is a genuinely independent
  second Division (Cavite, vs. the earlier-known ones), strengthening
  confidence in the citation without yet being a primary read of the
  memo's own content/revisions.
- Continuing yearly Division-level submission memos (Zambales DM 254
  s.2025, DepEd Dasmariñas DM 495 s.2025/DM 338 s.2026, DepEd Lapu-Lapu
  DM 336 s.2026) confirm eSF7 continues under SY 2025-2026, now
  submitted through an "InsightED" platform, in `.xlsb` format
  specifically — matching the candidate's own format exactly.

## What "RSDO" means — still unresolved, now checked from inside the file too

No source found (primary or secondary) explicitly defines "RSDO" in a
DepEd context. **Checked further, 2026-09-02**: the string "RSDO" does
not appear anywhere inside the workbook itself — not in any cell across
any of the 7 sheets (full-text cell scan via `pyxlsb`), and not in the
extracted OOXML-package XML parts (`docProps/core.xml`, `app.xml`, or
any other part) either. This rules out "RSDO" being a built-in
tool-internal label (e.g. a sheet name, a form title, an embedded
region code) and is consistent with the existing theory: it is a
filename-only tag, added when whoever redistributed this copy renamed
it, not part of the tool's own content. It does not, however, identify
_which_ Region/Division added it — the document metadata that might
have (author/company fields) did not contain the string either (see the
redaction note above; the metadata that did exist was unrelated to
"RSDO" and has since been removed from the working copy regardless).

The most plausible reading, from context only, remains "Region [and]
Schools Division Office" — i.e. this specific file was relabeled by a
Region/Division when redistributing the central-office tool, not an
official central-office filename component. Two documented _official_
filename patterns were found
(`eSF7_SDO<Name>_SchoolID_SchoolName_SY25-26` and
`ESF7_[SchoolCode]_2026`), and neither contains "RSDO." Divisions have
a confirmed, documented practice of publishing their own "revised
template" of eSF7 (e.g. a named Division Memorandum No. 65, s. 2025,
"Revised Template of the Electronic School Form 7 (ESF7)") — so a
region/division-labeled variant existing alongside the central tool is
expected, not unusual, in this ecosystem. **This remains a genuinely
open question, not one that further generic web search is likely to
resolve** — the next step that could actually answer it is either a
direct Region/Division-level source (e.g. searching a specific Region's
own site for "RSDO" once one is guessed) or asking whoever originally
supplied this file where they got it.

## Classification

**(a) The base SF7 reporting requirement**: `ProvenanceState::AuthoritativeSourceConfirmed`
— DepEd Order No. 4, s. 2014, read directly (`docs/form-evidence/do4-s2014/README.md`).

**(b) eSF7 as a national DepEd tool/mandate**: `ProvenanceState::AuthoritativeSourceConfirmed`
for **DM No. 052, s. 2023** (read directly this session, full text
above). **DM-OUHROD-2024-3470 remains `CandidateUnverified`-adjacent**
— its existence, title, and scope are now corroborated by two
independent Divisions (not just one), but its own body text is still
unread.

**(c) This specific "UPDATED eSF7 RSDO" file**: **still not confirmable
as the unmodified national central-office artifact**, but with a
narrower, more specific gap than before: DM 052 s.2023's General
Guidelines (now confirmed) describe the _process_ (who submits, when,
in what format) in detail, but not the _tool's own field layout_ — so
even with DM 052 s.2023 fully read, there is no primary field-by-field
description of eSF7 to compare this candidate against, unlike DO 4
s.2014's Enclosure 2 for SF1-SF7. "RSDO" still matches no documented
official filename convention (see above), and Division-level
customization of eSF7 is confirmed real practice by DM 052 s.2023's own
para 9 (which exists specifically to discourage commercialized/
unauthorized copies) — this file may be an accurate, faithful copy, or
may carry Division-specific modifications; neither can be established
from available sources this session.

## Next step

Two things remain open, both narrower than before: (1) DM-OUHROD-
2024-3470's own primary text — what specifically changed in the
"Revised" eSF7 Tool for SY 2024-2025, still unread; (2) resolving the
`bit.ly/eSF7` link (now confirmed as the actual current official
download location per DM 052 s.2023 para 7 itself, not just a search
result) to get a genuine field-by-field comparison baseline, the way
DO 4 s.2014's Enclosure 2 provided for SF1-SF7. "RSDO"'s specific
Region/Division origin remains unidentified and is not expected to
resolve from further generic search.
