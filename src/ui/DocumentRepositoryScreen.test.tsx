import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DocumentRepositoryApplicationService } from "../application/document-repository-service";
import type { DocumentRepositoryProviderPort } from "../domain/ports/document-repository-provider";
import type {
  DocumentRepositoryAppRegistration,
  DocumentRepositoryConnectionStatus,
  QueuedUpload,
  UploadCandidate,
} from "../domain/document-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { DocumentRepositoryScreen } from "./DocumentRepositoryScreen";

class FakeDocumentRepositoryProvider implements DocumentRepositoryProviderPort {
  status: DocumentRepositoryConnectionStatus = {
    configured: false,
    connected: false,
    tenantId: null,
    clientId: null,
    lastVerifiedAt: null,
    lastError: null,
  };
  queue: QueuedUpload[] = [];
  connectResult: "ok" | "reject" = "ok";
  disconnectResult: "ok" | "reject" = "ok";

  async getConnectionStatus(): Promise<DocumentRepositoryConnectionStatus> {
    return this.status;
  }

  async configure(registration: DocumentRepositoryAppRegistration): Promise<void> {
    this.status = {
      ...this.status,
      configured: true,
      tenantId: registration.tenantId,
      clientId: registration.clientId,
    };
  }

  async connect(): Promise<void> {
    if (this.connectResult === "reject") {
      throw new Error("Microsoft sign-in was cancelled.");
    }
    this.status = { ...this.status, connected: true, lastVerifiedAt: "2026-09-09T00:00:00.000Z" };
  }

  async disconnect(): Promise<void> {
    if (this.disconnectResult === "reject") {
      throw new Error("could not disconnect");
    }
    this.status = { ...this.status, connected: false };
  }

  async queueUpload(candidate: UploadCandidate): Promise<QueuedUpload> {
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
}

function renderScreen(provider: FakeDocumentRepositoryProvider, roles: string[]) {
  const service = new DocumentRepositoryApplicationService(provider);
  return render(
    <ModeProvider>
      <DocumentRepositoryScreen documentRepositoryService={service} roles={roles} />
    </ModeProvider>,
  );
}

describe("DocumentRepositoryScreen", () => {
  it("is invisible/inert for a non-School-Head when unconfigured", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    renderScreen(provider, ["teacher"]);

    await waitFor(() =>
      expect(screen.getByText(/not set up for this school yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lets a School Head configure an unconfigured school", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const user = userEvent.setup();
    renderScreen(provider, ["school_head"]);

    await waitFor(() => expect(screen.getByLabelText(/tenant id/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/tenant id/i), "contoso-tenant");
    await user.type(screen.getByLabelText(/client.*id/i), "contoso-client");
    await user.click(screen.getByRole("button", { name: /save tenant/i }));

    await waitFor(() => expect(screen.getByText(/tenant saved/i)).toBeInTheDocument());
  });

  it("shows connection status and a Connect action for a School Head once configured", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    provider.status = {
      configured: true,
      connected: false,
      tenantId: "contoso-tenant",
      clientId: "contoso-client",
      lastVerifiedAt: null,
      lastError: null,
    };
    const user = userEvent.setup();
    renderScreen(provider, ["school_head"]);

    await waitFor(() => expect(screen.getByText(/not connected/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /connect to microsoft 365/i }));

    await waitFor(() => expect(screen.getByText(/^connected$/i)).toBeInTheDocument());
  });

  it("hides connect/disconnect actions from a non-School-Head once configured", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    provider.status = {
      configured: true,
      connected: true,
      tenantId: "contoso-tenant",
      clientId: "contoso-client",
      lastVerifiedAt: "2026-09-09T00:00:00.000Z",
      lastError: null,
    };
    renderScreen(provider, ["teacher"]);

    await waitFor(() => expect(screen.getByText(/^connected$/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disconnect/i })).not.toBeInTheDocument();
  });

  it("shows the upload queue once configured", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    provider.status = {
      configured: true,
      connected: true,
      tenantId: "contoso-tenant",
      clientId: "contoso-client",
      lastVerifiedAt: "2026-09-09T00:00:00.000Z",
      lastError: null,
    };
    await provider.queueUpload({
      kind: "sf10-export",
      filePath: "/exports/sf10.pdf",
      fileName: "sf10.pdf",
      sha256: "a".repeat(64),
    });
    renderScreen(provider, ["teacher"]);

    await waitFor(() => expect(screen.getByText(/sf10\.pdf/)).toBeInTheDocument());
    expect(screen.getByText(/waiting to send/i)).toBeInTheDocument();
  });

  it("has no accessibility violations when unconfigured for a School Head", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    const { container } = renderScreen(provider, ["school_head"]);

    await waitFor(() => expect(screen.getByLabelText(/tenant id/i)).toBeInTheDocument());

    await expectNoAccessibilityViolations(container);
  });

  it("has no accessibility violations once configured and connected", async () => {
    const provider = new FakeDocumentRepositoryProvider();
    provider.status = {
      configured: true,
      connected: true,
      tenantId: "contoso-tenant",
      clientId: "contoso-client",
      lastVerifiedAt: "2026-09-09T00:00:00.000Z",
      lastError: null,
    };
    const { container } = renderScreen(provider, ["school_head"]);

    await waitFor(() => expect(screen.getByText(/^connected$/i)).toBeInTheDocument());

    await expectNoAccessibilityViolations(container);
  });
});
