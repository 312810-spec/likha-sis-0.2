# SF10 Template Evidence (Wave 2M)

Narrow form-evidence record for the SF10 (Learner's Permanent Academic
Record, formerly Form 137) template candidates acquired 2026-08-27.
Kept out of `docs/PROJECT-MEMORY.md` deliberately (Wave 2M step 16 — no
large workbook reverse-engineering in project memory).

**Status: every candidate is `ProvenanceState::CandidateUnverified` /
`FidelityState::NotVerified`.** None was promoted. Portal hosting on a
`*.deped.gov.ph` subdomain is provenance evidence, not proof of
governing applicability.

## Acquisition

- Acquired by: `curl -sSL` from
  `https://support.lis.deped.gov.ph/support/downloads/schoolforms/`
  (DepEd Learner Information System support portal — a verified
  `*.deped.gov.ph` subdomain), 2026-08-27.
- Server: `nginx/1.20.1`. All four returned `HTTP 200`,
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Immutable copies kept in the session scratchpad **outside** the repo
  and outside `src-tauri/resources/` (Wave 2M step 3 / ADR-0051 "what
  belongs in Git" — the workbook bytes are a separate redistribution
  judgment, not made; only hashes + structure are committed).
- The originals were not altered.

## Candidate manifest

| #   | File (original name)                                                                    | Size (bytes) | SHA-256                                                            | Last-Modified (HTTP)                                  | Sheets                              |
| --- | --------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------- |
| 1   | `SSHS SF 10 v2026.xlsx`                                                                 | 227334       | `a08ae34ba7f8e54d19389ba45c61d0ce18b347d877bcd8dd796d66c372ce6774` | Tue, 17 Mar 2026 03:45:55 GMT (ETag `69b8ce73-37806`) | FRONT, BACK, ANNEX, HELPER_SUBJECTS |
| 2   | `School-Form-10-JHS-Learners-Academic Permanent-Record_26March2025.xlsx`                | 96335        | `1c7a9430cb2e967f0d6b9fca003205568c7d84b67ce5048a655385f22ab9676e` | Sat, 05 Apr 2025 05:43:17 GMT (ETag `67f0c2f5-1784f`) | Front, "SirWedz Guides", Back       |
| 3   | `School Form 10 SF10 Learner's Permanent Academic Record for Junior High School_3.xlsx` | 66371        | `a0af662f6dc671e0bf0c7d06e444458492317040e925fafc52dbb42c485ee583` | (not captured)                                        | front, back, Sheet3                 |
| 4   | `School-Form-10-SF10-Learners-Permanent-Academic-Record-for-Junior-High-School.xlsx`    | 96785        | `cbed9d14d80b3e32c4b4f5e8a909a31c360d709bdddaed1ca56b37f86a086e1d` | (not captured)                                        | Front, "SirWedz Guides", Back       |

## Structural findings (`cargo run --example inspect_template_candidate`)

### #1 — `SSHS SF 10 v2026.xlsx` (Strengthened SHS)

- Workbook-level named ranges: 0. Macro project: none (plain `.xlsx`).
- `FRONT`: used 33×132, merges 298, **formulas 344**, sheet defined
  names 2 (`_xlnm._FilterDatabase` FRONT!$C$22:$L$23, `_xlnm.Print_Area`
  FRONT!$A$1:$Y$124), **data validations 4**, hidden cols 16356,
  hidden rows 7, portrait, page scale 68.
- `BACK`: used 32×130, merges 244, formulas 339, `_xlnm.Print_Area`
  BACK!$A$1:$Y$118, data validations 2, portrait, scale 70.
- `ANNEX`: used 10×62, merges 37, formulas 94, `_xlnm.Print_Area`
  ANNEX!$A$1:$H$61, data validations 3, portrait.
- `HELPER_SUBJECTS`: used 35×138, merges 0, formulas 539, no defined
  names, hidden rows 1, hidden cols 29 — a computation helper sheet.
