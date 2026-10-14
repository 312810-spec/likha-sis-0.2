import { useEffect, useRef, useState } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type { ReportCardDraftSourceCheck } from "../domain/report-readiness";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Props {
  service: ExportApplicationService;
  classRecordId: string;
  draftId: string;
  revision: unknown;
  disabled: boolean;
}
interface Result {
  source: Props;
  kind: "loading" | "error" | "missing" | "check";
  check?: ReportCardDraftSourceCheck;
}
function validEvidence(check: ReportCardDraftSourceCheck) {
  const hash = (value: unknown): value is string =>
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  const supported = check.sourceVersion === "report-card-readiness-source-v1";
  switch (check.sourceStatus) {
    case "legacy_unavailable":
      return (
        check.sourceVersion === null &&
        check.storedSourceSha256 === null &&
        check.currentSourceSha256 === null
      );
    case "unsupported_version":
      return (
        !supported &&
        typeof check.sourceVersion === "string" &&
        check.sourceVersion.trim().length > 0 &&
        hash(check.storedSourceSha256) &&
        check.currentSourceSha256 === null
      );
    case "matches":
    case "changed":
      return (
        supported &&
        hash(check.storedSourceSha256) &&
        hash(check.currentSourceSha256) &&
        (check.sourceStatus === "matches") ===
          (check.storedSourceSha256 === check.currentSourceSha256)
      );
    default:
      return false;
  }
}
const STATUS_TEXT = {
  matches:
    "Captured readiness inputs match this read-time check. Not reviewed, approved or issued.",
  changed:
    "Readiness inputs or implementation changed since capture. The retained draft remains unchanged.",
  legacy_unavailable:
    "This legacy draft has no captured readiness-input fingerprint. Nothing was backfilled; changes cannot be checked.",
  unsupported_version:
    "The captured source protocol is unsupported. Input comparison is unavailable, not approved.",
};

/** Native hashes/status only; no raw input retrieval or write/approval action. */
export function ReportCardDraftSourcePanel(props: Props) {
  const { service, classRecordId, draftId, revision, disabled } = props;
  const { mode } = useTeacherMode();
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef(false);
  const alive = useRef(false);
  const request = useRef(0);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    return () => {
      alive.current = false;
      pending.current = false;
      request.current += 1;
    };
  }, [service, classRecordId, draftId, revision, disabled]);
  const current =
    !disabled &&
    result?.source.service === service &&
    result.source.classRecordId === classRecordId &&
    result.source.draftId === draftId &&
    result.source.revision === revision &&
    result.source.disabled === disabled
      ? result
      : null;
  async function checkSource() {
    if (disabled || pending.current) return;
    pending.current = true;
    const id = ++request.current;
    setResult({ source: props, kind: "loading" });
    try {
      const check = await service.checkReportCardDraftSource(classRecordId, draftId);
      if (!alive.current || request.current !== id) return;
      if (
        check &&
        (check.classRecordId !== classRecordId ||
          check.draftId !== draftId ||
          !validEvidence(check))
      )
        throw new Error("Unexpected source-check identity or evidence.");
      setResult(
        check ? { source: props, kind: "check", check } : { source: props, kind: "missing" },
      );
    } catch {
      if (alive.current && request.current === id) setResult({ source: props, kind: "error" });
    } finally {
      if (request.current === id) pending.current = false;
    }
  }
  const check = current?.check;
  return (
    <section
      className="report-draft-evidence"
      aria-label={`Readiness input check for draft ${draftId}`}
    >
      <h4>Readiness input check</h4>
      <p className="muted">
        Checks captured local inputs and implementation identity, not official documents or
        professional approval. A read-time match can expire after changes; it is not issuance
        permission. Refresh after external record changes.
      </p>
      {mode === "guided" && (
        <p className="field-hint">
          Raw scores, LRN digits or policy contents can change while projected grades remain the
          same. Software/schema changes can also invalidate a fingerprint. Legacy drafts have no
          invented input history.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || current?.kind === "loading"}
        onClick={() => void checkSource()}
      >
        Check captured readiness inputs
      </button>
      {current?.kind === "loading" && <Loading label="Checking captured readiness inputs…" />}
      {current?.kind === "error" && (
        <Alert tone="error">
          The input check could not be loaded or its evidence could not be verified. No review or
          approval occurred. Try the check again.
        </Alert>
      )}
      {current?.kind === "missing" && (
        <Alert tone="warning">
          No input check is available for this draft and class record. Reload recent drafts before
          trying again.
        </Alert>
      )}
      {check && (
        <>
          <p role="status">{STATUS_TEXT[check.sourceStatus]}</p>
          {check.sourceVersion && (
            <details>
              <summary>Input fingerprint identities</summary>
              <p>Protocol: {check.sourceVersion}</p>
              <p>
                Captured SHA-256: <code>{check.storedSourceSha256}</code>
              </p>
              {check.currentSourceSha256 && (
                <p>
                  Current SHA-256: <code>{check.currentSourceSha256}</code>
                </p>
              )}
              <p className="muted">
                The native reader verifies stored integrity. Raw learner inputs are not displayed or
                requested over IPC. This view does not persist a review record.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
