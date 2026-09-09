import type {
  DocumentRepositoryAppRegistration,
  DocumentRepositoryConnectionStatus,
  QueuedUpload,
  UploadCandidate,
} from "../document-repository";

/**
 * Repository port for the Official School Repository's Microsoft 365
 * connection and its opportunistic upload queue
 * (`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`, ADR-0088). School
 * scope is never a parameter — like every other same-school port in this
 * codebase, the backend always derives it from the authenticated
 * session.
 *
 * Pure interface, no I/O here — matching `ExportRepository`/
 * `SchoolLogoRepository`'s own pattern. The concrete
 * `TauriDocumentRepositoryProvider` (in `src/infrastructure/tauri/`)
 * calls narrow Tauri commands; the actual OAuth/Microsoft Graph HTTP
 * client and DPAPI-protected token storage live entirely in Rust
 * (`src-tauri/src/infrastructure/microsoft365/`) — see ADR-0088 for why
 * this differs from `WeatherClientPort`'s TS-side placement (that
 * integration carries no secret; this one must never let a refresh token
 * cross the Tauri IPC boundary as plain data).
 *
 * When no app registration has been saved yet, every method here is
 * simply unreachable from the UI — this feature must be completely
 * invisible elsewhere in the app until a School Head configures it
 * (matching the Weather & Hazard Alerts feature's own "absent, not
 * broken" precedent, ADR-0079).
 */
export interface DocumentRepositoryProviderPort {
  /** Read-only for any authenticated school member — the Settings screen
   * and any future "connection health" indicator both read this. */
  getConnectionStatus(): Promise<DocumentRepositoryConnectionStatus>;

  /** Saves (or replaces) this school's Azure AD app registration.
   * School-Head-only on the backend; does not by itself start the OAuth
   * flow. Throws if the tenant/client ID fail basic shape validation. */
  configure(registration: DocumentRepositoryAppRegistration): Promise<void>;

  /**
   * Starts the authorization-code-with-PKCE flow: opens the user's
   * default browser to the Microsoft identity platform consent page and
   * blocks until the loopback redirect completes or the flow times out.
   * On success, a refresh token is stored in the DPAPI-protected store
   * and `getConnectionStatus().connected` becomes true. School-Head-only.
   *
   * Throws (never silently fails) on: no app registration configured
   * yet, user cancellation, consent denial, or any token-exchange error
   * — the caller shows the message from `error.message` as-is (already
   * teacher-safe by the time it reaches here) rather than the raw OAuth
   * error.
   */
  connect(): Promise<void>;

  /** Deletes the stored refresh token and marks the connection
   * disconnected. Does not delete the saved app registration —
   * `connect()` can be called again without re-entering the tenant/client
   * ID. School-Head-only. */
  disconnect(): Promise<void>;

  /** Queues an already-generated export/backup artifact for opportunistic
   * upload. Returns the created queue entry. Throws if `candidate` is not
   * a recognized `UploadableArtifactKind` or its file no longer exists —
   * this never accepts an arbitrary caller-chosen path (see
   * `UploadableArtifactKind`'s own doc comment). */
  queueUpload(candidate: UploadCandidate): Promise<QueuedUpload>;

  /** Lists this school's upload queue, most recently queued first. */
  listQueuedUploads(): Promise<QueuedUpload[]>;
}
