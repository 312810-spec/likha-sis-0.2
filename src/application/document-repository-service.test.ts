import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { DocumentRepositoryProviderPort } from "../domain/ports/document-repository-provider";
import type {
  DocumentRepositoryAppRegistration,
  DocumentRepositoryConnectionStatus,
  QueuedUpload,
  UploadCandidate,
} from "../domain/document-repository";
import {
  DocumentRepositoryApplicationService,
  isUploadableArtifactKind,
} from "./document-repository-service";

const VALID_SHA256 = "a".repeat(64);

class FakeDocumentRepositoryProvider implements DocumentRepositoryProviderPort {
  status: DocumentRepositoryConnectionStatus = {
    configured: false,
    connected: false,
    tenantId: null,
    clientId: null,
    lastVerifiedAt: null,
    lastError: null,
  };
  configureCalls: DocumentRepositoryAppRegistration[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  queueUploadCalls: UploadCandidate[] = [];
  queue: QueuedUpload[] = [];

  async getConnectionStatus(): Promise<DocumentRepositoryConnectionStatus> {
    return this.status;
  }

  async configure(registration: DocumentRepositoryAppRegistration): Promise<void> {
    this.configureCalls.push(registration);
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  async queueUpload(candidate: UploadCandidate): Promise<QueuedUpload> {
    this.queueUploadCalls.push(candidate);
    const entry: QueuedUpload = {
      id: `q-${this.queue.length + 1}`,
      kind: candidate.kind,
      fileName: candidate.fileName,
      status: "queued",
      attemptCount: 0,
      lastErrorCode: null,
      queuedAt: "2026-09-09T00:00:00.000Z",
    };
    this.queue.push(entry);
    return entry;
  }

  async listQueuedUploads(): Promise<QueuedUpload[]> {
    return this.queue;
  }

  drainCalls = 0;

  async drainQueue(): Promise<QueuedUpload[]> {
    this.drainCalls += 1;
    return this.queue;
  }
}

function validCandidate(overrides: Partial<UploadCandidate> = {}): UploadCandidate {
  return {
    kind: "sf10-export",
    filePath: "/exports/sf10-2026.pdf",
    fileName: "sf10-2026.pdf",
    sha256: VALID_SHA256,
    ...overrides,
  };
}

describe("isUploadableArtifactKind", () => {
  it("accepts every recognized export/backup kind", () => {
    expect(isUploadableArtifactKind("sf1-export")).toBe(true);
    expect(isUploadableArtifactKind("sf9-export")).toBe(true);
    expect(isUploadableArtifactKind("sf10-export")).toBe(true);
    expect(isUploadableArtifactKind("disaster-recovery-backup")).toBe(true);
  });

  it("rejects an arbitrary string, including anything shaped like the live database", () => {
    expect(isUploadableArtifactKind("likha-sis.db")).toBe(false);
    expect(isUploadableArtifactKind("raw-database")).toBe(false);
    expect(isUploadableArtifactKind("")).toBe(false);
  });
});

describe("DocumentRepositoryApplicationService", () => {
  it("getConnectionStatus delegates to the provider", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    provider.status = { ...provider.status, configured: true, connected: true };
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(service.getConnectionStatus()).resolves.toEqual(provider.status);
  });

  it("configure trims and forwards a valid registration", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await service.configure({ tenantId: "  contoso-tenant-id  ", clientId: " client-id " });

    expect(provider.configureCalls).toEqual([
      { tenantId: "contoso-tenant-id", clientId: "client-id" },
    ]);
  });

  it("configure rejects an empty tenant ID", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(service.configure({ tenantId: "   ", clientId: "c" })).rejects.toThrow(
      ValidationError,
    );
    expect(provider.configureCalls).toEqual([]);
  });

  it("configure rejects an empty client ID", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(service.configure({ tenantId: "t", clientId: "" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("configure rejects whitespace embedded inside an ID", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(
      service.configure({ tenantId: "tenant with spaces", clientId: "c" }),
    ).rejects.toThrow(ValidationError);
  });

  it("connect and disconnect delegate to the provider", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await service.connect();
    await service.disconnect();

    expect(provider.connectCalls).toBe(1);
    expect(provider.disconnectCalls).toBe(1);
  });

  it("queueUpload forwards a valid candidate", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    const result = await service.queueUpload(validCandidate());

    expect(result.status).toBe("queued");
    expect(provider.queueUploadCalls).toHaveLength(1);
  });

  it("queueUpload rejects a kind outside the closed uploadable set", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(
      service.queueUpload(
        validCandidate({
          // Deliberately cast an unrecognized string past the type
          // system, the way a bug or a future careless caller might --
          // this is exactly the case the runtime guard exists for.
          kind: "raw-database" as UploadCandidate["kind"],
        }),
      ),
    ).rejects.toThrow(ValidationError);
    expect(provider.queueUploadCalls).toEqual([]);
  });

  it("queueUpload rejects a malformed checksum", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(
      service.queueUpload(validCandidate({ sha256: "not-a-real-checksum" })),
    ).rejects.toThrow(ValidationError);
  });

  it("queueUpload rejects an empty file name", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(service.queueUpload(validCandidate({ fileName: "  " }))).rejects.toThrow(
      ValidationError,
    );
  });

  it("queueUpload rejects an empty file path", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await expect(service.queueUpload(validCandidate({ filePath: "  " }))).rejects.toThrow(
      ValidationError,
    );
  });

  it("listQueuedUploads delegates to the provider", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);
    await service.queueUpload(validCandidate());

    await expect(service.listQueuedUploads()).resolves.toHaveLength(1);
  });

  it("drainQueue delegates to the provider", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const service = new DocumentRepositoryApplicationService(provider);

    await service.drainQueue();

    expect(provider.drainCalls).toBe(1);
  });
});
