import { invoke } from "./invoke";
import type { DocumentRepositoryProviderPort } from "../../domain/ports/document-repository-provider";
import type {
  DocumentRepositoryAppRegistration,
  DocumentRepositoryConnectionStatus,
  QueuedUpload,
  UploadCandidate,
} from "../../domain/document-repository";

/**
 * Tauri implementation of {@link DocumentRepositoryProviderPort}
 * (ADR-0088). Every method here is a narrow call into
 * `commands::document_repository` — the OAuth/Microsoft Graph HTTP client
 * and DPAPI-protected token storage live entirely in Rust
 * (`src-tauri/src/infrastructure/microsoft365/`). A refresh/access token
 * never crosses this boundary as a plain value.
 */
export class TauriDocumentRepositoryProvider implements DocumentRepositoryProviderPort {
  getConnectionStatus(): Promise<DocumentRepositoryConnectionStatus> {
    return invoke<DocumentRepositoryConnectionStatus>("get_document_repository_connection_status");
  }

  configure(registration: DocumentRepositoryAppRegistration): Promise<void> {
    return invoke<void>("configure_document_repository", {
      tenantId: registration.tenantId,
      clientId: registration.clientId,
    });
  }

  connect(): Promise<void> {
    return invoke<void>("connect_document_repository");
  }

  disconnect(): Promise<void> {
    return invoke<void>("disconnect_document_repository");
  }

  queueUpload(candidate: UploadCandidate): Promise<QueuedUpload> {
    return invoke<QueuedUpload>("queue_document_repository_upload", {
      kind: candidate.kind,
      fileName: candidate.fileName,
      filePath: candidate.filePath,
      sha256: candidate.sha256,
    });
  }

  listQueuedUploads(): Promise<QueuedUpload[]> {
    return invoke<QueuedUpload[]>("list_document_repository_queued_uploads");
  }

  drainQueue(): Promise<QueuedUpload[]> {
    return invoke<QueuedUpload[]>("drain_document_repository_upload_queue");
  }
}
