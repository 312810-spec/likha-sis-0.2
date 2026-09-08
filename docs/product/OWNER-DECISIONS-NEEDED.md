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

_This file is additive — new entries get appended as later batches surface more genuine decision points. Nothing in this file should be treated as already decided; it's the opposite._
