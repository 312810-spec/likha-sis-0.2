import { useEffect, useRef, useState } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type {
  ReportPreparationReview,
  ReportPreparationReviewSourceCheck,
} from "../domain/report-readiness";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Props {
  service: ExportApplicationService;
  review: ReportPreparationReview;
  revision: unknown;
  disabled: boolean;
}
interface Result {
  source: Props;
  kind: "loading" | "error" | "missing" | "check";
  check?: ReportPreparationReviewSourceCheck;
}
function sameReview(a: ReportPreparationReview, b: ReportPreparationReview) {
  return (
    a.id === b.id &&
    a.classRecordId === b.classRecordId &&
    a.draftId === b.draftId &&
    a.snapshotSha256 === b.snapshotSha256 &&
    a.sourceSha256 === b.sourceSha256 &&
    a.sourceVersion === b.sourceVersion
  );
}
function validEvidence(check: ReportPreparationReviewSourceCheck, review: ReportPreparationReview) {
  const hash = (value: unknown): value is string =>
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  if (
    check.reviewId !== review.id ||
    check.classRecordId !== review.classRecordId ||
    check.draftId !== review.draftId ||
    check.snapshotSha256 !== review.snapshotSha256 ||
    check.storedSourceSha256 !== review.sourceSha256 ||
    check.sourceVersion !== review.sourceVersion ||
    !hash(check.snapshotSha256) ||
    !hash(check.storedSourceSha256) ||
    typeof check.checkedAt !== "string" ||
    !check.checkedAt.trim() ||
    check.evidenceScope !== "read_time_preparation_evidence_not_issue_authorization" ||
    check.officialFidelity !== "not_verified"
  )
    return false;
  const supported = check.sourceVersion === "report-card-readiness-source-v1";
  switch (check.sourceStatus) {
    case "matches":
    case "changed":
      return (
        supported &&
        hash(check.currentSourceSha256) &&
        (check.sourceStatus === "matches") ===
          (check.currentSourceSha256 === check.storedSourceSha256)
      );
    case "unsupported_version":
      return (
        !supported &&
        typeof check.sourceVersion === "string" &&
        !!check.sourceVersion.trim() &&
        check.currentSourceSha256 === null
      );
    default:
      return false;
  }
}
const TEXT = {
  matches:
    "Reviewed inputs match this read-time check. This is not current approval or issuance permission.",
  changed:
    "Inputs or implementation changed since this review. Historical review is retained, not refreshed or re-approved.",
  unsupported_version:
    "This retained review uses an unsupported source protocol. Current comparison is unavailable, not approved.",
};

export function ReportCardReviewSourcePanel(props: Props) {
  const { service, review, revision, disabled } = props;
  const { mode } = useTeacherMode();
  const [result, setResult] = useState<Result | null>(null);
  const alive = useRef(false);
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    return () => {
      alive.current = false;
      pending.current = false;
      generation.current += 1;
    };
  }, [
    service,
    review.id,
    review.classRecordId,
    review.draftId,
    review.snapshotSha256,
    review.sourceSha256,
    review.sourceVersion,
    revision,
    disabled,
  ]);
  const current =
    !disabled &&
    result?.source.service === service &&
    sameReview(result.source.review, review) &&
    result.source.revision === revision &&
    result.source.disabled === disabled
      ? result
      : null;
  async function checkSource() {
    if (disabled || pending.current) return;
    pending.current = true;
    const token = ++generation.current;
    setResult({ source: props, kind: "loading" });
    try {
      const check = await service.checkReportCardPreparationReviewSource(
        review.classRecordId,
        review.id,
      );
      if (!alive.current || generation.current !== token) return;
      if (check && !validEvidence(check, review))
        throw new Error("Review evidence is inconsistent.");
      setResult(
        check ? { source: props, kind: "check", check } : { source: props, kind: "missing" },
      );
    } catch {
      if (alive.current && generation.current === token)
        setResult({ source: props, kind: "error" });
    } finally {
      if (generation.current === token) pending.current = false;
    }
  }
  const check = current?.check;
  return (
    <section
      className="report-draft-evidence"
      aria-label={`Input freshness for review ${review.id}`}
    >
      <h5>Reviewed input freshness</h5>
      <p className="muted">
        Rechecks current access, retained draft/source bindings and local inputs. A match can expire
        after changes. It does not verify official documents or authorize issuance.
      </p>
      {mode === "guided" && (
        <p className="field-hint">
          A retained review records an earlier action; it cannot certify today's records. After
          changed inputs, capture and inspect a new draft. Notes and reviewer identity remain
          historical metadata, not independently signed professional acceptance.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || current?.kind === "loading"}
        onClick={() => void checkSource()}
      >
        Check reviewed inputs
      </button>
      {current?.kind === "loading" && <Loading label="Checking reviewed inputs…" />}
      {current?.kind === "error" && (
        <Alert tone="error">
          Review input evidence could not be loaded or verified. No write or approval occurred. Try
          the check again.
        </Alert>
      )}
      {current?.kind === "missing" && (
        <Alert tone="warning">
          No input check is available for this review and class record. Reload retained review
          history.
        </Alert>
      )}
      {check && (
        <>
          <p role="status">{TEXT[check.sourceStatus]}</p>
          <p className="muted">
            Checked at: {check.checkedAt}. Official fidelity remains unverified.
          </p>
          <details>
            <summary>Reviewed input identities</summary>
            <p>Protocol: {check.sourceVersion}</p>
            <p>
              Snapshot SHA-256: <code>{check.snapshotSha256}</code>
            </p>
            <p>
              Reviewed source SHA-256: <code>{check.storedSourceSha256}</code>
            </p>
            {check.currentSourceSha256 && (
              <p>
                Current source SHA-256: <code>{check.currentSourceSha256}</code>
              </p>
            )}
            <p className="muted">
              Native read-time evidence only. No raw learner input JSON is requested; no review is
              rewritten.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