- Cleanest of the four: no community-annotation sheet; consistent with
  a March-2026 DepEd release.

### #2 / #4 — JHS `_26March2025` and base JHS

- Both: sheets `Front` / **`SirWedz Guides`** / `Back`; **zero
  formulas**; `_xlnm.Print_Area` on Front and Back; used ~56 cols ×
  84-95 rows; merges 386-482; hidden cols 16328; portrait, scale
  70-77; no data validation; no workbook named ranges.
- **`SirWedz Guides` is a non-DepEd worksheet** (a known Filipino
  teacher-blogger's annotation). These are community-touched copies
  redistributed via the official portal, not confirmed pristine DepEd
  masters.

### #3 — JHS `_3`

- Sheets `front` / `back` / `Sheet3` (empty leftover). Zero formulas,
  no print areas, no data validation. Looks like a stripped re-save.

## Governing-issuance research

Primary-source (deped.gov.ph) confirmations:

- **DepEd Memorandum No. 020, s. 2026** — "Modified Electronic Class
  Record and School Form 10 for Strengthened Senior High School Pilot
  Implementers in School Year 2025-2026", issued **13 March 2026**.
  Official page:
  `https://www.deped.gov.ph/2026/03/13/march-13-2026-dm-020-s-2026-modified-electronic-class-record-and-school-form-10-for-strengthened-senior-high-school-pilot-implementers-in-school-year-2025-2026/`
  ; PDF `https://www.deped.gov.ph/wp-content/uploads/DM_s2026_020r-1.pdf`.
  **The memo body could not be read** — the PDF is a scanned image with
  no text layer and the frozen harness has no OCR. So: the issuance
  _exists_ and its scope (SHS, Strengthened SHS pilot, SY 2025-2026) is
  confirmed from the official page, but the file-to-issuance binding
  (are these exact bytes the "corrected copy" it distributes?), the
  exact field prescriptions, and any Academic-vs-TechPro template split
  are **unconfirmed**. This is a strong LEAD, not a promotion basis.
- **DepEd Order No. 69, s. 2016** — "Provision of the DepEd Electronic
  Class Record and Form 137 for Senior High School" (22 Nov 2016).
  Official page + PDF on deped.gov.ph. The standing pre-Strengthened
  SHS SF10/Form 137 for SHS.
- **DepEd Order No. 4, s. 2014** — "Adoption of Modified School Forms"
  — the foundational SF1-SF10 issuance (already cited in this project's
  ADR-0009 for SF2).

Secondary-source only (NOT authority-confirmed):

- Strengthened SHS Curriculum: DepEd Order No. 03, s. 2025 + DM No.
  048, s. 2025 — two pathways, Academic Track and Technical-Professional
  (TechPro) Track, from SY 2025-2026.
- The JHS SF10 candidates are described by third parties as the
  "revised SF10 for EOSY 2024-2025 / 2025-2026 under the MATATAG
  Curriculum", distributed via the LIS Support page. **No single
  governing DepEd Order/Memorandum was pinned** for the JHS revision
  this wave.

## Unresolved authority gaps (carried to `docs/VERIFICATION-DEBT.md`)

1. DM 020, s. 2026 body unread (scanned PDF, no OCR) — file↔issuance
   binding, exact fields, track split, non-pilot fallback all
   unconfirmed.
2. No governing issuance pinned for the JHS MATATAG SF10 revision.
3. JHS candidates are community-annotated ("SirWedz Guides") — a
   pristine DepEd JHS SF10 master has not been located.
4. Pre-MATATAG / DO 69 s. 2016 / DO 4 s. 2014 era SF10 templates: not
   acquired this wave (no candidate file, only the issuance citations).
5. Internal cell/title text of every candidate: not transcribed
   (Wave 2M did structural inspection only; no field-level mapping).
6. Render fidelity of any SF10 output: `NotVerified` — no SF10
   generator exists and none was built (Wave 2M step 12).
