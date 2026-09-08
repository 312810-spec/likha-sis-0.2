# Owner Decisions Needed

Consolidated list of items this session deliberately did **not** decide unilaterally — each needs your input before it can move further. Built up across the pending-tasks batch run starting 2026-09-08. Read-only artifact for your review; not implementation guidance.

---

## 1. Master Teacher RBAC role

**Status:** Interim workaround shipped (ADR-0073) — School Head plays the "approver" role in the grade-review pipeline and the "Principal" role in the overview dashboard.

**The actual question:** should this project add a real "Master Teacher" role to RBAC (today: Teacher / Registrar / School Head only)? If yes: what capabilities does it get, how is someone assigned it, does it apply per-section or school-wide?

**Why it wasn't decided here:** expanding the role universe is an irreducible product-policy choice (per `.claude/rules/autonomous-development.md`'s approval-gate #1) — there's no evidence-based "correct" answer, only your preference for how your schools' review hierarchies actually work.

---

## 2. Official School Repository — Microsoft 365 tenant

**Status:** Blocked, not started. Spec approved (`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`), zero integration code exists.

**The actual question:** does the target school actually have (or will it have) its own Microsoft 365 tenant with SharePoint? If not, this feature has no cloud target to integrate with at all.

**Why it wasn't decided here:** external material only you can confirm — approval-gate #2 (a production credential/tenant this project can't self-provision).

---

## 3. ESRU rubric meaning (Formative Assessment logging)

**Status:** Implemented this session using the existing (previously recorded, never verified) gloss: **E**xploration, **S**tructured practice, **R**eflection, **U**nderstanding.

**The actual question:** is that gloss actually correct? Neither this project nor the legacy `likha-sis` codebase it was ported from ever cited a DepEd primary source for what ESRU stands for — legacy's own schema just used the four letters with no definition anywhere in its code.

**Why it wasn't decided here:** a wrong rubric label on a real formative-assessment log is a DepEd-compliance correctness risk, not something to guess confidently. Shipped with the gloss clearly marked unverified in code comments and the ADR; flag if you have (or can get) an authoritative source.

---

## 4. Awards & Certificate eligibility — disciplinary-anecdotes threshold

**Status:** `zero disciplinary anecdotes` check now implemented (Anecdotal Records shipped this session) but the exact eligibility rule is still this project's own conservative default (GA ≥ 90, no subject grade < 80, zero anecdotes of any severity), not a verified DepEd rule.

**The actual question:** is "zero anecdotes of any severity" the right bar, or should minor/administrative anecdotes not disqualify a learner? Legacy never actually implemented this rule (it was hardcoded mock data), so there's no reference implementation to check against either.

**Why it wasn't decided here:** no primary DepEd source was found for the actual honors-eligibility criteria; the current rule is a defensible placeholder, not a citation.

---

---

## 5. School logo sync size limit (FYI, already decided — not blocking)

**Status:** Decided and implemented (Batch 10, `docs/adr/0081-school-logo-sync-byte-budget.md`). `MAX_LOGO_BYTES` was shrunk from 512 KiB to 48 KiB so a school-branding logo upload's encrypted sync payload fits under `sync::MAX_ENCRYPTED_CHANGE_BYTES` (256 KiB); `SchoolLogo` is now fully wired to the sync protocol.

**Why this is here anyway:** per your instruction to use best judgment on self-contained, reversible sizing calls like this one rather than blocking a wave on them, this was decided and shipped without waiting for you — but it does trade away upload headroom you might want back. 48 KiB is generous for a compressed sidebar/header-sized PNG/JPEG/WebP icon, but if you'd prefer schools to be able to upload a noticeably larger or higher-resolution logo, the alternative not taken (a dedicated binary-safe sync payload path instead of shrinking to fit the existing JSON-then-encrypt envelope, or a hand-rolled base64 encoder that would raise the safe ceiling to roughly 140–150 KiB without a new payload path) is fully documented in the ADR's "Not chosen" section, ready to implement if you'd rather have that instead.

**No action needed** unless you want the larger-logo alternative — this is a disclosure, not a question blocking anything.

---

_This file is additive — new entries get appended as later batches surface more genuine decision points. Nothing in this file should be treated as already decided; it's the opposite._
