import { useEffect, useId, useRef, useState } from "react";
import type { LessonPlanApplicationService } from "../application/lesson-plan-service";
import type { LessonSourceArtifact } from "../domain/lesson-plan";
import { Alert } from "./components/Alert";

/** Display metadata only after the trusted boundary rechecks exact stored bytes. */
export function LessonSourceIntegrity({
  artifactId,
  service,
}: {
  artifactId: string;
  service: LessonPlanApplicationService;
}) {
  const [artifact, setArtifact] = useState<LessonSourceArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(true);
  const hashId = useId();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function check() {
    if (loading) return;
    setLoading(true);
    setArtifact(null);
    setError(false);
    try {
      const result = await service.getSourceArtifact(artifactId);
      if (!active.current) return;
      if (!result || result.id !== artifactId) setError(true);
      else setArtifact(result);
    } catch {
      if (active.current) setError(true);
    } finally {
      if (active.current) setLoading(false);
    }
  }
  return (
    <section aria-label="Attached source file integrity">
      <button type="button" disabled={loading} onClick={() => void check()}>
        {loading ? "Checking stored source bytes…" : "Check attached source integrity"}
      </button>
      {error && (
        <Alert tone="error">
          Could not verify the attached source bytes. The file may be unavailable or inconsistent;
          no integrity match is claimed. Your lesson is unchanged. Retry the check.
        </Alert>
      )}
      {artifact && (
        <>
          <p role="status">Stored byte length and SHA-256 match the recorded file identity.</p>
          <dl>
            <div>
              <dt>File</dt>
              <dd>{artifact.fileName}</dd>
            </div>
            <div>
              <dt>Type / size</dt>
              <dd>
                {artifact.mediaType} · {artifact.byteLength} bytes
              </dd>
            </div>
            <div>
              <dt>Ingested by</dt>
              <dd>{artifact.ingestedByName ?? artifact.ingestedByUserId}</dd>
            </div>
            <div>
              <dt>Ingested at</dt>
              <dd>{artifact.createdAt}</dd>
            </div>
          </dl>
          <label htmlFor={hashId}>Source SHA-256</label>
          <textarea id={hashId} readOnly rows={2} value={artifact.sha256} />
          <p className="muted">
            Integrity identifies exact bytes only. Official approval, applicability and competency
            accuracy are not verified.
          </p>
        </>
      )}
    </section>
  );
}
