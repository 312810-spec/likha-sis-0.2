# LIKHA-SIS Windows and Android study and harness replacement

Date: 2026-10-02, Asia/Manila. Repository inspected: `312810-spec/likha-sis-0.2`, main snapshot `3e7a2508da0f82c662b133e28117a9be4f0f06e6`.

## Executive decision

Keep the existing Tauri/React/TypeScript/Rust Windows implementation. Prove a focused Tauri Android companion before making a framework commitment. Use Kotlin/Compose for Android if the encrypted-storage and lifecycle integration fails. Consider Flutter only if a comparative prototype shows that replacing both interfaces is worth the migration cost.

Replace the development harness with native Codex, concise repository guidance, targeted source retrieval, a compact task handoff, and optional independent specialists. Remove blanket legal-policy development prerequisites, ceremonial approval loops, machine-specific hooks, frozen/certified harness concepts, and obsolete M0-only scope. Retain checks that establish correct application behavior. External laws and platform/runtime constraints are not changed by editing project instructions.

This is an architectural recommendation and a concrete harness change, not a completed Android app. No installer, APK, recovery test or teacher pilot was executed by this study. Five independent AI specialists supplied proposals and responded to the competing positions; they are not five human consultants, and their agreement is not empirical product validation.

## 1. What the app already has, and what it actually lacks

The inspected manifest confirms React/TypeScript/Vite, Tauri 2, Rust, `rusqlite` using bundled SQLCipher with vendored OpenSSL, local account/session logic, application services and repository ports. Windows crypto uses DPAPI. The existing commands contain local saves and durable encrypted synchronization-outbox logic. The chosen school-laptop authority is part of the existing project direction; this study does not silently replace it with cloud infrastructure.

The concrete Android blocker is in `src-tauri/src/db/mod.rs`: `open_app_db`, `load_or_mint_sspk` and `rotate_sspk` return key-store errors under `cfg(not(windows))`. Android therefore needs a real platform adapter. Merely changing the app's target, shrinking CSS or generating an APK will not make its database open.

Windows evidence also needs completion. The prior handoff lists real process/power-loss recovery, DPAPI/session recovery, transport restart and packaged Windows proof as outstanding. Source tests are useful but cannot establish those claims.

Harness inspection found a mixed state:

| Inspected artifact                      | Finding                                                                                                  | Replacement                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| AGENTS/HARNESS                          | Already described an evolving harness, but imposed fixed debugging limits and large planning machinery   | Short task-driven rules, evidence-based retry, optional expert challenge |
| BOOTSTRAP-PROMPT                        | Called the repo greenfield and limited work to M0; explicitly excluded Android and implemented app areas | Continue the existing app; Windows and Android both in scope             |
| `.codex/hooks.json`                     | Hardcoded `e:\\LIKHA-SIS 0.2` paths; injected old handoff/active-plan context                            | Retired from active configuration                                        |
| Hook scripts                            | Custom push blocker, write scanner and formatting callbacks using historical assumptions                 | Retired; product CI and scans remain                                     |
| `.codex/config.toml`                    | Runtime review environment overrides                                                                     | Retired rather than guessing which host supports them                    |
| `.harness`                              | Inventory, state and scorecard coupled to rubric verification                                            | Archived with historical evidence                                        |
| `scripts/harness/verify.mjs`            | Verified prescribed workflow strings and metadata                                                        | Lightweight document/script-reference usability check                    |
| Scheduled harness-health workflow       | Repeated framework-contract certification                                                                | Removed; engineering checks remain                                       |
| Old orchestration/startup/policy skills | Mandatory memory rereads, specialist dispatch and missing-template stops                                 | Archived outside discovery; useful engineering skills remain on demand   |

The old files remain in Git history and an explicit archive, including original attribution and licenses. Their instructions are historical references. Current root guidance and user instructions take precedence.

## 2. Read between the lines: the real outcome

The underlying request is to stop rebuilding development machinery and start producing applications that teachers can install, use and recover. The goal is not maximum feature count or identical screens across platforms. It is less encoding, fewer errors and trustworthy records when connectivity fails.

Raise the abstraction twice:

| Level           | Example                                                          | Useful success measure                                     |
| --------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Screen          | Attendance grid; export button                                   | Control works and is accessible                            |
| Workflow        | Record once, correct, synchronize, reuse in a report             | No duplicate entry or silent replacement                   |
| Teacher outcome | Finish classroom administration without worrying about lost work | Faster completion with verified records and recoverability |

