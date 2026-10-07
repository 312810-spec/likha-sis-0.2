---
name: context7-docs
version: 2.0.0
description:
  Use for current, version-sensitive external library/framework/API documentation (for example Tauri,
  React, Vite, Playwright, Rust crates) when local source/lockfiles are insufficient or model knowledge
  may be stale. Not for LIKHA project history, architecture judgment, school/DepEd rules, learner data,
  or runtime proof.
---

# Context7 Technical Documentation

Context7 is an optional **technical-upstream evidence source** for development. It is not a LIKHA
runtime dependency and must never sit on the teacher-facing/offline path.

## Activation

Use only when:

- the task depends on an external software library/framework/API; and
- exact current/version-specific behavior could affect correctness; and
- repository source, generated types, lockfiles, or existing tests do not already answer it.

Do not use for LIKHA business/domain rules, CTOS decisions, school/DepEd/curriculum facts,
learner/personnel records, code review that needs no external API facts, or repository-memory
retrieval.

## Freshness gate — required before material use

1. Read the actual dependency and version from `package.json`, `package-lock.json`, `Cargo.toml`,
   `Cargo.lock`, or the relevant manifest.
2. Check the current Context7 CLI release with:
   ```bash
   npm view ctx7 version
   ```
   If registry access is unavailable, verify the current command surface from Context7's official
   CLI/release documentation.
3. The last upstream checkpoint re-verified on **2026-10-07** observed `ctx7@0.5.12`. Treat that
   only as a dated checkpoint; never assume it is still current.
4. If the current release differs, inspect the official Context7 CLI changelog/docs before using
   changed commands or flags.
5. Prefer a one-shot invocation using the verified version. Do not globally install or silently
   upgrade tooling for a lookup.

## Retrieval flow

Use the current documented two-step CLI flow:

```bash
npx -y ctx7@<verified-version> library <library-name> "<specific task/question>" --json
npx -y ctx7@<verified-version> docs <library-id> "<specific task/question>" --json
```

- Prefer a returned **version-specific** library ID matching LIKHA's installed/target version.
- If only a canonical ID exists, label the evidence unversioned/unpinned.
- Keep the query focused. Resolve once and reuse the library ID during the same task.
- For Rust crates, verify the crate/package version from `Cargo.lock` before retrieval.

## Privacy / data-minimization gate

Only send a normalized technical question, public package name, API symbol, and version when needed.

Never send:

- learner/personnel names, LRNs, grades, attendance, health or school records;
- credentials, tokens, API keys, passwords, secrets;
- proprietary source code, database rows, logs, or full prompts;
- internal business logic when a generic API question is sufficient.

## Evidence contract

Classify Context7 output as **TECHNICAL_UPSTREAM_SOURCE**.

It can support a statement such as “upstream Tauri 2 docs describe this API.” It cannot prove:

- LIKHA compiles or tests;
- Windows/Android behavior works;
- a migration is safe;
- authorization/data rules are correct;
- a generated/reporting behavior is official.

After implementation, run the applicable LIKHA verification ladder from `AGENTS.md` / CTOS.

## Failure behavior

If Context7 is unavailable, times out, lacks the needed version, or hits quota:

1. use the official upstream docs/repository/release notes directly;
2. continue only where local evidence is sufficient;
3. record unresolved material facts instead of guessing.

Do not enable a paid Context7 plan, private-source indexing, or new standing credentials without
explicit owner approval.

## Runtime boundary

Do not add Context7 requests, credentials, SDKs, or network calls to the LIKHA teacher application
merely because this development skill exists. LIKHA's core classroom workflows remain
local/offline-first.
