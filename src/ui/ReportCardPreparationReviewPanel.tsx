import { useEffect, useId, useRef, useState } from "react";
import type { ExportApplicationService } from "../application/export-service";
import type {
  ReportCardDraft,
  ReportPreparationReview,
  ReportPreparationReviewRequest,
} from "../domain/report-readiness";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface Props {
  service: ExportApplicationService;
  draft: ReportCardDraft;
  revision: unknown;
  disabled: boolean;
}
interface View {
  source: Props;
  phase:
    "checking" | "ready" | "unavailable" | "saving" | "saved" | "uncertain" | "history" | "error";
  sourceHash?: string;
  confirmed?: boolean;
  notes?: string;
  reviews?: ReportPreparationReview[];
}
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function validReview(review: ReportPreparationReview, record: string) {
  return (
    review.classRecordId === record &&
    review.stage === "review" &&
    [review.id, review.draftId, review.requestId, review.reviewedByUserId, review.reviewedAt].every(
      (value) => typeof value === "string" && value.trim().length > 0,
    ) &&
    hash(review.snapshotSha256) &&
    hash(review.sourceSha256) &&
    typeof review.sourceVersion === "string" &&
    review.sourceVersion.length > 0 &&
    typeof review.notes === "string" &&
    [...review.notes].length <= 2000
  );
}

