# ADR-0002 — LocalDatabase Foundation (M1)

Status: Accepted

## Context

M0 established the workspace. M1 needed one reusable, provider-independent
persistence pattern — the `Repository Ports -> Infrastructure/Platform
Adapters` boundary from `ARCHITECTURE.md` — proven with ordinary SQLite
before any encryption or sync work.

The main open question: where does SQL execution and school-scope
isolation enforcement live — in the Rust/Tauri core, or in the TypeScript
frontend via a plugin such as `@tauri-apps/plugin-sql`?

## Decision

**All SQL lives in the Rust core.** The frontend never sends SQL, not even
parameterized SQL; it only calls narrow, purpose-built Tauri commands
(`list_schools`, `create_school`, `list_learners_by_school`,
`create_learner`). `@tauri-apps/plugin-sql` was rejected: it would satisfy
the letter of "provider-specific code behind an adapter," but it hands the
renderer process the ability to construct arbitrary queries, which weakens
"isolation enforced at a trusted boundary, not UI filtering" — and
security/privacy outranks every other priority for this project.

Concretely:

- **Driver**: `rusqlite` (`bundled` feature, compiles SQLite from source —
  no dependency on the OS-provided SQLite version).
- **Migrations**: `rusqlite_migration`, deterministic and append-only
  (`Migrations::new(vec![M::up(...), ...])`), applied via `to_latest()` on
  every connection open. Never edit or reorder a released migration; add a
  new one.
- **Connection strategy**: one `rusqlite::Connection` guarded by
  `std::sync::Mutex`, managed as Tauri state. SQLite does not benefit from
  concurrent writers; a single serialized connection is the simplest
  correct fit for a single-user desktop app. `foreign_keys=ON`,
  `journal_mode=WAL`, and a `busy_timeout` are set on every open.
- **Primary keys**: UUIDv7 strings generated in Rust, not autoincrement
  integers — required so records created offline on different devices can
  never collide once cloud sync exists, even though sync itself is out of
  scope here.
- **Errors crossing IPC**: `AppError` logs full detail
  (`log::error!`, includes SQL/paths where present) server-side only, and
  serializes to the frontend as a generic category (`"database_error"`,
  etc.) — never the raw error text.
- **Mutex poisoning is recovered from**, not propagated — a single
  unexpected panic while the lock was held must not permanently brick the
  app for the rest of the process lifetime.
- **School isolation**: read functions for tenant-scoped data (e.g.
  `Learner`) are only ever exposed school-scoped
  (`list_by_school(school_id)`); there is intentionally no "list/find by
  bare id" path exposed as a command or made `pub` outside its module.

A thin TypeScript layer (`src/domain/{school,learner}.ts`,
`src/domain/ports/*-repository.ts`, `src/infrastructure/tauri/*-repository.ts`)
mirrors the same shapes so UI/application code depends only on the port
interfaces, never on `@tauri-apps/api` or Tauri directly.

## Consequences

- Most SIS query/business logic will live in Rust (`src-tauri/src/repository/`)
  going forward, not TypeScript — an accepted tradeoff for the stronger
  trust boundary. Application-level orchestration and all UI stay in
  TypeScript.
- Every new tenant-scoped entity must follow the same shape: a
  school-scoped list function, parameterized queries only, no
  bare-id lookup exposed outside its own module.
- Encryption-at-rest is explicitly deferred to a separate later spike, as
  scoped by `ACTIVE-PLAN.md`.
