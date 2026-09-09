import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LearnerApplicationService } from "../application/learner-service";
import { TransferRecordApplicationService } from "../application/transfer-record-service";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { TransferRecordRepository } from "../domain/ports/transfer-record-repository";
import type { TransferRecord, TransferRecordInput } from "../domain/transfer-record";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { TransfersScreen } from "./TransfersScreen";
import { ModeProvider } from "./theme/ModeContext";

const LEARNER: Learner = {
  id: "l1",
  schoolId: "s1",
  givenName: "Ana",
  familyName: "Cruz",
  lrn: "123456789012",
  sex: "F",
  createdAt: "now",
};

const RECORD: TransferRecord = {
  id: "t1",
  schoolId: "s1",
  learnerId: "l1",
  direction: "out",
  transferDate: "2026-06-15",
  otherSchoolName: "Synthetic Receiving School",
  status: "pending",
  remarks: null,
  createdByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
};

class FakeLearnerRepository implements LearnerRepository {
  async list(): Promise<Learner[]> {
    return [LEARNER];
  }
  async create(): Promise<Learner> {
    return LEARNER;
  }
  async createWithDuplicateCheck(): Promise<CreateLearnerResult> {
    return { kind: "created", learner: LEARNER };
  }
  async updateProfile(): Promise<Learner | null> {
    return LEARNER;
  }
}

class FakeTransferRecordRepository implements TransferRecordRepository {
  recordCalls: TransferRecordInput[] = [];
  updateStatusCalls: Array<{ id: string; status: TransferRecord["status"] }> = [];
  records: TransferRecord[] = [];

  async record(input: TransferRecordInput): Promise<TransferRecord> {
    this.recordCalls.push(input);
    const created: TransferRecord = {
      ...RECORD,
      id: `t${this.records.length + 2}`,
      direction: input.direction,
      transferDate: input.transferDate,
      otherSchoolName: input.otherSchoolName,
      status: input.status,
      remarks: input.remarks ?? null,
    };
    this.records = [...this.records, created];
    return created;
  }

  async listForLearner(): Promise<TransferRecord[]> {
    return this.records;
  }

  async listForSchool(): Promise<TransferRecord[]> {
    return this.records;
  }

  async updateStatus(id: string, status: TransferRecord["status"]): Promise<TransferRecord> {
    this.updateStatusCalls.push({ id, status });
    const updated = { ...RECORD, id, status };
    this.records = this.records.map((r) => (r.id === id ? updated : r));
    return updated;
  }
}

function renderScreen(transferRepo: FakeTransferRecordRepository) {
  const transferRecordService = new TransferRecordApplicationService(transferRepo);
  const learnerService = new LearnerApplicationService(new FakeLearnerRepository());
  return render(
    <ModeProvider>
      <TransfersScreen
        transferRecordService={transferRecordService}
        learnerService={learnerService}
      />
    </ModeProvider>,
  );
}

describe("TransfersScreen", () => {
  it("renders the create form once learners load", async () => {
    renderScreen(new FakeTransferRecordRepository());

    await waitFor(() => expect(screen.getByLabelText("Learner")).toBeInTheDocument());
    expect(screen.getByLabelText("Direction")).toBeInTheDocument();
    expect(screen.getByLabelText("Transfer date")).toBeInTheDocument();
  });

  it("shows an empty state when there are no transfer records yet", async () => {
    renderScreen(new FakeTransferRecordRepository());

    await waitFor(() => expect(screen.getByLabelText("Learner")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/no transfer records yet/i)).toBeInTheDocument());
  });

  it("saving calls the application service's record method with the entered fields", async () => {
    const repo = new FakeTransferRecordRepository();
    renderScreen(repo);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText("Learner")).toBeInTheDocument());

    await user.type(screen.getByLabelText(/receiving school/i), "Rizal Elementary");
    await user.click(screen.getByRole("button", { name: /save transfer record/i }));

    await waitFor(() => expect(repo.recordCalls).toHaveLength(1));
    const call = repo.recordCalls.at(0);
    expect(call?.learnerId).toBe("l1");
    expect(call?.otherSchoolName).toBe("Rizal Elementary");
    expect(call?.direction).toBe("out");
  });

  it("updating a record's status calls the application service", async () => {
    const repo = new FakeTransferRecordRepository();
    repo.records = [RECORD];
    renderScreen(repo);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Synthetic Receiving School")).toBeInTheDocument());

    const statusSelect = screen.getByRole("combobox", { name: /status for transfer/i });
    await user.selectOptions(statusSelect, "completed");

    await waitFor(() =>
      expect(repo.updateStatusCalls).toEqual([{ id: "t1", status: "completed" }]),
    );
  });

  it("has no accessibility violations", async () => {
    const repo = new FakeTransferRecordRepository();
    repo.records = [RECORD];
    const { container } = renderScreen(repo);
    await waitFor(() => expect(screen.getByLabelText("Learner")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Synthetic Receiving School")).toBeInTheDocument());
    await expectNoAccessibilityViolations(container);
  });
});
