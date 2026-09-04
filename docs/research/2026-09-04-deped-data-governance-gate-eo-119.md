# DepEd Data-Governance Gate — Cloudflare Workers + D1 for one school's learner PII

Research date: 2026-09-04. Prepared to close the ADR-0065 "decision-invalidating dependency" on
DepEd / Philippine government data-governance rules for offshore third-party cloud processing of
learner personal data (names, LRN, sex, attendance, grades) for a single DepEd public school.

---

## GATE VERDICT: CONDITIONAL — and non-compliant as literally specified today

Offshore processing of one school's learner personal data on a US-headquartered global edge
provider (Cloudflare Workers + a single Cloudflare D1 database) is **not prohibited outright** by
any DepEd issuance or by RA 10173 — the Data Privacy Act has **no data-localization mandate** and
its accountability principle expressly contemplates transfer of personal data to a processor
"whether domestically or internationally."

**However, the Cloudflare target as described in ADR-0065 (a single global/US D1, no Philippine
data-location pinning, no government engagement) does NOT currently satisfy Philippine
government-sector rules**, because of a new controlling instrument:

> **Executive Order No. 119, s. 2026** ("Updating the Government Data Classification, Establishing
> a Data Residency Framework, and for Other Purposes"), signed **13-14 July 2026**. It covers **all
> government data in digital form, including data processed or stored by private entities on behalf
> of a government agency** (procurement, service agreements, outsourcing contracts and cloud
> arrangements are named explicitly), **regardless of whether that data is personal data**. A
> DepEd public school is a government agency; LIKHA hosting its learner data on Cloudflare is a
> private entity processing government data on the agency's behalf, squarely inside EO 119's scope.

Under EO 119's residency rules the permissibility of offshore Cloudflare hosting depends entirely
on how the still-to-be-issued implementing guidelines classify a school's learner PII:

| EO 119 class        | Offshore / foreign-cloud storage rule                                                                                                                                        | Effect on Cloudflare plan                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Top Secret / Secret | Must be within Philippine territory (or PH embassies/consulates)                                                                                                             | Would BLOCK Cloudflare. Implausible for one school's roster.                            |
| **Confidential**    | Defaults to domestic storage; offshore storage or processing **only with prior approval of the Joint Oversight Committee** for Data Classification, plus security safeguards | **Effectively BLOCKED** until a government approval LIKHA cannot self-grant is obtained |
| **Restricted**      | May sit on secured cloud platforms **regardless of physical location**, subject to encryption, cybersecurity requirements and internationally recognized standards           | **CONDITIONALLY CLEAR** — achievable by LIKHA without a government gate                 |
| Open Access         | Secure cloud anywhere                                                                                                                                                        | Clear (not applicable to identifiable learner data)                                     |

Aggregated identifiable learner PII for a whole school — including sensitive personal information
(sex; health/nutrition data via School Form 8) — is realistically **"Confidential" or
"Restricted."** Which one is **not yet settled**: EO 119's implementing guidelines (due within
**120 days of signing, ~mid-November 2026**, from the Joint Oversight Committee co-chaired by DICT
and the National Security Council) will define the classification mapping for the education
sector / agency-held personal data and the exact residency rule. Until those guidelines exist, the
classification — and therefore whether offshore Cloudflare hosting needs formal JOC approval
(Confidential) or merely strong technical + contractual safeguards (Restricted) — is
**indeterminate**, and locking ADR-0065 to "Cloudflare Workers + single D1" now would be
committing to a design that may require government approval that does not yet have a process.

EO 119 also independently requires that **cross-border transfers of government data containing
personal or sensitive personal information carry protection "comparable to the DPA's standard,"**
and that **all government data remains subject to Philippine law and jurisdiction wherever it is
stored or processed.**

### Bottom line for the go/no-go

- **No** absolute DepEd or statutory prohibition on offshore/third-party cloud for learner data.
- **Yes**, hard prerequisites now exist (EO 119 + DPA + NPC rules). At least one plausible
  classification outcome (**Confidential**) makes the plan contingent on a **Joint Oversight
  Committee approval** — an external item only the government can provide, and whose process is not
  yet published. That is a genuine ADR-0065 invalidation trigger for the _current_ design.
