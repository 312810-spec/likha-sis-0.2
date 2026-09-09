/**
 * Domain types for the Official School Repository's Microsoft 365
 * integration (`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`,
 * ADR-0088). This file has NO I/O and NO Microsoft Graph/MSAL knowledge —
 * only the shapes `DocumentRepositoryProviderPort` and its callers share.
 *
 * Scope for this batch: per-school Azure AD app configuration, the OAuth
 * connection lifecycle, and an OPPORTUNISTIC UPLOAD QUEUE for already-
 * generated export artifacts (SF1/SF9/SF10 exports, disaster-recovery
 * backups) — never the live encrypted SQLite database file. See
 * `UploadableArtifactKind` below: it is a closed enum of artifact kinds
 * this project's own export/backup mechanisms produce, deliberately NOT
 * an arbitrary file path, so a caller cannot construct a queue entry that
 * points at `likha-sis.db`/`likha-sis.key` even by mistake — the type
 * system has no constructor for "the live database" in the first place.
 * `repository/microsoft365-upload-queue.rs`'s runtime guard is the second,
 * independent layer (never trust a client-side type alone for a security
 * boundary — `.claude/rules/architecture.md`).
 */

/** The fixed set of artifacts this project will ever queue for upload to
 * the school's official repository. Intentionally closed — adding a new
 * kind means editing this union (and the matching Rust
 * `UploadArtifactKind` enum) by hand, never accepting an arbitrary
 * caller-supplied string. */
export type UploadableArtifactKind =
  "sf1-export" | "sf9-export" | "sf10-export" | "disaster-recovery-backup";

/** A candidate file this project itself already generated and now wants
 * queued for opportunistic upload. `filePath` must point at a file this
 * session's own export/backup command just produced — never a path the
 * UI lets a user browse to and never the live database file (see this
 * module's own doc comment). */
export interface UploadCandidate {
  kind: UploadableArtifactKind;
  filePath: string;
  fileName: string;
  /** Lowercase-hex SHA-256 of the file's bytes at the moment it was
   * queued, so a later "did this actually upload the file I generated"
   * audit never has to trust the filename alone. */
  sha256: string;
}

/** @public — only consumed structurally, via `QueuedUpload.status`. */
export type QueuedUploadStatus = "queued" | "uploading" | "uploaded" | "failed";

/** @public — only consumed structurally, via `QueuedUpload.lastErrorCode`
 * and the Rust `AttemptErrorCode` it mirrors. */
export type UploadAttemptErrorCode =
  "offline" | "timeout" | "unauthorized" | "provider-rejected" | "not-configured";

export interface QueuedUpload {
  id: string;
  kind: UploadableArtifactKind;
  fileName: string;
  status: QueuedUploadStatus;
  attemptCount: number;
  lastErrorCode: UploadAttemptErrorCode | null;
  queuedAt: string;
}

/** Per-school Azure AD app registration this school's ICT coordinator or
 * School Head enters — see `docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`:
 * each school registers its OWN app in its OWN tenant, this project never
 * ships a shared multi-tenant app or embeds a client secret. */
export interface DocumentRepositoryAppRegistration {
  tenantId: string;
  clientId: string;
}

/** What the Settings screen needs to render connection state. Never
 * carries a token — access/refresh tokens live only in the
 * DPAPI-protected token store on the Rust side and never cross the Tauri
 * IPC boundary as plain values (ADR-0088). */
export interface DocumentRepositoryConnectionStatus {
  /** True once an app registration has been saved, regardless of whether
   * the OAuth connection has been completed yet. */
  configured: boolean;
  /** True only once a refresh token is present in the DPAPI-protected
   * store — i.e. the OAuth round trip actually completed. */
  connected: boolean;
  tenantId: string | null;
  clientId: string | null;
  /** ISO-8601 timestamp of the last successful token refresh, or the
   * initial connection if no refresh has happened yet. Null when never
   * connected. */
  lastVerifiedAt: string | null;
  /** A short, teacher-safe description of the last connection failure,
   * if any — never the raw OAuth error payload. */
  lastError: string | null;
}
