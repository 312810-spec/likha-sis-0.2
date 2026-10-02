# Deeper idea mining: improvements for LIKHA-SIS

Date: 2026-10-02, Asia/Manila. This extends the Windows/Android study after the request to go beyond search results and scrape ideas more deeply.

## What was actually examined

Five AI specialists examined donor workflows and challenged their fit. The root researcher also cloned two public repositories and read implementation files, without installing or running donor applications:

| Donor                        | Evidence inspected                                                                                          | Snapshot / limitation                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Learning Equality Morango    | `morango/sync/operations.py`, `morango/models/core.py`, controller; official architecture/API docs          | Commit `eaaf903c252632f664c29ed0a807c7783f4470c8`; selected synchronization paths, not a whole-system audit |
| LEOS offline school app      | `desktop/src/school-files.ts`, `backup-router.ts`, Android `LeosApi.java`; architecture and roadmap         | Commit `62ea418b5bd401446779393efe87ae25b03a6d13`; source inspection, not device execution                  |
| ODK Collect/Central          | Official draft/send/recovery/audit documentation and specialist inspection of indexed `SaveFormToDisk.java` | Documentation current at retrieval; indexed source may differ from current release                          |
| PowerSync                    | Official consistency and write-error documentation                                                          | Design reference; no SDK adoption or integration proof                                                      |
| Superpowers / OMX / GSD Core | Specialist reads of task/diff packaging, transcript search, usage accounting and continuation artifacts     | Selected source patterns; moving branches; no token benchmark                                               |
| LIKHA-SIS                    | Local sync client/outbox/hub code, attendance save flow, status components and harness                      | Base `3e7a2508da0f82c662b133e28117a9be4f0f06e6`; proposed fixes need native tests                           |

This was targeted extraction from implementation and operating guidance, rather than counting stars or repeating README promises. A donor behavior is evidence about that donor. Adapting it to LIKHA remains a design inference until tested. The collection is selective, not an exhaustive scrape of all public projects.

## Three issues to investigate before adding mobile features

**1. Conflict detection uses a delivery page as a correctness query.** In `src-tauri/src/sync_client.rs::pull_once`, the check for a pending edit calls `pending_for_school(..., 100)`. That repository query orders rows and clamps its limit to 100. A matching edit outside the first page is therefore not included in the check. This is a concrete inspection concern, not a reproduced corruption incident. A 250-operation regression fixture should place the matching entity beyond the first page, then pull a competing change. Replace the scan with an indexed existence query over school, entity kind and entity ID once the failing case is reproduced. Simply increasing the page size leaves the same design flaw.

**2. A rejected incoming record can become a log-only event.** The `RepositoryRejected` branch warns, increments a run summary and advances the cursor. This deliberately avoids wedging the whole school's queue, which is useful. But that branch does not itself create a durable review item containing the rejected record. Preserve the change, reason and identifiers transactionally before moving past it. Distinguish content collision from unexpected storage faults: several repository errors currently map to the same rejection category. Acceptance: a natural-key collision remains reviewable after restart while later unrelated changes continue; a simulated storage failure must not be mislabeled as successful resolution.

**3. School scope is broader than teacher assignment scope.** `repository/sync_hub.rs::pull_since` filters by school and cursor and explicitly defers per-teacher filtering. Android pairing must not automatically imply downloading all records in a school. Define each teacher's roster/assignment bundle and its dependency closure. The source establishes a scope limitation; it does not demonstrate a deployed data leak. Acceptance: two teachers with disjoint assignments receive only permitted records and the hub rejects an out-of-assignment raw write. Reassignment must refresh access and handle outstanding drafts explicitly.

These are the first implementation investigations, ahead of a dashboard redesign or framework migration. No application-source fixes were made by this research change, and Rust tests were unavailable in this environment.

## Useful ideas, costs and smallest experiments