/** Explicit preparation review only. Never retries writes or invokes export/issuance. */
export function ReportCardPreparationReviewPanel(props: Props) {
  const { service, draft, revision, disabled } = props;
  const { mode } = useTeacherMode();
  const hintId = useId();
  const notesId = useId();
  const [view, setView] = useState<View | null>(null);
  const [editor, setEditor] = useState<{
    service: ExportApplicationService;
    record: string;
    draft: string;
    notes: string;
  } | null>(null);
  const [attempt, setAttempt] = useState<{
    service: ExportApplicationService;
    record: string;
    draft: string;
    request: ReportPreparationReviewRequest;
  } | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    return () => {
      alive.current = false;
      pending.current = false;
      generation.current += 1;
    };
  }, [service, draft.id, draft.classRecordId, draft.snapshotSha256, revision, disabled]);
  const current =
    !disabled &&
    view?.source.service === service &&
    view.source.draft.id === draft.id &&
    view.source.draft.classRecordId === draft.classRecordId &&
    view.source.draft.snapshotSha256 === draft.snapshotSha256 &&
    view.source.revision === revision &&
    view.source.disabled === disabled
      ? view
      : null;
  const attempted =
    attempt?.service === service &&
    attempt.record === draft.classRecordId &&
    attempt.draft === draft.id;
  const busy =
    current?.phase === "checking" || current?.phase === "saving" || current?.phase === "history";
  const confirmed = current?.phase === "ready" && current.confirmed === true;
  const notes =
    editor?.service === service &&
    editor.record === draft.classRecordId &&
    editor.draft === draft.id
      ? editor.notes
      : "";
  async function run(action: "check" | "save" | "history") {
    if (
      disabled ||
      pending.current ||
      (action === "save" && (!confirmed || !current?.sourceHash || attempted))
    )
      return;
    pending.current = true;
    const token = ++generation.current;
    const previous = current;
    setView({
      source: props,
      phase: action === "check" ? "checking" : action === "save" ? "saving" : "history",
      notes: previous?.notes,
    });
    try {
      if (action === "check") {
        const check = await service.checkReportCardDraftSource(draft.classRecordId, draft.id);
        if (!alive.current || generation.current !== token) return;
        const matches =
          check?.classRecordId === draft.classRecordId &&
          check.draftId === draft.id &&
          check.sourceStatus === "matches" &&
          check.sourceVersion === "report-card-readiness-source-v1" &&
          hash(check.storedSourceSha256) &&
          check.storedSourceSha256 === check.currentSourceSha256 &&
          hash(draft.snapshotSha256);
        setView({
          source: props,
          phase: matches ? "ready" : "unavailable",
          sourceHash: matches ? check.storedSourceSha256! : undefined,
          notes: previous?.notes,
        });
      } else if (action === "save") {
        const request: ReportPreparationReviewRequest = {
          draftId: draft.id,
          requestId: crypto.randomUUID(),
          expectedSnapshotSha256: draft.snapshotSha256,
          expectedSourceSha256: previous!.sourceHash!,
          teacherConfirmed: true,
          notes,
        };
        setAttempt({
          service,
          record: draft.classRecordId,
          draft: draft.id,
          request,
        });
        const review = await service.recordReportCardPreparationReview(
          draft.classRecordId,
          request,
        );
        if (!alive.current || generation.current !== token) return;
        if (
          !review ||
          !validReview(review, draft.classRecordId) ||
          review.draftId !== draft.id ||
          review.requestId !== request.requestId ||
          review.snapshotSha256 !== request.expectedSnapshotSha256 ||
          review.sourceSha256 !== request.expectedSourceSha256 ||
          review.sourceVersion !== "report-card-readiness-source-v1" ||
          review.notes !== request.notes.trim()
        )
          throw new Error("Review acknowledgement could not be verified.");
        setView({ source: props, phase: "saved", reviews: [review], notes: request.notes });
      } else {
        const reviews = await service.listRecentReportCardPreparationReviews(draft.classRecordId);
        if (!alive.current || generation.current !== token) return;
        if (
          reviews.length > 50 ||
          reviews.some((review) => !validReview(review, draft.classRecordId))
        )
          throw new Error("Review history identities could not be verified.");
        setView({
          source: props,
          phase: "saved",
          reviews: reviews.filter((review) => review.draftId === draft.id),
          notes: previous?.notes,
        });
      }
    } catch {
      if (alive.current && generation.current === token)
        setView({
          source: props,
          phase: action === "save" ? "uncertain" : "error",
          notes: previous?.notes,
        });
    } finally {
      if (generation.current === token) pending.current = false;
    }
  }
  const acknowledged =
    attempted &&
    current?.reviews?.some(
      (review) =>
        review.requestId === attempt!.request.requestId &&
        review.snapshotSha256 === attempt!.request.expectedSnapshotSha256 &&
        review.sourceSha256 === attempt!.request.expectedSourceSha256 &&
        review.sourceVersion === "report-card-readiness-source-v1" &&
        review.notes === attempt!.request.notes.trim(),
    );
  return (
    <section
      className="report-draft-evidence"
      aria-label={`Preparation review for draft ${draft.id}`}
    >
      <h4>Preparation review</h4>
      <p id={hintId} className="muted">
        Record that you reviewed this retained preparation draft, including its missing evidence.
        This is not grade approval, official-source verification, professional acceptance or
        issuance. The native writer rechecks current authority and inputs at save time.
      </p>
      {mode === "guided" && (
        <p className="field-hint">
          Open the retained draft above and inspect its context, grades and omissions first. Even
          incomplete evidence can be reviewed; that does not make it issuable. A prior input check
          can expire. Changed, legacy or unsupported inputs require a new current draft, not
          invented history.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || busy || attempted}
        onClick={() => void run("check")}
      >
        Check inputs before preparation review
      </button>
      {current?.phase === "ready" && !attempted && (
        <>
          <p role="status">
            Inputs match this check. Review confirmation is still required; nothing has been saved.
          </p>
          <label htmlFor={notesId}>
            Preparation review notes (optional, up to 2,000 characters)
          </label>
          <textarea
            id={notesId}
            maxLength={2000}
            value={notes}
            aria-describedby={hintId}
            onChange={(event) => {
              setEditor({
                service,
                record: draft.classRecordId,
                draft: draft.id,
                notes: event.target.value,
              });
              setView({ ...current, confirmed: false });
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              aria-describedby={hintId}
              onChange={(event) => setView({ ...current, confirmed: event.target.checked })}
            />
            I reviewed this retained draft and its missing evidence. This is preparation review
            only.
          </label>
        </>
      )}
      <button
        type="button"
        disabled={disabled || busy || !confirmed || attempted}
        onClick={() => void run("save")}
      >
        Record preparation review
      </button>
      <button type="button" disabled={disabled || busy} onClick={() => void run("history")}>
        Load recent preparation reviews
      </button>
      {busy && (
        <Loading
          label={
            current?.phase === "saving"
              ? "Recording preparation review…"
              : "Loading preparation review evidence…"
          }
        />
      )}
      {current?.phase === "unavailable" && (
        <Alert tone="warning">
          Matching current inputs could not be established. No review was recorded. Inspect the
          source check and capture a new current draft when needed.
        </Alert>
      )}
      {(current?.phase === "error" || (current?.phase === "uncertain" && !attempted)) && (
        <Alert tone="error">
          Review evidence could not be loaded or verified. Try loading again.
        </Alert>
      )}
      {attempted && !acknowledged && current?.phase !== "saving" && (
        <Alert tone="warning">
          A review write was attempted but is not confirmed here. It may have been saved. Load
          recent preparation reviews; do not create another review to resolve an uncertain
          acknowledgement. Absence from the latest 50 events is not proof that nothing was saved.
        </Alert>
      )}
      {attempted && (
        <details>
          <summary>Attempted review details</summary>
          <p>
            Request identity: <code>{attempt!.request.requestId}</code>
          </p>
          <p>Submitted notes: {attempt!.request.notes || "No notes submitted."}</p>
          <p className="muted">
            Keep this identity when resolving an uncertain save. No automatic write retry occurs.
          </p>
        </details>
      )}
      {current?.reviews && (
        <>
          <p role="status">
            {acknowledged
              ? "Preparation review retained."
              : "Recent retained preparation-review evidence loaded."}{" "}
            Not approved or issued.
          </p>
          {current.reviews.length === 0 && (
            <p>No review for this draft appears in the latest 50 class-record events.</p>
          )}
          {current.reviews.map((review) => (
            <details key={review.id}>
              <summary>Retained preparation review — {review.reviewedAt}</summary>
              <p>Reviewer identity: {review.reviewedByUserId}</p>
              <p>Notes: {review.notes || "No notes recorded."}</p>
              <p>
                Snapshot SHA-256: <code>{review.snapshotSha256}</code>
              </p>
              <p>
                Source SHA-256: <code>{review.sourceSha256}</code>
              </p>
              <p>Source protocol: {review.sourceVersion}</p>
              <p className="muted">
                Historical review only; not current freshness, approval or issuance permission.
              </p>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