For Francis's Grade 10 Mathematics/ICT context, Android primarily captures a class session. Windows handles bulk import, sustained score entry, review, printing and coordination. A subject teacher's attendance observation must remain distinct from the adviser's official daily attendance.

## 3. Platform comparison

These are fit judgments based on existing investment and official capability descriptions, not measured speed or size rankings.

| Approach                                | What can be reused                                                         | Advantages                                                 | Costs and decision trigger                                                       |
| --------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Existing Tauri Windows + Tauri Android  | React, TypeScript contracts, portable Rust business/storage code           | Lowest apparent migration burden; narrow native adapters   | Prove SQLCipher/NDK build, Keystore, lifecycle, exports and accessibility        |
| Existing Tauri Windows + Kotlin Android | Versioned protocols, schemas, rule fixtures; portable Rust where justified | Direct Android lifecycle/document/background APIs          | Two UI stacks; prevent duplicated grading rules with common fixtures             |
| Flutter Windows + Android               | Domain knowledge, protocols, fixtures; limited UI reuse                    | Official Windows and Android support; consistent rendering | Dart rewrite and plugin migration; use only if both interfaces merit replacement |
| .NET MAUI                               | Contracts/fixtures, not the React UI                                       | Windows/Android with C#/XAML and native integration        | New ecosystem and broad rewrite without a demonstrated benefit                   |
| Electron desktop + mobile companion     | Web UI on desktop                                                          | Bundled browser behavior; familiar web tooling             | Electron is not the Android solution; distribution/runtime overhead              |
| PWA/Capacitor companion                 | React/TypeScript                                                           | Useful prototype or supplemental access                    | Browser/device persistence, native encryption and Windows bridge differ          |

Recommendation order: Tauri spike; Kotlin companion fallback; Flutter comparative experiment only after evidence. Do not rewrite working grading/import/export behavior to obtain a fashionable framework.