| Priority | Idea                                           | Where it comes from                                                                       | Smallest LIKHA experiment                                                                           | Downside / avoid                                                                        |
| -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| P0       | Durable rejection inbox                        | Morango records per-record apply errors; PowerSync discusses nonblocking failure handling | Preserve one rejected incoming change with reason, actor and operation ID; resolve it after restart | Advancing a cursor must mean safely retained/processed, not that the grade was accepted |
| P0       | Assignment-sized offline bundle                | Morango scopes and Kolibri limited devices                                                | Two teachers, two sections, required related entities and explicit permitted writes                 | A filtered roster without dependencies or server checks is incomplete                   |
| P0       | Saved locally vs school-accepted               | ODK separates drafts, ready-to-send and sent                                              | Class summary shows local save, pending count and last checked time; hub sleeps then returns        | Existing LIKHA save acknowledgments are good; do not require finalization for every tap |
| P0       | Recover unfinished entry in original context   | ODK recovery keeps original form version                                                  | Restore unfinished quiz text using learner/assessment/version IDs after force-stop                  | Unvalidated text is a draft, never an automatically committed score                     |
| P0       | Portable encrypted recovery package            | LEOS consistent snapshot/candidate restore pattern plus LIKHA SQLCipher needs             | Backup 30 fictional learners and one attachment; restore under another Windows account              | ZIP/checksum and a password gate are not encryption; DPAPI keys are not portable        |
| P1       | Explicit bulk attendance with exceptions       | Proposed interaction, supported by durable local-save principles                          | Start unmarked; user chooses all-present, edits three exceptions, reviews and undoes                | Never silently assume attendance; adviser and subject attendance mean different things  |
| P1       | Corrections timeline                           | ODK optional old/new values and actor attribution                                         | One score shows previous/current value, actor, operation and optional reason                        | Log committed changes, not every keystroke; do not import GPS/navigation tracking       |
| P1       | Actionable work queue                          | LEOS work-needing-attention dashboard                                                     | Three assignment-scoped tasks: incomplete attendance, scores unfinished, review conflicts           | Counts need truthful freshness and domain rules; avoid a large ERP dashboard            |
| P1       | Understandable hub join/rejoin                 | Kolibri facility join; LEOS pairing; LIKHA existing credentials                           | Phone pairs to named school hub on hotspot without internet; reconnect after address change         | Keep one authority and stable IDs; discovery does not replace authentication            |
| P1       | Resume sync with visible provenance            | Morango persisted transfer counts; LIKHA outbox/cursors                                   | 250 changes, disconnect after server acceptance before acknowledgment, retry twice                  | Exactly 250 accepted operations, no duplicates; counts must not expose payloads         |
| P1       | Separate core commit from optional UI work     | Kolibri vital versus optional sync hooks                                                  | Records and cursor commit together; simulate notification failure afterward                         | A badge refresh must not fail a successful save; cursor consistency is essential        |
| P1       | Share contract fixtures across native clients  | Existing LIKHA boundary design; donor companion pattern                                   | Same grading/conflict fixture evaluated by Windows and Android adapter                              | Shared UI is optional; duplicated rules without common fixtures drift                   |
| P2       | Offline encrypted transfer package             | Original fallback inference from local-first constraints                                  | Export/import a bounded operation bundle twice during hub/network trouble                           | Needs deduplication, scope checks, version checks and provenance; never copy a live DB  |
| P2       | Read-only browser companion                    | Donor LAN browser pattern                                                                 | View prepared reports on trusted local network, preserving native editing                           | Browser availability does not prove independently offline encrypted storage             |
| P2       | Rehearsal school and reproducible support case | LEOS fictional demo; existing LIKHA synthetic fixtures                                    | Reproduce pairing, conflict and restore using one versioned fictional school                        | Avoid embedding real learner records or credentials in support artifacts                |

The intended outcome is reliable teacher work. None of these rows earns priority merely because the donor has more features.

## What source inspection changed about the donor claims

LEOS is a useful adjacent project, but its Android `LeosApi` issues HTTP requests and does not supply an offline database or durable mutation queue in that class. Its architecture describes a LAN client without duplicate storage. Its school archive code uses a SQLite backup snapshot, a temporary candidate, integrity checks and a previous-file fallback. Those patterns are worth studying.

However, `writeArchive` currently includes the SQLite data and empty `media/` and `documents/` entries; that code does not prove attached files are backed up. `openArchive` extracts SQLite and checksum rather than validating the manifest as a complete compatibility contract. The roadmap explicitly distinguishes master-key access gating from at-rest encryption. Borrow the recovery pattern while independently designing encrypted contents, attachment completeness, version validation and interrupted replacement. A source inspection of these paths does not establish production reliability or justify replacing Tauri with Electron.

Morango's `_save_deserialized_record` persists application errors on the stored record and leaves it dirty rather than relying only on a warning. Its transfer model stores counts and provenance. Reuse the ideas within LIKHA's existing Rust transaction/outbox architecture; importing a Django replication stack would expand maintenance. Its architecture documentation warns about lack of certificate revocation in the described system. Retain LIKHA hub-side revocation; do not copy that limitation. Source inspection of `models/certificates.py::Filter` also shows prefix-based containment. LIKHA should use exact identifiers or delimiter-safe components and test section `A` versus `AB`; borrowing a scope concept does not justify blindly copying its string checks.

PowerSync is a useful design comparison for the blocked-queue problem. Its specific HTTP response conventions belong to its SDK; LIKHA should define explicit applied/rejected/conflicted outcomes rather than copying `2xx` handling and interpreting it as domain acceptance.

## Improve Codex without rebuilding bureaucracy

Three source-backed patterns fit the replacement harness:

