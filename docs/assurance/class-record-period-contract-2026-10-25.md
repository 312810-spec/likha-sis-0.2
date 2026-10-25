# PM-13 Class Records period context contract

25 October 2026, Asia/Manila. Base 499e07d0d5df1df49797c594dd435f216f1dd420. Full PM-13 prompt shown before implementation; unchanged prompt is retained in reporting-preview-state-contract-2026-10-24.md. Current FORGE 4 adapter controls supporting attached philosophy, playbook, Assurance and OS 3.1 references.

Outcome: opening a class record submits only a period freshly loaded for the selected section/year. Boundary: ClassRecordsScreen context form; preserve Scores, authoring, grading math, native authorization and templates. The assigned-class opener already disables context choices while opening; no defect established there.

Frozen before repair:

| ID  | Acceptance                                                                                                             | Evidence required                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P1  | A section/year change immediately removes prior period eligibility while pending; blocked click/keyboard cannot create | Deferred component regression and browser request log                          |
| P2  | Failed read leaves no old period/ID eligible; explicit read-only Retry preserves other choices                         | Failure/retry component and browser flow; exact canonical tuple after recovery |
| P3  | Superseded replies cannot replace current context, including return to prior section                                   | Deferred race regression                                                       |
| P4  | Empty and foreign-year replies are distinct from pending/success; neither permits create                               | Component boundary cases                                                       |
| P5  | Existing tokens, accessible field explanation, keyboard and responsive modes remain usable                             | Focused/full quality, browser renders/axe/reflow, build/isolation/UI gates     |

Smallest mechanism under evaluation: bind each read to opaque section/year/service/retry context, expose options and selected ID only from its matching successful response. Ignore cancelled reads. Reject foreign-year results. Retry performs only a read. Native create policy remains authoritative; the defect is a mismatched UI request, not evidence of unauthorized persistence. No optimistic success, automatic create/replay or new cache policy.

Controls: Section/Subject/weighting retain native selects and existing values; period select disabled during pending/error/empty with linked explanation. Open remains focusable with aria-disabled and an equivalent handler guard. Retry is a native type=button, available only on failed read, one new attempt disables/removes it. Loading/empty status uses field-hint; error uses field-error/role=alert. Existing styles/tokens and reduced-motion policy reused; no new animation. Exact token values and actual results appended after verification. Full A1–A7 teacher/device/manual acceptance remains separate and partial.

## Element and effects detail

Source: src/ui/theme/styles.css, retained without change. Public Sans body/controls14/15/17px for efficient/comfortable/guided; hint/error0.9em. Spacing unit8/12/18px; control minima34/40/72px, select/button radius8px. Button horizontal padding12/18/27px; 1px semantic border. Light text #172033, muted #586174, danger #b42318, surface #eef0f6; dark text #f0f2fa, muted #b3bbcf, danger #ffaaa1, surface #1b1f2d. Focus ring2px/offset2px, semantic primary #2536c4/#b8bdf8. Disabled controls/buttons retain incumbent0.6 opacity; Open remains keyboard focusable. Retry uses normal hover brightness0.97, 120ms cubic-bezier(0.2,0,0,1); reduced motion0.01ms. No new effects, icon, elevation, delayed message, sound or toast.

Period description follows the select, linked only when unavailable. Loading and empty use role=status; read failure role=alert includes selected year. Retry is an explicit read, disappears while pending, cannot dispatch create. Empty result has no retry promise; changing context rereads under existing behavior. Success defaults to first returned period, as before. Mismatched-year response follows the failure recovery path. Selection changes do not erase subject/weighting. Open uses current scoped ID in both aria-disabled and handler guard; native policy still decides create success. No destructive action/undo needed for read retry. Existing Studio/workspace/back actions and score input semantics remain unchanged.