- **Recommended posture:** treat the "single global/US D1" Cloudflare design as **not approvable
  as-is**. Either (a) re-scope sync to a **Philippines-hostable** option, or (b) keep Cloudflare
  only if the data location can be **contractually pinned to a Philippine (or, at most, ASEAN)
  region**, encryption/DPA-comparable safeguards are in place, the school executes an outsourcing
  agreement, DepEd is engaged, and — if the class turns out to be Confidential — JOC approval is
  obtained after the EO 119 IRR issues. Until the EO 119 implementing guidelines are published,
  prefer (a) or hold the decision.

---

## Prerequisites the eventual implementation + privacy notice MUST satisfy

Regardless of provider, if any learner personal data ever leaves the device to a cloud sync
target, all of the following must be true. (Items marked **[gov]** may require action outside
LIKHA's control and are the reason the gate is CONDITIONAL, not CLEAR.)

### A. Data Privacy Act (RA 10173) + IRR — processor / cross-border obligations

1. **Written outsourcing / subcontracting agreement** between the school (personal information
   controller) and the cloud provider / LIKHA operator as personal information processor,
   containing the IRR §43-44 stipulations: process only on the controller's documented
   instructions; confidentiality undertakings on all personnel; implement the required
   organizational, physical and technical security measures; no engagement of a sub-processor
   without authorization and equivalent obligations; assist the controller with data-subject
   rights; **breach notification to the controller without undue delay**; and return or
   documented destruction of all personal data at end of engagement.
2. **Accountability for the transfer (IRR §50 / DPA §21):** the school remains responsible for the
   data even though Cloudflare processes it abroad; it must be able to demonstrate that the
   processor provides a comparable level of protection.
3. **Cross-border transfer mechanism:** adopt the **NPC model contractual clauses for cross-border
   transfers** (NPC Advisory No. 2024-01, 30 May 2024) or equivalent binding safeguards in the
   processor agreement.
4. **Lawful basis + privacy notice:** the school's privacy notice to parents/learners must
   disclose that personal data is processed by a named third-party processor, that processing /
   storage occurs **outside the Philippines** (name the country/region), the purpose, the
   categories of data, the safeguards in place, retention period and secure disposal, and how to
   exercise data-subject rights. For minors, consent is exercised by the parent/guardian; consent
   is a fallback lawful basis — the school will more likely rely on its mandate / legal obligation
   for the core SIS records, but the offshore transfer still needs its own disclosed basis and
   safeguards.
5. **NPC registration / records:** the processing (and the processor relationship) must be
   reflected in the school's / DepEd's NPC registration and records of processing activities; a
   **Data Protection Officer** must be designated and identifiable in the privacy notice.
6. **Security measures:** encryption in transit and at rest, access control, logging, and a
   documented breach-response procedure with the **72-hour NPC + data-subject notification** rule.
7. **NPC Circular on Data Sharing Agreements (16-02 as amended by 2020-03) does NOT apply** to a
   controller→processor outsourcing arrangement (it governs controller-to-controller sharing).
   Do not paper the Cloudflare relationship as a "data sharing agreement"; it is an outsourcing
   agreement. (If DepEd Central Office rather than the school is the controller and the school is a
   separate controller, a DSA layer may also be needed — confirm with DepEd.)

### B. EO 119, s. 2026 — government data residency

8. **[gov] Data classification determination:** obtain (or align with) the school's/DepEd's EO 119
   classification of learner records once the Joint Oversight Committee implementing guidelines
   issue (~Nov 2026). Design must not assume "Restricted"; plan for "Confidential."
9. **[gov] If classified Confidential:** secure **prior Joint Oversight Committee approval** for
   offshore storage/processing, with the prescribed security safeguards, before go-live. No
   approval → no offshore Cloudflare hosting of that data.
10. **If classified Restricted:** host only on a "secured cloud platform" meeting encryption +
    cybersecurity + internationally recognized standards; document these controls.
11. **Jurisdiction clause:** the provider contract must acknowledge that the data remains subject
    to Philippine law and jurisdiction regardless of processing location, and must support
    Philippine government access/audit and lawful retrieval.
12. **Procurement alignment:** any DepEd procurement / MOA for the cloud service must carry the
    EO 119 obligations (hosting location, offshore-processing conditions, cross-border transfer
    limits, cybersecurity responsibilities) — expect these to be required terms.
13. **Transition:** EO 119 gives existing providers a grace period conditioned on "reasonable risk
    mitigation measures," and full compliance is required within 3 years (2 years for Top
    Secret/Secret). A new system should be built to the target state, not the grace period.