1. **Task and review artifacts.** Superpowers' `task-brief` extracts one numbered task and `review-package` packages a validated commit range and contextual diff. Give a specialist one bounded task and file locations, not another full repository dump. Carry the actual base commit across multi-commit work. Adapt tooling for Windows rather than requiring Bash/awk on every developer machine.
2. **One compact continuation record.** GSD Core's continuation template records progress, decisions, blockers and the next action. Keep those objective fields in `TASK.md`; link to this study rather than automatically loading it. Do not copy its full orchestration hierarchy or delete useful continuity on resume.
3. **Bounded retrieval and honest usage accounting.** OMX streams transcript searches into limited snippets with provenance and separates usage categories and unknown measurements. Reuse project-scoped retrieval; never assume missing token usage equals zero. Specialist fan-out is worthwhile only when its decision value exceeds repeated context cost.

The current replacement already supplies concise guidance, a task entry point and on-demand specialists. Helpers and benchmark infrastructure should be added only when a repeatable task needs them. Popularity establishes neither quality nor token savings.

Proposed benchmark: baseline native Codex versus baseline plus selected artifact/retrieval patterns, using identical model/settings/tools and isolated starting commits. Use attendance correction, Android storage investigation and interrupted-task resume; three repetitions per task/condition, alternate order and disclose cache state. Measure all parent/child/retry usage, elapsed time, acceptance success, rework and duplicate work after resume. Report cached/uncached input separately, output, unknown observations and per-task median/range. Set the improvement threshold beforehand. No savings result is claimed here.

## First integrated experiment

Use one fictional school, two teachers, two sections and 250 pending changes:

1. Pair a phone to the Windows hub and verify its assignment-sized bundle.
2. Disconnect; capture attendance and one quiz, leaving one unfinished entry.
3. Force-stop/reboot; preserve all acknowledged writes and offer the unfinished draft.
4. Create a conflicting Windows correction whose phone edit lies after the first 100 queue entries.
5. Reconnect; interrupt after hub commit, before acknowledgment; restart and retry.
6. Review conflicting and rejected records after another restart; verify no silent discard and no duplicate operation.
7. Export a Windows report, back up an attachment and restore to a clean second account/device.

Add archive fault tests for missing manifest/checksum, incomplete attachments and failure immediately before replacing the last valid backup. These distinguish a convenient ZIP workflow from dependable recovery.

This one journey tests the app's real promise more effectively than several disconnected feature demos. It is a proposed experiment, not an executed result.

## Primary source ledger

- Morango implementation: [operations at inspected commit](https://github.com/learningequality/morango/blob/eaaf903c252632f664c29ed0a807c7783f4470c8/morango/sync/operations.py), [models](https://github.com/learningequality/morango/blob/eaaf903c252632f664c29ed0a807c7783f4470c8/morango/models/core.py); [architecture](https://morango.readthedocs.io/en/latest/architecture/), [API](https://morango.readthedocs.io/en/latest/api/).
- Kolibri: [facility sync architecture](https://kolibri-dev.readthedocs.io/en/latest/backend_architecture/facility_syncing/), [initial setup](https://kolibri.readthedocs.io/en/latest/install/initial_setup.html).
- LEOS: [school archive implementation](https://github.com/HolagundiWorks/leos/blob/62ea418b5bd401446779393efe87ae25b03a6d13/desktop/src/school-files.ts), [Android API client](https://github.com/HolagundiWorks/leos/blob/62ea418b5bd401446779393efe87ae25b03a6d13/android-client/app/src/main/java/in/hcworks/leos/lan/LeosApi.java), [roadmap](https://github.com/HolagundiWorks/leos/blob/62ea418b5bd401446779393efe87ae25b03a6d13/ROADMAP.md).
- ODK: [forms](https://docs.getodk.org/collect-forms/), [recovery](https://docs.getodk.org/collect-filling-forms/#recovering-data-after-collect-quits), [audit/change tracking](https://docs.getodk.org/form-audit-log/#change-tracking), [submission diffs](https://docs.getodk.org/central-api-submission-management/#getting-changes-between-versions), [indexed save implementation](https://github.com/getodk/collect/blob/master/collect_app/src/main/java/org/odk/collect/android/tasks/SaveFormToDisk.java).
- PowerSync: [consistency](https://docs.powersync.com/architecture/consistency), [writing client changes](https://docs.powersync.com/handling-writes/writing-client-changes).
- Codex patterns: [Superpowers task brief](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/scripts/task-brief), [review package](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/scripts/review-package), [GSD continuation](https://github.com/open-gsd/gsd-core/blob/next/gsd-core/templates/continue-here.md), [OMX search](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/src/session-history/search.ts), [OMX usage accounting](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/src/evals/astra-defaults/usage.ts).
