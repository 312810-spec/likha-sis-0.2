# Architecture

## Dependency Direction

UI
↓
Application Services
↓
Domain
↓
Repository Ports
↓
Infrastructure / Platform Adapters
↓
SyncProvider
↓
Cloud

Dependencies point inward toward domain/application abstractions.

## Local-First Rule

The device database is the normal working source for application workflows. Network availability must not be required for ordinary local work.

## Infrastructure Rule

Tauri, SQLite, Cloudflare, OS APIs, and other providers belong in infrastructure/platform adapters.

## Sync Rule

Synchronization is not repository business logic and not UI logic. It is a separate subsystem behind explicit boundaries.

## Security Rule

Authorization and school isolation must be enforced at trusted boundaries, not only through UI filtering.

## Data Rule

No real learner PII in development or AI-assisted workflows.