### C. DICT Cloud First Policy (Dept. Circular No. 2017-002, amended 2020)

14. Government "cloud first" is satisfied by using cloud; but sensitive government data is expected
    to sit on a **DICT-accredited cloud service provider or the Philippine GovCloud, with
    encryption.** Confirm Cloudflare's status against the DICT accredited-CSP list, or use
    GovCloud / an accredited PH provider. The 2020 amendment formalizes data sovereignty/residency
    expectations that EO 119 now supersedes and hardens.

### D. DepEd-specific

15. **DepEd Order No. 58, s. 2017 is NOT the DepEd data privacy policy.** It is _"Adoption of New
    Forms for Kindergarten, Senior High School, Alternative Learning System, Health and Nutrition,
    and Permanent Records"_ (verified from the actual signed order, 27 Nov 2017). ADR-0065's
    citation is mislabeled and should be corrected. No DepEd Order that adopts a department-wide
    "Data Privacy Policy" by that title could be located in authoritative sources; DepEd instead
    publishes a Data Privacy Notice, directs every governance level (Central/Region/Division/
    District/School) to comply with RA 10173, and regional offices maintain Privacy Manuals (e.g.
    DepEd Region 4A Regional Order No. 8, s. 2019, "Data Privacy Manual"). **The full text of any
    DepEd Central Office Privacy Manual could not be retrieved and may contain
    processor/cloud/offshore constraints not captured here — this must be checked directly with
    the DepEd Data Protection Officer (dataprivacy.dpo@deped.gov.ph) before the gate is closed.**
16. **DepEd Order No. 32, s. 2018** governs collection of learner data into the **Learner
    Information System (LIS) and EBEIS**. LIS/EBEIS is DepEd's national system; LIKHA is a
    separate device-local SIS. No located DepEd issuance dictates where a _school-level_ SIS may
    store data, but any LIKHA→cloud path that later feeds or mirrors LIS data must not conflict
    with DepEd's own hosting arrangements for LIS — confirm with DepEd.
17. DepEd's public Data Privacy Notice states learner data is "stored in a database in accordance
    with government policies" and that "only authorized DepEd personnel have access" — it neither
    authorizes nor forbids third-party/offshore processing. Silence is not permission for a
    government agency under EO 119.

---

## What this means for ADR-0065 (recommendation)

1. **Do not lock the Cloudflare Workers + single global D1 decision now.** The
   "decision-invalidating dependency" has partially triggered: EO 119 makes offshore hosting of
   the more-sensitive plausible classification of learner PII contingent on a government approval
   whose process is not yet published.
2. **Safest re-scope:** target a **Philippines-hostable** sync backend (PH-based/accredited CSP,
   GovCloud, or self-hosted in-country) so residency is satisfied by construction and only the
   DPA processor/notice obligations remain.
3. **If Cloudflare is retained:** require a contract that **pins the D1 primary location and all
   replicas to a Philippine region** (or ASEAN at most), plus items A1-A7, B8-B13, C14, D15-D16;
   and gate go-live on the EO 119 implementing guidelines + (if Confidential) JOC approval.
4. Correct the DO 58, s. 2017 citation in ADR-0065.
5. Re-run this gate once the **EO 119 implementing guidelines** are published (expected ~November 2026) and after direct confirmation from the DepEd DPO.

---

## Confidence

