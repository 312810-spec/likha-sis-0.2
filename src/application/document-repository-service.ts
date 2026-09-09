import type { DocumentRepositoryProviderPort } from "../domain/ports/document-repository-provider";
import { ValidationError } from "../domain/errors";
import type {
  DocumentRepositoryAppRegistration,
  DocumentRepositoryConnectionStatus,
  QueuedUpload,
  UploadCandidate,
  UploadableArtifactKind,
} from "../domain/document-repository";

const UPLOADABLE_ARTIFACT_KINDS: readonly UploadableArtifactKind[] = [
  "sf1-export",
  "sf9-export",
  "sf10-export",
  "disaster-recovery-backup",
];

/** True only for the closed set of artifact kinds this project's own
 * export/backup mechanisms produce — never true for an arbitrary
 * caller-supplied string, which is the point: this is the first of two
 * independent layers keeping the live database file from ever becoming a
 * valid upload target (the second, authoritative layer is the Rust
 * `microsoft365_upload_queue::enqueue` guard — see ADR-0088). */
export function isUploadableArtifactKind(value: string): value is UploadableArtifactKind {
  return (UPLOADABLE_ARTIFACT_KINDS as readonly string[]).includes(value);
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Official School Repository (Microsoft 365) application service —
 * validates input before ever reaching `DocumentRepositoryProviderPort`,
 * matching every other `*-service.ts` in this codebase
 * (`.claude/rules/architecture.md`). See ADR-0088: the OAuth/Graph HTTP
 * client and DPAPI-protected token storage live entirely behind this
 * port, in Rust — this service never sees a token.
 */
export class DocumentRepositoryApplicationService {
  constructor(private readonly provider: DocumentRepositoryProviderPort) {}

  getConnectionStatus(): Promise<DocumentRepositoryConnectionStatus> {
    return this.provider.getConnectionStatus();
  }

  async configure(registration: DocumentRepositoryAppRegistration): Promise<void> {
    const tenantId = registration.tenantId.trim();
    const clientId = registration.clientId.trim();
    if (!tenantId) {
      throw new ValidationError("A Microsoft 365 tenant ID is required.");
    }
    if (!clientId) {
      throw new ValidationError("An Azure AD app (client) ID is required.");
    }
    if (/\s/.test(tenantId) || /\s/.test(clientId)) {
      throw new ValidationError("Tenant ID and client ID must not contain whitespace.");
    }
    return this.provider.configure({ tenantId, clientId });
  }

  connect(): Promise<void> {
    return this.provider.connect();
  }

  disconnect(): Promise<void> {
    return this.provider.disconnect();
  }

  async queueUpload(candidate: UploadCandidate): Promise<QueuedUpload> {
    if (!isUploadableArtifactKind(candidate.kind)) {
      throw new ValidationError(
        `"${candidate.kind}" is not a recognized uploadable artifact kind.`,
      );
    }
    const fileName = candidate.fileName.trim();
    if (!fileName) {
      throw new ValidationError("A file name is required.");
    }
    if (!SHA256_HEX.test(candidate.sha256)) {
      throw new ValidationError("A valid SHA-256 checksum is required.");
    }
    if (!candidate.filePath.trim()) {
      throw new ValidationError("A file path is required.");
    }
    return this.provider.queueUpload({ ...candidate, fileName });
  }

  listQueuedUploads(): Promise<QueuedUpload[]> {
    return this.provider.listQueuedUploads();
  }

  drainQueue(): Promise<QueuedUpload[]> {
    return this.provider.drainQueue();
  }
}
