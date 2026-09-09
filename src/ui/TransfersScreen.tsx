import { useEffect, useState } from "react";
import type { LearnerApplicationService } from "../application/learner-service";
import type { TransferRecordApplicationService } from "../application/transfer-record-service";
import type { Learner } from "../domain/learner";
import type { TransferDirection, TransferRecord, TransferStatus } from "../domain/transfer-record";
import { TransferRecordValidationError } from "../domain/transfer-record";
import { Alert } from "./components/Alert";
import { DataTable } from "./components/DataTable";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TransfersScreenProps {
  transferRecordService: TransferRecordApplicationService;
  learnerService: LearnerApplicationService;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function learnerLabel(learner: Learner): string {
  return `${learner.familyName}, ${learner.givenName}${learner.lrn ? ` (LRN ${learner.lrn})` : ""}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * Transfers In/Out Documentation Registry (Batch 9, ADR-0080) — a formal
 * ledger of a learner's inter-school transfers: date, direction,
 * receiving/originating school name, and document-completion status.
 * Registrar/School Head only (`Capability::ManageTransferRecords`,
 * enforced server-side; this screen relies on that, never on hiding
 * itself from the wrong role — see `.claude/rules/security-privacy.md`).
 * Follows `LessonPlanScreen`'s create-form-plus-list shape.
 */
export function TransfersScreen({ transferRecordService, learnerService }: TransfersScreenProps) {
  const { mode } = useTeacherMode();

  const [learners, setLearners] = useState<Learner[]>([]);
  const [learnersLoading, setLearnersLoading] = useState(true);

  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [learnerId, setLearnerId] = useState("");
  const [direction, setDirection] = useState<TransferDirection>("out");
  const [transferDate, setTransferDate] = useState(todayIsoDate());
  const [otherSchoolName, setOtherSchoolName] = useState("");
  const [status, setStatus] = useState<TransferStatus>("pending");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function loadRecords() {
    setRecordsLoading(true);
    transferRecordService
      .listForSchool()
      .then((result) => setRecords(result))
      .catch(() => setError("Could not load the transfer ledger."))
      .finally(() => setRecordsLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    learnerService
      .listLearners()
      .then((result) => {
        if (cancelled) return;
        setLearners(result);
        if (result[0]) setLearnerId(result[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load learners.");
      })
      .finally(() => {
        if (!cancelled) setLearnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [learnerService]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferRecordService]);

  function resetForm() {
    setDirection("out");
    setTransferDate(todayIsoDate());
    setOtherSchoolName("");
    setStatus("pending");
    setRemarks("");
    setError(null);
    setConfirmation(null);
  }

  async function handleSave() {
    if (saving || !learnerId) return;
    setSaving(true);
    setError(null);
    try {
      await transferRecordService.record({
        learnerId,
        direction,
        transferDate,
        otherSchoolName,
        status,
        remarks: remarks.length > 0 ? remarks : undefined,
      });
      setConfirmation("Transfer record saved.");
      resetForm();
      loadRecords();
    } catch (err) {
      setError(
        err instanceof TransferRecordValidationError
          ? err.message
          : "Could not save this transfer record.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(record: TransferRecord, nextStatus: TransferStatus) {
    if (updatingId) return;
    setUpdatingId(record.id);
    setError(null);
    try {
      await transferRecordService.updateStatus(record.id, nextStatus);
      loadRecords();
    } catch {
      setError("Could not update this record's status.");
    } finally {
      setUpdatingId(null);
    }
  }

  function learnerNameFor(id: string): string {
    const learner = learners.find((l) => l.id === id);
    return learner ? learnerLabel(learner) : id;
  }

  const canSave =
    !saving && learnerId.length > 0 && transferDate.length > 0 && otherSchoolName.trim().length > 0;

  return (
    <Page
      title="Transfers In/Out Documentation Registry"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Record a learner's transfer to or from another school, and track whether the transfer
            paperwork is still pending or has been completed.
          </p>
        ) : undefined
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {learnersLoading ? (
        <Loading label="Loading learners…" />
      ) : learners.length === 0 ? (
        <EmptyState>No learners enrolled yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="transfer-learner">Learner</label>
              <select
                id="transfer-learner"
                value={learnerId}
                onChange={(event) => setLearnerId(event.target.value)}
              >
                {learners.map((learner) => (
                  <option key={learner.id} value={learner.id}>
                    {learnerLabel(learner)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="transfer-direction">Direction</label>
              <select
                id="transfer-direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value as TransferDirection)}
              >
                <option value="out">Transferring out</option>
                <option value="in">Transferring in</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="transfer-date">Transfer date</label>
              <input
                id="transfer-date"
                type="date"
                value={transferDate}
                onChange={(event) => setTransferDate(event.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="transfer-school">
                {direction === "in" ? "Originating school" : "Receiving school"}
              </label>
              <input
                id="transfer-school"
                type="text"
                value={otherSchoolName}
                onChange={(event) => setOtherSchoolName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="transfer-status">Document status</label>
              <select
                id="transfer-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as TransferStatus)}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="transfer-remarks">Remarks (optional)</label>
            <textarea
              id="transfer-remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="button-primary"
            aria-disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save transfer record"}
          </button>
        </>
      )}

      <h3>Transfer ledger</h3>
      {recordsLoading ? (
        <Loading label="Loading the transfer ledger…" />
      ) : records.length === 0 ? (
        <EmptyState>No transfer records yet.</EmptyState>
      ) : (
        <DataTable
          caption="Transfer ledger"
          reflowAt={640}
          columns={[
            { key: "learner", header: "Learner" },
            { key: "direction", header: "Direction" },
            { key: "date", header: "Date" },
            { key: "school", header: "Other school" },
            { key: "status", header: "Status" },
          ]}
          rows={records.map((record) => ({
            key: record.id,
            rowHeader: "learner",
            cells: {
              learner: learnerNameFor(record.learnerId),
              direction: record.direction === "in" ? "In" : "Out",
              date: record.transferDate,
              school: record.otherSchoolName,
              status: (
                <select
                  aria-label={`Status for transfer on ${record.transferDate}`}
                  value={record.status}
                  disabled={updatingId === record.id}
                  onChange={(event) =>
                    void handleStatusChange(record, event.target.value as TransferStatus)
                  }
                >
                  <option value="pending">{statusLabel("pending")}</option>
                  <option value="completed">{statusLabel("completed")}</option>
                  <option value="cancelled">{statusLabel("cancelled")}</option>
                </select>
              ),
            },
          }))}
        />
      )}
    </Page>
  );
}