- **High confidence:** RA 10173 contains no data-localization rule; the DPA accountability
  principle permits international transfer subject to accountability; NPC model contractual clauses
  (Advisory 2024-01) are the recognized cross-border mechanism; NPC DSA circular excludes
  controller-processor outsourcing. DepEd Order 58, s. 2017 is about school forms, not data
  privacy (verified against the signed order itself).
- **High confidence:** EO 119, s. 2026 exists, was signed 13-14 July 2026, covers government data
  held by private contractors regardless of personal-data status, sets residency tiers (Top
  Secret/Secret onshore; Confidential onshore-by-default with JOC-approved exceptions; Restricted
  cloud-anywhere with encryption), and mandates implementing guidelines within 120 days.
- **Medium confidence:** the precise classification tier for a single school's learner PII, and
  the exact offshore-approval procedure — these await the EO 119 implementing guidelines, which
  were not yet available and could not be retrieved.
- **Could NOT be retrieved (do not treat as settled):**
  - Verbatim text of RA 10173 IRR §§6, 21, 43-44 (privacy.gov.ph, lawphil.net and the judiciary
    e-library all blocked automated fetch; provisions summarized from NPC-derived secondary
    sources).
  - Full text of EO 119, s. 2026 (Official Gazette blocked automated fetch; provisions from
    Manila Times, Rappler, USASEAN, DigitalEdge, Cruz Marcelo, PIA, newsbytes.ph summaries).
  - Full text of the DICT Cloud First Policy 2020 amendment and any 2025 draft DICT data-residency
    guidelines (Global Data Alliance's Oct 2025 comment confirms a DICT data-residency
    consultation was ongoing, but the guideline text was not obtained).
  - The DepEd Central Office Privacy Manual / any internal DepEd issuance on processors and cloud —
    must be requested from the DepEd DPO.
  - The NPC Data Privacy Council Education Sector Advisory No. 2020-1 full text (PDF fetch blocked).

---

## Sources

