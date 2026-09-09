# Owner Decisions Needed

Consolidated list of items this session deliberately did **not** decide unilaterally — each needs your input before it can move further. Built up across the pending-tasks batch run starting 2026-09-08. Read-only artifact for your review; not implementation guidance.

---

## 1. Master Teacher RBAC role — RESOLVED (2026-09-09, Batch 17)

**Status:** Resolved for real. A genuine `master_teacher` RBAC role now
exists (`repository::role::MASTER_TEACHER`, migration 59) — this is the
permanent design, not another interim workaround. See
`docs/adr/0089-master-teacher-rbac-and-two-tier-grade-review.md`, which
supersedes ADR-0073's interim School-Head-as-approver substitution.

**The answer:** a Master Teacher oversees a set of teachers
(`teacher_oversight_assignments`, migration 60 — a time-scoped,
school-scoped assignment table, School-Head-managed via
`Capability::ManageTeacherOversightAssignments`). Anything an overseen
teacher submits that needs review — starting with grade submissions — is
approved by their assigned Master Teacher first; School Head retains a
distinct, separate "final lock" step afterward. A teacher with no
currently-assigned Master Teacher routes directly to School-Head
approval — the same behavior ADR-0073's interim version already had,
now documented as the intentional fallback rather than the only path.
Holding `master_teacher` grants no School-Head-level capability by
itself, and a Master Teacher can never approve their own submission
(enforced server-side, not left to the UI).

**Original question (for the record):** should this project add a real
"Master Teacher" role to RBAC (today: Teacher / Registrar / School Head
only)? If yes: what capabilities does it get, how is someone assigned
it, does it apply per-section or school-wide?

**Why it wasn't decided unilaterally at the time:** expanding the role
universe was an irreducible product-policy choice (per
`.claude/rules/autonomous-development.md`'s approval-gate #1) — there
was no evidence-based "correct" answer, only the owner's preference for
how their schools' review hierarchies actually work. The owner has since
answered it directly (see above), so this item is no longer open.

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

**Status:** **Resolved that the check runs at all** (Batch 13, `docs/adr/0084-award-eligibility-anecdotal-record-check.md`) — `award-eligibility.ts` no longer hardcodes `anecdotalRecordsChecked: false`; it now takes the real result of a narrow, read-only lookup against the Anecdotal Records entity (Batch 12, ADR-0083) and factors it into eligibility for real. **Still not resolved:** the exact disqualification bar. The rule shipped this session is any anecdotal record in the `negative` category (of the generic `positive`/`negative`/`neutral` classification Batch 12 built) excludes a learner, regardless of severity, with no date/recency window — this project's own conservative default, not a verified DepEd rule, chosen because the schema has no severity field to model anything finer.

**The actual question:** is "any `negative`-category record, any severity, no recency window" the right bar, or should minor/administrative anecdotes not disqualify a learner, or should only recent anecdotes (e.g. within the current school year) count? Legacy never actually implemented this rule (it was hardcoded mock data), so there's no reference implementation to check against either. Answering this for real would likely also require deciding whether `AnecdotalCategory` needs a severity dimension added — a schema change, not just a threshold tweak.

**Why it wasn't decided here:** no primary DepEd source was found for the actual honors-eligibility criteria; the current rule is a defensible placeholder, not a citation. Adding a severity model to `AnecdotalCategory` without such a citation would itself be inventing structure this project has no evidence for, so ADR-0084 deliberately used only what the schema already has.

---

---

## 5. School logo sync size limit (FYI, already decided — not blocking)

**Status:** Decided and implemented (Batch 10, `docs/adr/0081-school-logo-sync-byte-budget.md`). `MAX_LOGO_BYTES` was shrunk from 512 KiB to 48 KiB so a school-branding logo upload's encrypted sync payload fits under `sync::MAX_ENCRYPTED_CHANGE_BYTES` (256 KiB); `SchoolLogo` is now fully wired to the sync protocol.

**Why this is here anyway:** per your instruction to use best judgment on self-contained, reversible sizing calls like this one rather than blocking a wave on them, this was decided and shipped without waiting for you — but it does trade away upload headroom you might want back. 48 KiB is generous for a compressed sidebar/header-sized PNG/JPEG/WebP icon, but if you'd prefer schools to be able to upload a noticeably larger or higher-resolution logo, the alternative not taken (a dedicated binary-safe sync payload path instead of shrinking to fit the existing JSON-then-encrypt envelope, or a hand-rolled base64 encoder that would raise the safe ceiling to roughly 140–150 KiB without a new payload path) is fully documented in the ADR's "Not chosen" section, ready to implement if you'd rather have that instead.

**No action needed** unless you want the larger-logo alternative — this is a disclosure, not a question blocking anything.

---

_This file is additive — new entries get appended as later batches surface more genuine decision points. Nothing in this file should be treated as already decided; it's the opposite._
