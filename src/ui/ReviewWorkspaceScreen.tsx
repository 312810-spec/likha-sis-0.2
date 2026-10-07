import { useEffect, useState } from "react";
import type { SchoolResourcesApplicationService } from "../application/school-resources-service";
import { AttachmentsScreen } from "./AttachmentsScreen";
import type { ReviewWorkflowApplicationService } from "../application/review-workflow-service";
import type {
  ReviewContent,
  ReviewHistory,
  ReviewPacket,
  ReviewRequest,
} from "../domain/review-workflow";
import { draftFormCodes, emptyReviewContent, indicatorDisplay } from "../domain/review-workflow";
import type { Section } from "../domain/section";
import type { SchoolMember } from "../domain/school-member";
import { Page } from "./components/Page";
import { Alert } from "./components/Alert";
import "./ReviewWorkspaceScreen.css";

interface Props {
  service: ReviewWorkflowApplicationService;
  resourcesService?: SchoolResourcesApplicationService;
  sections: Section[];
  members: SchoolMember[];
  userId: string;
  isSchoolHead: boolean;
}
export function ReviewWorkspaceScreen({
  service,
  resourcesService,
  sections,
  members,
  userId,
  isSchoolHead,
}: Props) {
  const [packets, setPackets] = useState<ReviewPacket[]>([]);
  const [selected, setSelected] = useState<ReviewPacket | null>(null);
  const [content, setContent] = useState<ReviewContent>(emptyReviewContent);
  const [sectionId, setSectionId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sampleJson, setSampleJson] = useState("");
  useEffect(() => {
    let current = true;
    void service
      .list()
      .then((rows) => {
        if (current) setPackets(rows);
      })
      .catch(() => {
        if (current) setError("Could not load review packets. Try again.");
      });
    return () => {
      current = false;
    };
  }, [service, userId]);
  function choose(packet: ReviewPacket | null) {
    setSelected(packet);
    setContent(packet?.content ?? emptyReviewContent());
    setSectionId(packet?.sectionId ?? "");
    setReviewer(packet?.reviewerUserId ?? "");
    setReason("");
    setHistory([]);
    setError("");
    setMessage("");
  }
  async function act(action: ReviewRequest["action"]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const packet = await service.act({
        action,
        id: selected?.id,
        expectedRevision: selected?.revision,
        sectionId,
        content,
        reviewerUserId: reviewer,
        reason,
      });
      choose(packet);
      setPackets(await service.list());
      setMessage("Saved on this device. Review does not issue an official form or TANAW Lock.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The action was not saved. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exchange(importing: boolean) {
    setBusy(true);
    setError("");
    try {
      if (importing) {
        const packet = await service.importSample(sampleJson);
        choose(packet);
        setPackets(await service.list());
        setMessage(
          "Imported local draft. Source confirmations were reset; duplicate samples reuse their receipt.",
        );
      } else if (selected) {
        setSampleJson(await service.exportSample(selected.id));
        setMessage("Sample JSON ready. This is not an official district submission.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not exchange the sample.");
    } finally {
      setBusy(false);
    }
  }
  const editable =
    !selected ||
    (selected.ownerUserId === userId && ["draft", "returned"].includes(selected.status));
  const dirty = selected !== null && JSON.stringify(content) !== JSON.stringify(selected.content);
  const owner = selected?.ownerUserId === userId;
  const reviewable =
    selected?.status === "submitted" && selected.reviewerUserId === userId && !owner;
  function patch(value: Partial<ReviewContent>) {
    setContent((old) => ({ ...old, ...value }));
  }
  return (
    <Page title="Forms and TANAW review">
      <Alert tone="info">
        These are local drafts and school review records. Official templates, district acceptance
        and TANAW Lock remain pending. SF8 is inactive.
      </Alert>
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      <div className="review-workspace">
        <aside aria-label="Review packets">
          <button type="button" disabled={busy} onClick={() => choose(null)}>
            New draft
          </button>
          {packets.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={selected?.id === p.id}
              disabled={busy}
              onClick={() => choose(p)}
            >
              {p.content.title} · {p.status} · version {p.revision}
            </button>
          ))}
        </aside>
        <section aria-label="Draft details">
          {selected && (
            <p>
              Version {selected.revision} · {selected.status} · Evidence fingerprint:{" "}
              {selected.contentHash}
            </p>
          )}
          <fieldset disabled={!editable || busy}>
            <legend>Preparation</legend>
            <label>
              Advisory section
              <select
                value={sectionId}
                disabled={!!selected}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">Choose section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.gradeLevel} {s.name} · {s.schoolYear}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Record type
              <select
                value={content.kind}
                onChange={(e) =>
                  patch({ kind: e.target.value as ReviewContent["kind"], sourcesConfirmed: false })
                }
              >
                <option value="form">School form draft</option>
                <option value="tanaw">TANAW sample</option>
              </select>
            </label>
            {content.kind === "form" && (
              <label>
                School form
                <select
                  value={content.formCode}
                  onChange={(e) => patch({ formCode: e.target.value, sourcesConfirmed: false })}
                >
                  {draftFormCodes.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Title
              <input
                value={content.title}
                maxLength={200}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <label>
              Source cutoff
              <input
                type="date"
                value={content.sourceCutoff}
                onChange={(e) => patch({ sourceCutoff: e.target.value, sourcesConfirmed: false })}
              />
            </label>
            <label>
              Dictionary or template version
              <input
                value={content.dictionaryVersion}
                maxLength={200}
                onChange={(e) =>
                  patch({ dictionaryVersion: e.target.value, sourcesConfirmed: false })
                }
              />
            </label>
            <label>
              Notes
              <textarea
                value={content.notes}
                maxLength={20000}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            <h3>Indicators</h3>
            {content.indicators.map((i, index) => (
              <fieldset key={index}>
                <legend>Indicator {index + 1}</legend>
                <label>
                  Name
                  <input
                    value={i.name}
                    onChange={(e) =>
                      patch({
                        indicators: content.indicators.map((x, n) =>
                          n === index ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Source note
                  <input
                    value={i.provenance}
                    onChange={(e) =>
                      patch({
                        indicators: content.indicators.map((x, n) =>
                          n === index ? { ...x, provenance: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                {i.kind === "count" ? (
                  <label>
                    Count
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={i.value}
                      onChange={(e) =>
                        patch({
                          indicators: content.indicators.map((x, n) =>
                            n === index && x.kind === "count"
                              ? { ...x, value: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      Included learners
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={i.numerator}
                        onChange={(e) =>
                          patch({
                            indicators: content.indicators.map((x, n) =>
                              n === index && x.kind === "percentage"
                                ? { ...x, numerator: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Total population
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={i.denominator}
                        onChange={(e) =>
                          patch({
                            indicators: content.indicators.map((x, n) =>
                              n === index && x.kind === "percentage"
                                ? { ...x, denominator: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <p>{indicatorDisplay(i)}</p>
                <button
                  type="button"
                  onClick={() =>
                    patch({ indicators: content.indicators.filter((_, n) => n !== index) })
                  }
                >
                  Remove indicator {index + 1}
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  indicators: [
                    ...content.indicators,
                    { kind: "count", name: "", value: 0, provenance: "" },
                  ],
                })
              }
            >
              Add count
            </button>
            <button
              type="button"
              onClick={() =>
                patch({
                  indicators: [
                    ...content.indicators,
                    { kind: "percentage", name: "", numerator: 0, denominator: 0, provenance: "" },
                  ],
                })
              }
            >
              Add percentage
            </button>
            <h3>Discrepancies</h3>
            {content.discrepancies.map((d, n) => (
              <fieldset key={n}>
                <legend>Discrepancy {n + 1}</legend>
                <label>
                  What differs?
                  <input
                    value={d.description}
                    onChange={(e) =>
                      patch({
                        discrepancies: content.discrepancies.map((x, j) =>
                          j === n ? { ...x, description: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Resolution
                  <textarea
                    value={d.resolution}
                    onChange={(e) =>
                      patch({
                        discrepancies: content.discrepancies.map((x, j) =>
                          j === n ? { ...x, resolution: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  discrepancies: [...content.discrepancies, { description: "", resolution: "" }],
                })
              }
            >
              Add discrepancy
            </button>
            <label>
              <input
                type="checkbox"
                checked={content.sourcesConfirmed}
                onChange={(e) => patch({ sourcesConfirmed: e.target.checked })}
              />
              I checked the source cutoff, dictionary, indicators and discrepancies.
            </label>
          </fieldset>
          {selected?.content.sourceSnapshot && (
            <section aria-label="Frozen source comparison">
              <h3>Frozen source comparison</h3>
              <p>
                Roster and attendance cutoff: {selected.content.sourceSnapshot.cutoff}. Assessment
                records and grades were observed on {selected.content.sourceSnapshot.capturedAt};
                they are not a historical grade reconstruction.
              </p>
              <p>
                {selected.content.sourceSnapshot.rosterCount} roster learners ·{" "}
                {selected.content.sourceSnapshot.attendanceCount} attendance entries ·{" "}
                {selected.content.sourceSnapshot.completeGradeCount} complete current grade
                observations · {selected.content.sourceSnapshot.incompleteGradeCount} unresolved
                current grade observations.
              </p>
              <code>{selected.content.sourceSnapshot.fingerprint}</code>
              <ul>
                {selected.content.sourceSnapshot.discrepancies.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </section>
          )}
          {selected && resourcesService && (
            <AttachmentsScreen
              key={`${selected.id}:${selected.reviewerUserId}`}
              service={resourcesService}
              linkKind="form_draft"
              linkId={selected.id}
              reviewerUserId={selected.reviewerUserId}
            />
          )}
          <label>
            Reason or review note
            <textarea
              value={reason}
              disabled={busy}
              maxLength={4000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {dirty && (
            <p className="field-hint">
              Save your changes before comparing sources or submitting a version for review.
            </p>
          )}
          <div className="review-actions">
            {editable && (
              <button
                type="button"
                disabled={busy || !sectionId || !content.title.trim()}
                onClick={() => void act(selected ? "save" : "create")}
              >
                {selected ? "Save draft" : "Create draft"}
              </button>
            )}
            {owner && editable && (
              <button type="button" disabled={busy} onClick={() => void act("snapshot")}>
                Compare saved sources
              </button>
            )}
            {owner && editable && (
              <button
                type="button"
                disabled={busy || dirty || !selected?.reviewerUserId}
                onClick={() => void act("submit")}
              >
                Submit saved version
              </button>
            )}
            {selected && isSchoolHead && selected.status !== "approved" && (
              <>
                <label>
                  Designated reviewer
                  <select
                    value={reviewer}
                    disabled={busy}
                    onChange={(e) => setReviewer(e.target.value)}
                  >
                    <option value="">Choose another school member</option>
                    {members
                      .filter(
                        (m) =>
                          m.id !== selected.ownerUserId &&
                          m.roles.some((r) => ["teacher", "registrar", "school_head"].includes(r)),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !reviewer}
                  onClick={() => void act("designate")}
                >
                  Designate reviewer
                </button>
              </>
            )}
            {reviewable && (
              <>
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => void act("return")}
                >
                  Return with reason
                </button>
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => void act("approve")}
                >
                  Approve school review
                </button>
              </>
            )}
            {selected?.status === "approved" && (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void act("correct")}
              >
                Create correction copy
              </button>
            )}
            {selected && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void service
                    .history(selected.id)
                    .then(setHistory)
                    .catch(() => setError("Could not load the history."))
                    .finally(() => setBusy(false));
                }}
              >
                Show immutable history
              </button>
            )}
          </div>
          <section aria-label="TANAW sample exchange">
            <h3>TANAW sample exchange</h3>
            <p>Same-school sample format, version 1. Confirm all sources again after import.</p>
            <label>
              Sample JSON
              <textarea
                value={sampleJson}
                maxLength={2000000}
                disabled={busy}
                onChange={(e) => setSampleJson(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !sampleJson.trim()}
              onClick={() => void exchange(true)}
            >
              Import sample draft
            </button>
            {selected?.content.kind === "tanaw" && (
              <button type="button" disabled={busy} onClick={() => void exchange(false)}>
                Export saved sample JSON
              </button>
            )}
          </section>
          {history.length > 0 && (
            <ol aria-label="Review history">
              {history.map((h) => (
                <li key={h.revision}>
                  Version {h.revision}: {h.action} · {h.status} · {h.recordedAt}
                  <p>{h.reason}</p>
                  <code>{h.contentHash}</code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Page>
  );
}
