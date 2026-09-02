# eSF7 Template Evidence (2026-09-02)

Narrow form-evidence record for the eSF7 "School Form 7 (SF7) School
Personnel Assignment List and Basic Profile" candidate acquired
2026-09-02. See `docs/form-evidence/sf1/README.md` for this session's
shared network-egress limitation note (applies identically here).

**Status**: the underlying SF7/eSF7 _requirement_ is
`ProvenanceState::AuthoritativeSourceConfirmed`-eligible in principle
(see below); this **specific candidate file** is
`ProvenanceState::CandidateUnverified`, `FidelityState::NotVerified`.

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
  SF5/SF6). Established SF7 = "School Personnel Assignment List and
  Basic Profile," replacing old Forms 12, 19, 29, and 31.
- **DepEd Memorandum No. 052, s. 2023** (September 5, 2023, signed by
  Undersecretary Gloria Jumamil-Mercado) — "Adoption of the DepEd
  Electronic School Form 7 (eSF7)." Per search-corroborated summary
  (not primary-read): adopted by all public schools effective SY
  2023-2024; the accomplishment of the electronic form is the School
  Head's responsibility, explicitly "in adherence to DO 4, s. 2014."
- **DM-OUHROD-2024-3470** — "Issuance and Adoption of the Revised
  Electronic School Form 7 (ESF7) Tool Starting School Year 2024-2025,"
  issued by the Office of the Undersecretary for Human Resource and
  Organizational Development (OUHROD) — revises the DM 052 s.2023 tool.
  Disseminated to Divisions December 2024, orientations early 2025.
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

**(a) The base SF7 reporting requirement**: CONFIRMABLE AS
AUTHORITATIVE — DepEd Order No. 4, s. 2014, corroborated consistently
and specifically (what it replaced, who's accountable).

**(b) eSF7 as a national DepEd tool/mandate**: CONFIRMABLE AS
AUTHORITATIVE — DM No. 052, s. 2023 and its central-office revision
DM-OUHROD-2024-3470, both corroborated by multiple independent Division
re-issuances that consistently cite them.

**(c) This specific "UPDATED eSF7 RSDO" file**: **NOT CONFIRMABLE FROM
AVAILABLE SOURCES as the unmodified national central-office artifact.**
"RSDO" matches no documented official filename convention, and Division-
level customization of eSF7 is a confirmed real practice — this file
may be an accurate, faithful copy, or may carry Division-specific
modifications; neither can be established from available sources this
session.

## Next step

With working egress: (1) read DM 052 s.2023 and DM-OUHROD-2024-3470
primary text directly; (2) attempt to resolve the central `bit.ly/eSF7`
download link (found via search, not resolved this session) and diff it
against this candidate; (3) identify which specific Region/Division
"RSDO" refers to, if it is in fact a regional tag, to assess how much
local customization (if any) this candidate carries relative to the
national release.