Primary platform sources: [Tauri mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/), [Flutter Windows](https://docs.flutter.dev/platform-integration/windows/building), [MAUI platforms](https://learn.microsoft.com/en-us/dotnet/maui/supported-platforms?view=net-maui-10.0), [Electron](https://www.electronjs.org/docs/latest/), [Capacitor environment](https://capacitorjs.com/docs/getting-started/environment-setup).

## 4. Windows delivery study

Tauri supports NSIS setup executables and MSI packaging. Build and test Windows artifacts on Windows; a Linux check is not a Windows installation test. Provide a normal online installer and a complete offline variant. Tauri documents roughly 127 MB additional size for its offline WebView2 installer and roughly 180 MB for a fixed runtime. A small executable is therefore not the complete first-install footprint. A fixed runtime also transfers patch-distribution work to the publisher. [Windows installer source](https://v2.tauri.app/distribute/windows-installer/).

Separate three questions: can it build, can a standard user install it, and does the installed app work on a school PC? Test without developer tools and with the expected printer and display configuration. Measure startup, roster entry and report opening on representative hardware instead of claiming Tauri is universally faster.

Keep Windows DPAPI for device-local key wrapping. It usually depends on the Windows account/computer context. A copied encrypted DB and DPAPI-wrapped key are not a demonstrated portable backup. Recovery must work under a different Windows account on another PC. [DPAPI scope](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

Windows code signing and updater verification are different mechanisms. Tauri's updater requires its signatures and does not offer disabling signature verification. Removing a development harness hook does not alter that implementation. [Tauri updater](https://v2.tauri.app/plugin/updater/).

## 5. Android feasibility study

The first APK must use real encrypted persistence, not a browser mock or memory-only database. Add an Android Keystore-backed wrapping adapter for a random local DB key. Keep the wrapping key non-exportable; use it to protect the DB key rather than pretending SQLCipher directly reads a hardware key handle. Key availability and invalidation behavior need explicit tests. [Android Keystore](https://developer.android.com/privacy-and-security/keystore).

Audit the native dependency chain: Rust target, NDK, `rusqlite`, SQLCipher, vendored OpenSSL and every packaged shared library. Tauri's support for SQLite does not itself prove this SQLCipher build works on Android. Check native memory-page alignment in a 16 KB Android environment. This is different from SQLCipher's database page-size setting. Current Android documentation describes Google Play compatibility for relevant API 35+ releases and states February 1, 2027 as the update deadline at retrieval; recheck it when publishing. [16 KB page-size source](https://developer.android.com/guide/practices/page-sizes).

Android can terminate the app process. A React state change, pending Promise or Rust thread is not durable save evidence. Acknowledge success only after local commit; restore the work context from identifiers and reload records from disk. The proposed persisted queue follows Android's local-first architecture guidance. Background retry should integrate with appropriate Android scheduling such as WorkManager. Continuous background synchronization cannot be promised. Always provide a visible manual sync action. [Offline-first source](https://developer.android.com/topic/architecture/data-layer/offline-first), [WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started).

Use Android document/share APIs for report and backup files. Desktop filesystem paths are not the phone export contract. Choose package identity, signing custody and distribution deliberately; test that an upgrade preserves records. Development sideloading, signed APK distribution and Play AAB distribution are distinct stages.

## 6. Shared architecture and synchronization

Share durable concepts and rules first: learner IDs, section membership, assignments, grading policy versions, assessment semantics, command DTOs and synchronization operation formats. Share portable Rust implementation where it helps. Keep key stores, background scheduling, file sharing, install/update and presentation platform-specific. Do not immediately split the whole Rust application into many crates; extract only where the Android boundary proves necessary.

Each device gets its own encrypted database. Synchronize validated operations, never a live SQLite file through network shares or cloud-drive synchronization. SQLite WAL permits concurrent readers but still one writer; network-filesystem sharing is unsuitable for this design. [SQLite WAL](https://sqlite.org/wal.html).

A minimal operation contract:

- unique operation ID and device ID;
- school/account scope derived and revalidated at the trusted boundary;
- entity identity, schema version and base revision;
- requested change and author attribution;
- explicit acknowledgment, rejection or conflict;
- durable server cursor for incoming changes.

Commit the local school record and outgoing operation in one transaction. The hub deduplicates operation IDs. Persist incoming records and their cursor together. If the server commits but the acknowledgment is lost, retry must return the prior result rather than create a second record.

Retain one authoritative school hub initially. A disconnected phone can save locally; official acceptance waits for the hub. Laptop sleep, changed IP, firewall and Wi-Fi isolation must be visible operational states. A hosted endpoint could simplify remote reachability, but changes cost/operations/authority and needs a separate decision. Do not build multi-master hub-plus-cloud infrastructure before one authority works.

A disconnected device cannot immediately learn that its user was revoked elsewhere. Cache bounded assignment scope, then revalidate pending changes on reconnect. Rejected work can remain a recoverable draft without being misrepresented as an accepted school record.

Avoid generic last-write-wins for attendance and grades. Keep both versions when the same record changes concurrently, show the responsible teacher the difference and preserve correction provenance. Phone wall-clock time is not conflict authority.

Review transport deliberately. The inspected Cargo manifest uses a client without a TLS feature, and historical comments describe loopback/plain HTTP while later code supports LAN interfaces. Audit the actual listener/client boundaries before mobile transfer. Encrypted payloads do not alone prove request authentication, transport metadata confidentiality or resistance to replay. Use a documented trusted transport or a properly implemented protected endpoint; this is an engineering task, not legal paperwork.

A material dependency check: SQLite documents a rare WAL-reset race affecting multiple connections with concurrent writes/checkpoints. It reports fixes in 3.51.3+ and backports 3.44.6/3.50.7. This study did not establish the runtime SQLite version embedded in the app's SQLCipher builds or that LIKHA exercises the vulnerable pattern. Query actual engine versions and review concurrency before claiming it is affected or fixed. [SQLite issue description](https://sqlite.org/wal.html#walreset).

## 7. Backup is a product workflow

Device-bound key protection and portable recovery solve different problems. Design a separately encrypted recovery package using vetted encryption/KDF libraries, stored algorithm parameters and a user-controlled recovery credential. Do not export an unprotected production DB to make restoration convenient.

Include the school identity, schema/migration version, relevant attachments, operation IDs, revisions/cursors and integrity metadata. Restoration must not resend previously accepted changes as new operations. Display what will be replaced or imported before committing. Test wrong credential, truncation, tampering, interrupted restore and newer/older schema handling.

SQLCipher documents export/rekey primitives, but `sqlcipher_export` does not automatically preserve target `user_version` or `auto_vacuum`; the application must address applicable metadata. These primitives are not a complete recovery UI. [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/).

## 8. Five-expert debate

The five AI specialist roles were Windows delivery, Android integration, offline data/sync, Codex/harness economics and teacher product/UX. Each supplied a proposal and challenged the competing recommendations.

| Disputed question                   | Initial positions                                                                                          | Challenge and final resolution                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One framework or rewrite?           | Windows favored reuse; Android preferred Tauri feasibility; Flutter remained credible                      | Tauri first is an experiment, not dogma. Kotlin fallback avoids rewriting Windows to rescue one mobile integration. Flutter requires comparative evidence |
| Laptop hub or cloud?                | Data expert initially preferred optional relay/cloud availability; existing project chose laptop authority | Preserve one school-laptop authority for the first slice. State sleep/network/recovery limits. Hosted authority remains an explicit future option         |
| Same features on both platforms?    | Shared code was attractive; teacher expert prioritized class-session capture                               | Share rules/contracts; use different task-appropriate interfaces. Full mobile SF1-SF10 parity is deferred                                                 |
| Remove all protection?              | User wanted development unblocked                                                                          | Remove harness ceremony and legal-policy development stops. Keep application checks against misplaced records, data loss and invalid packages             |
| Popular framework or minimal Codex? | Superpowers has largest visible adoption among compared workflow frameworks                                | Full mandatory planning/sign-off could recreate the unwanted gates. Use native Codex baseline and selectively pilot workflows                             |
| Encryption or recoverability?       | Existing DPAPI protects local storage                                                                      | Every expert accepted separate portable recovery proof on a clean second device                                                                           |

Dissent remains useful. Android and Windows experts reject an indefinite Tauri experiment. Data expert rejects an invisible dependence on an awake laptop. Teacher expert rejects a compiled APK as evidence of usefulness. Harness expert rejects indiscriminate removal of all useful task skills and token claims based only on prompt size. These objections are reflected in the acceptance criteria.

## 9. Apply the seven requested thinking methods

1. **Explore unconventional approaches:** encrypted versioned transfer packages can prove cross-device exchange before continuous sync; an Android capture-only companion can reduce scope; a read-only PWA can supplement native clients. Imports still require duplicate, scope and conflict handling.
2. **Read between the lines:** the desired change is autonomous useful development rather than another large governance framework.
3. **Five-expert debate:** proposals and challenge responses are recorded above; disagreement changed the hub decision and clarified fallback criteria.
4. **Think backwards:** start from a correct Windows report incorporating recovered Android entries; derive persistence, scope, sync, export and recovery requirements from that result.
5. **Question assumptions:** one framework need not mean one UI; encrypted need not mean recoverable; local-first need not mean cloud-free; a green CI run need not mean a school PC works.
6. **Point out blind spots:** missing hardware inventory, school Wi-Fi isolation, account provisioning offline, key invalidation, teacher reassignment, printer compatibility, mobile background constraints and actual backup custody.
7. **Raise abstraction twice:** screen -> classroom workflow -> reduced teacher burden with trusted records. Measure that outcome instead of feature/agent counts.

## 10. GitHub Codex systems: October 2026 snapshot

Retrieved from GitHub REST repository metadata on October 2, 2026. These are cumulative stars/forks and current activity, not October growth or a verified monthly popularity ranking.

| Candidate                                                   |   Stars |  Forks | Latest push | Status/fit                                                                                |
| ----------------------------------------------------------- | ------: | -----: | ----------- | ----------------------------------------------------------------------------------------- |
| [openai/codex](https://github.com/openai/codex)             | 127,598 | 19,971 | Oct 2       | Official execution base; recommended                                                      |
| [obra/superpowers](https://github.com/obra/superpowers)     | 294,195 | 26,311 | Sep 27      | Largest cumulative adoption among compared workflow frameworks; adopt methods selectively |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) |  53,722 |  6,053 | Oct 2       | Useful scalable planning; no need to impose on every small fix                            |
| [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex)   |  33,433 |  2,544 | Oct 1       | Team/runtime capabilities; native Windows is a secondary path                             |
| [gsd-core](https://github.com/open-gsd/gsd-core)            |  10,094 |    723 | Oct 2       | Active successor; phased fresh-context work can help major migrations                     |
| [get-shit-done](https://github.com/gsd-build/get-shit-done) |  64,406 |  5,440 | May 31      | Archived; do not choose as a new installation target                                      |

The numbers changed slightly during research, as expected. No independently measured token-saving percentage or quality superiority was established. Superpowers documents a workflow with design approval, detailed task planning, TDD and review; its own inline mode uses fewer agent calls. OMX documents macOS/Linux/tmux as its preferred team environment and Windows as secondary. An active README is not a performance benchmark.

Recommendation: **native Codex plus a small repository-specific harness**, with selected debugging/review methods rather than a stack of frameworks. Official OpenAI guidance supports concise AGENTS instructions and skills loaded progressively. Existing Codex supplies orchestration/context features; recreating them in a custom control plane is unnecessary without demonstrated need. [AGENTS guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [skills](https://learn.chatgpt.com/docs/build-skills), [execution plans](https://developers.openai.com/cookbook/articles/codex_exec_plans).

Benchmark three comparable tasks: UI correction, attendance/grade rule correction, and native build/recovery spike. Compare native Codex baseline, native Codex plus selected workflows, and one full framework. Record total tokens across all agents, completion time, first-pass success, rework, test evidence and defects. No simulated numerical results should be entered as observed data.

## 11. Work backwards from the first complete journey

| Step                | Teacher action                                                       | Observable acceptance result                                                              |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Windows setup       | Import synthetic Grade 10 rosters and assign advisory/Math/ICT loads | Stable learner identity; import errors/duplicates reviewed; dashboard shows assigned work |
| Android preparation | Cache assigned classes, then use airplane mode                       | Clear cache coverage; roster opens without a network timeout                              |
| Classroom capture   | Mark attendance, undo a mistake, enter a quiz                        | Durable saves; no empty score converted to zero; correct attendance type                  |
| Interruption        | Force-stop and reboot Android offline                                | Every acknowledged operation remains; failed save never shows success                     |
| Reconnect           | Sync against hub; create one overlapping Windows correction          | Deduplication; visible conflict; deliberate resolution                                    |
| Windows review      | Login to dashboard, edit score with keyboard                         | Latest accepted data and deterministic totals without re-encoding                         |
| Report              | Preview/export/open/print implemented report                         | Latest edits and fixture totals reconcile; prototype/official status is honest            |
| Recovery            | Restore encrypted backup on clean installation                       | Roster, assignments, scores, attendance and sync metadata reconcile                       |

Suggested pilot targets, not measured results: approximately 40 learners' attendance in under two minutes after familiarization; dashboard-to-class in two selections; cold offline class under two seconds on the chosen phone; p95 local-save feedback below one second; zero lost acknowledged operations; every injected conflict detected; exact report fixture agreement; 90% independent core-journey completion by day three. Use 3-5 teachers and one coordinator for ten teaching days after synthetic/device validation.

Windows interaction emphasizes keyboard movement, bulk paste validation, large-text/high-DPI use and undo. Android emphasizes touch-sized controls, TalkBack names, roster search, text scaling and persistent class context. Convey state with text, not only colors. These targets need actual device and teacher observation.

## 12. Execution stages and exit decisions

**Stage A — harness reset (this change):** active instructions, hooks, context and verification housekeeping only. No app DB, auth, calculation or sync behavior changed.

**Stage B — Android spike:** suggested five focused engineering days to establish encrypted startup, key handling, atomic save/outbox, process death, document export, upgrade and second-device restore. The budget is an experiment estimate, not a promise. If a critical native integration fails, compare a Kotlin companion using the same contracts.

**Stage C — two-device workflow:** one logical school authority, authenticated assignment-scoped transfers, durable queues, lost-ack retry, clock-skew and concurrent-edit tests, account switching and hub restart recovery. Review old registered attendance commands before broad teacher use; tighter new wrappers do not automatically secure older entry points.

**Stage D — package and teacher pilot:** actual Windows/Android artifacts, offline installation, signed upgrade, accessible interaction, report reconciliation and portable restore. Choose supported OS/device targets from hardware inventory; do not invent them.

**Stage E — expand:** school-year lifecycle, validated official templates and high-value administrative workflows. Timetable optimization, AI, nutrition, district consolidation and complete mobile parity are candidates after the first trustworthy loop, not permanent development prohibitions.

## 13. Limits and verification record

This study inspected current source and primary platform documentation, live repository metadata, five specialist proposals and challenge responses. It did not compile the native code, identify the embedded SQLite version, run the app on hardware, validate live school data or measure token consumption. The local environment has Node but no Rust toolchain; native proof must run on appropriate CI/devices.

Harness verification results and review findings are recorded in `docs/research/HARNESS-RESET-VERIFICATION.md`. The root guidance and compact task replace old startup requirements. Legal-policy development prerequisites were removed; applicable external requirements cannot be waived by project configuration.