- [DepEd Order No. 58, s. 2017 — "Adoption of New Forms for Kindergarten, Senior High School, Alternative Learning System, Health and Nutrition, and Permanent Records" (signed order PDF, DepEd)](https://www.deped.gov.ph/wp-content/uploads/2017/11/DO_s2017_058.pdf)
- [DepEd — Data Privacy Notice](https://www.deped.gov.ph/about-deped/data-privacy-notice/)
- [DepEd (GOVPH school site) — DepEd Data Privacy policy statement](https://sites.google.com/deped.gov.ph/300770-fnhs/about/deped-data-privacy)
- [DepEd — DO 32, s. 2018: Policy Guidelines on the Collection of Data/Information Requirements for BOSY 2018-2019 in the LIS and EBEIS](https://www.deped.gov.ph/2018/07/16/do-32-s-2018-policy-guidelines-on-the-collection-of-data-information-requirements-for-beginning-of-school-year-2018-2019-in-the-learner-information-system-and-enhanced-basic-education-info/)
- [DepEd — Learner Information System (LIS) overview presentation (PDF)](https://www.deped.gov.ph/wp-content/uploads/2020/06/LIS-Presentation-for-OBE-2020-MA2420.pdf)
- [National Privacy Commission — IRR of RA 10173, as amended (PDF; automated fetch blocked, cited via NPC-derived summaries)](https://privacy.gov.ph/wp-content/uploads/2023/06/IRR_RA-10173-as-amended.pdf)
- [NPC Circular No. 2020-03 — Data Sharing Agreements (amending Circular 16-02) (PDF)](https://privacy.gov.ph/wp-content/uploads/2021/01/Circular-Data-Sharing-Agreement-amending-16-02-21-Dec-2020-clean-copy-FINAL-LYA-and-JDN-signed-minor-edit.pdf)
- [Global Compliance News — "Philippines: New Circular on Data Sharing Agreements issued by the NPC" (NPC Circular 2020-03 analysis; confirms controller-processor outsourcing is excluded)](https://www.globalcompliancenews.com/2021/02/07/philippines-new-circular-on-data-sharing-agreements-issued-by-the-national-privacy-commission190121/)
- [NPC Advisory No. 2024-01 — Contractual Clauses for Cross-Border Transfers of Personal Data (30 May 2024) (PDF)](https://privacy.gov.ph/wp-content/uploads/2024/06/Published-NPC-Advisory-No.-2024-01-Contractual-Clauses-for-Cross-Border-Transfers_30May24.pdf)
- [NPC — Data Privacy Council Education Sector Advisory No. 2020-1 (PDF; automated fetch blocked)](https://privacy.gov.ph/wp-content/uploads/2023/05/DP-Council-Education-Sector-Advisory-No.-2020-1.pdf)
- [NPC — Advisory Opinions index](https://privacy.gov.ph/pips-and-pics/advisory-opinions/)
- [Official Gazette — Executive Order No. 119, s. 2026 (13 July 2026; automated fetch blocked)](https://www.officialgazette.gov.ph/2026/07/13/executive-order-no-119-s-2026/)
- [Presidential Communications / PIA — "President Marcos Signs EO 119, Unlocking Digital Infrastructure Growth and Strengthening Philippine Data Security"](https://pia.gov.ph/press-release/president-marcos-signs-eo-119-unlocking-digital-infrastructure-growth-and-strengthening-philippine-data-security/)
- [newsbytes.ph — "New EO sets gov't data residency rules, requires local storage of sensitive data" (15 July 2026)](https://newsbytes.ph/2026/07/15/new-eo-sets-govt-data-residency-rules-requires-local-storage-of-sensitive-data/)
- [DigitalEdge — "Philippines Data Residency: EO 119" (tier-by-tier storage rules)](https://www.digitaledgedc.com/resources/data-centers/philippines-data-residency/)
- [US-ASEAN Business Council — "The Philippine Government Establishes a New Government Data Classification and Residency" framework](https://www.usasean.org/article/philippine-government-establishes-new-government-data-classification-and-residency)
- [Rappler — "What Marcos' new data rules mean for gov't information, cloud storage" (EO 119 explainer)](https://www.rappler.com/technology/features/marcos-eo-119-data-residency-sovereignty-framework-2026/)
- [Cruz Marcelo & Associates — "Executive Order No. 119: Why Private Companies Should Pay Attention to the Philippines' New Government Data Classification Framework" (120-day IRR deadline; obligations flow into procurement/outsourcing/cloud contracts; EO 119 governs government data regardless of whether it is personal data)](https://cruzmarcelo.com/executive-order-no-119-why-private-companies-should-pay-attention-to-the-philippines-new-government-data-classification-framework/)
- [Manila Times — "Marcos orders government data overhaul" (EO 119)](https://www.manilatimes.net/2026/07/15/news/marcos-orders-government-data-overhaul/2384685)
- [BusinessWorld — "Before data can be protected, it must be understood" (EO 119 classification commentary)](https://bworldonline.com/banking-finance/2026/07/24/765573/before-data-can-be-protected-it-must-be-understood/)
- [OpenGov Asia — "DICT amends Philippine Cloud First Policy" (2020 amendment: data classification, sovereignty vs residency)](https://opengovasia.com/dict-amends-philippine-cloud-first-policy/)
- [eLegal.ph — "DICT Releases Circular on Cloud Policy, Adopts 'Cloud First' Approach" (Dept. Circular No. 2017-002: Tier 1/2/3 data, accredited public cloud / GovCloud / private cloud, encryption)](https://elegal.ph/dict-releases-circular-on-cloud-policy-adopts-cloud-first-approach/)
- [DICT Department Circular No. 2017-002 (18 January 2017) — reproduced in JETRO ASEAN-Japan report (PDF)](https://www.jetro.go.jp/ext_images/jetro/activities/support/aseanjapan/report/3-6.pdf)
- [Global Data Alliance — comments on DICT draft guidelines on data residency (28 Oct 2025) (PDF; automated fetch failed)](https://globaldataalliance.org/wp-content/uploads/2025/10/10282025gdaphdictg.pdf)
- [DepEd — Philippine Bidding Documents: Procurement of Cloud Hosting (PDF; shows DepEd already procures commercial cloud hosting)](https://www.deped.gov.ph/wp-content/uploads/PBD_Procurement-of-Cloud-Hosting.pdf)
