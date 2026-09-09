import { useEffect, useRef, useState } from "react";
import type { SectionApplicationService } from "../application/section-service";
import {
  generateIdCardToken,
  importIdCardSecretKey,
  type IdCardTokenInput,
} from "../domain/id-card-token";
import type { Section, SectionRosterMember } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface IdCardScreenProps {
  sectionService: SectionApplicationService;
  schoolId: string;
  schoolName: string;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Printable front/back ID card layout using `domain/id-card-token.ts`'s
 * offline HMAC token.
 *
 * TWO DELIBERATE SCOPE LIMITS, both flagged in the UI itself (never
 * silently):
 * 1. Photo capture/storage is NOT decided here -- a placeholder box only.
 *    See `docs/CURRENT-HANDOFF.md` / ADR for the deferred decision.
 * 2. The token is shown as plain text, not rendered as a QR code -- this
 *    session added no QR-rendering dependency (see `docs/SOURCE-REGISTRY.md`
 *    before adding one). A teacher can still manually verify the printed
 *    token against an in-app recomputation.
 * 3. `secretKey` here is a random, session-local, non-persisted placeholder
 *    -- real device/school-bound secret sourcing is explicitly out of this
 *    module's scope (see `id-card-token.ts`'s own doc comment) and remains
 *    unresolved next-slice work. Tokens generated in one session will NOT
 *    verify against a different session's key.
 */
export function IdCardScreen({ sectionService, schoolId, schoolName }: IdCardScreenProps) {
  const { mode } = useTeacherMode();
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [roster, setRoster] = useState<SectionRosterMember[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const secretKeyRef = useRef<CryptoKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    sectionService
      .listSections()
      .then((result) => {
        if (cancelled) return;
        setSections(result);
        if (result.length > 0 && !sectionId) setSectionId(result[0]!.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load sections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [sectionService]);

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;
    sectionService
      .roster(sectionId, todayAsIsoDate())
      .then((result) => {
        if (cancelled) return;
        setRoster(result);
        setLearnerId(result[0]?.learnerId ?? "");
        setToken(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the section roster.");
      });
    return () => {
      cancelled = true;
    };
  }, [sectionService, sectionId]);

  const section = sections.find((s) => s.id === sectionId) ?? null;
  const learner = roster.find((m) => m.learnerId === learnerId) ?? null;

  async function handleGenerate() {
    if (!learner || !learner.lrn) return;
    setError(null);
    try {
      if (!secretKeyRef.current) {
        const secretBytes = crypto.getRandomValues(new Uint8Array(32));
        secretKeyRef.current = await importIdCardSecretKey(secretBytes);
      }
      const input: IdCardTokenInput = { schoolId, learnerId: learner.learnerId, lrn: learner.lrn };
      const generated = await generateIdCardToken(secretKeyRef.current, input);
      setToken(generated);
    } catch {
      setError("Could not generate an ID card token for this learner.");
    }
  }

  return (
    <Page
      title="Student ID Card"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Pick a section and learner, then generate the card. Photo capture and QR-code rendering
            are both deferred -- see the notices below.
          </p>
        ) : undefined
      }
    >
      <Alert tone="warning">
        Photo storage is not yet decided for this app -- the card below shows a placeholder box
        only, never a captured photo.
      </Alert>
      <Alert tone="info">
        The verification token is shown as plain text, not a QR code -- no QR-rendering dependency
        has been added for this feature yet. The token is also session-local: it will not verify
        against a card generated in a different session until a real device/school-bound signing key
        is wired in.
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <EmptyState>No sections exist yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="id-card-section">Section</label>
              <select
                id="id-card-section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gradeLevel}, {s.schoolYear})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="id-card-learner">Learner</label>
              <select
                id="id-card-learner"
                value={learnerId}
                onChange={(event) => {
                  setLearnerId(event.target.value);
                  setToken(null);
                }}
                disabled={roster.length === 0}
              >
                {roster.length === 0 && <option value="">No learners enrolled</option>}
                {roster.map((member) => (
                  <option key={member.learnerId} value={member.learnerId}>
                    {member.givenName} {member.familyName}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleGenerate} aria-disabled={!learner || !learner.lrn}>
              Generate card
            </button>
          </div>

          {learner && !learner.lrn && (
            <Alert tone="warning">
              This learner has no LRN on file yet -- a card token cannot be generated until one is
              recorded.
            </Alert>
          )}

          {token && section && learner && (
            <div className="id-card-printable">
              <div className="id-card-face">
                <h3>Front</h3>
                <div className="id-card-photo-placeholder" aria-hidden="true">
                  Photo
                  <br />
                  placeholder
                </div>
                <p>
                  <strong>
                    {learner.givenName} {learner.familyName}
                  </strong>
                </p>
                <p>{schoolName}</p>
                <p>
                  {section.gradeLevel} — {section.name}
                </p>
                <p>LRN: {learner.lrn}</p>
              </div>
              <div className="id-card-face">
                <h3>Back</h3>
                <p>Verification token (offline, HMAC-derived):</p>
                <p className="id-card-token">{token}</p>
                <p className="field-hint">
                  Not a QR code -- recompute and compare this token in-app to verify.
                </p>
              </div>
            </div>
          )}

          {token && (
            <button type="button" onClick={() => window.print()}>
              Print
            </button>
          )}
        </>
      )}
    </Page>
  );
}
