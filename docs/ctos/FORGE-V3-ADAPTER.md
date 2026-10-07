# CTOS — FORGE v3 Project Adapter

**Purpose:** Map FORGE v3 universal behavior to LIKHA-SIS / Atria-CC without changing the FORGE core.

## Runtime capability profile

At the start of every substantial run, detect rather than assume:

- Git repository read/write/push
- shell and code execution
- frontend test execution
- Rust/native test execution
- browser/UI automation
- Windows packaging/install test capability
- Android SDK/NDK/Gradle capability
- current web research
- independent verifier/subagent capability
- persistent state
- trace/log capture
- human confirmation channel

If a capability is absent, degrade gracefully and label evidence accordingly.

## CTOS capability mapping

| FORGE capability   | Preferred CTOS implementation                                          |
| ------------------ | ---------------------------------------------------------------------- |
| RETRIEVE_CONTEXT   | Git files, targeted source search, CTOS-STATE, latest checkpoint       |
| RESEARCH           | official/primary sources first when freshness or policy matters        |
| EXECUTE_CODE       | Atria shell/IDE/runtime                                                |
| TEST_BEHAVIOR      | unit, integration, browser, native, migration, recovery scenarios      |
| VERIFY_FACT        | authoritative source, source code, runtime observation                 |
| VALIDATE_STRUCTURE | TypeScript/Rust compiler, schemas, SQL checks, linters                 |
| DELEGATE           | independent verifier only when it adds real value                      |
| STORE_STATE        | Git branch, CTOS-STATE, checkpoint docs, tags                          |
| OBSERVE            | command/test logs and checkpoint evidence without PII                  |
| ESCALATE           | user/domain authority for genuinely consequential unresolved decisions |

## Context rule

Read in this order:

1. CTOS.md
2. CTOS-STATE.md
3. latest CTOS checkpoint
4. AGENTS.md
5. TASK.md
6. only source/docs relevant to the active milestone

Do not reload the whole repository history by default.

## High-Fidelity areas

Use the strongest verification mode for:

- grading/finality
- access control
- sync scope
- migrations
- schedule publication
- official-report issue/amend
- backup/recovery
- Android encryption
- release acceptance

## Generator–verifier separation

For important choices:

- generator proposes/implements
- deterministic validators run first
- an independent review pass checks criteria/evidence where semantics remain
- do not use the generator merely agreeing with itself as proof

## Consequential action boundary

Autonomous reversible development is authorized by CTOS.

Before an irreversible or externally consequential action, verify target/scope/parameters/destination and use the applicable human confirmation boundary.

Examples requiring extra care:

- production deployment
- destructive production-data migration
- account/permission changes outside the development scope
- deletion of irreplaceable records
- publication that represents itself as an official school/DepEd act

## Evidence labels

Use:

- Verified
- High confidence
- Moderate confidence
- Low confidence
- Unknown

And distinguish:

- proposed
- implemented
- tested
- verified
- blocked
- unsupported

Never invent numeric confidence percentages without an actual evaluation.

## Checkpoint behavior

Every completed CTOS milestone must:

- record exact source commit
- record exact tests/checks run
- record failures and parked dependencies
- push to GitHub
- create/push milestone tag
- confirm remote durability
- clear the screen only afterward
- continue automatically
