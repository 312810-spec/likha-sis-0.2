# Harness replacement verification

Date: 2026-10-02. Base: `3e7a2508da0f82c662b133e28117a9be4f0f06e6`.

## Changes

- Replaced root guidance, bootstrap, active plan, handoff and project memory with current, concise task guidance.
- Archived machine-specific hooks, custom agent configurations, rubric metadata, historical harness documents and eight orchestration/policy skills outside active discovery. Preserved attribution and licenses.
- Removed the scheduled harness-certification workflow and rubric verification from the full quality prerequisite. Retained application quality and security workflows.
- Replaced harness verification with checks for required documents and referenced local Node scripts.
- Updated five retained engineering skills to use actual repository references and evidence-based review, without mandatory retired reviewers or legal-policy approval.
- Added a separate release checklist and Windows/Android study with five specialist proposals and challenge-round conclusions.
- Updated CI classification so active Codex configuration is harness work and historical archived scripts do not count as application JavaScript changes.

Legal-policy prerequisites no longer block ordinary development. Editing these instructions does not change external laws. Application authentication, record integrity, encryption and signing remain engineering requirements.

## Executed checks

| Check                                                   | Result                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts`                               | Passed; 270 packages installed                                                      |
| `npm run quality`                                       | Passed: TypeScript, ESLint, formatting, architecture, dead-code analysis and Vitest |
| Vitest                                                  | 126 test files and 1,181 tests passed                                               |
| ESLint                                                  | Zero errors; one existing `src/App.tsx` effect-dependency warning                   |
| `node --test scripts/ci/classify-changes.node-test.mjs` | 10 tests passed                                                                     |
| `npm run harness:verify`                                | Passed with replacement verifier                                                    |
| `git diff --check`                                      | Passed                                                                              |

Five independent AI specialists reviewed Windows delivery, Android integration, synchronization/data recovery, harness economics and teacher workflows. Their proposals were challenged in a second round; unresolved device and user validation is stated in the study.

## Limits

This change does not implement Android or modify application source. Rust tooling was unavailable here. Native Rust tests, Windows packaging, Android native builds, SQLCipher runtime-version verification, physical-device lifecycle tests, clean-device recovery and teacher pilots were not run. The passing frontend suite does not establish those claims. GitHub CI results should be checked on the pull request.

No token-saving percentage was measured. Smaller current guidance, targeted retrieval and optional specialists are a proposed efficient workflow; GitHub stars measure cumulative adoption, not output quality or this month's growth.
