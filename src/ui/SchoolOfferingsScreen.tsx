import { useEffect, useState } from "react";
import type { SchoolOfferingsApplicationService } from "../application/school-offerings-service";
import type { OfferingInput, SchoolOffering } from "../domain/school-offerings";
const empty: OfferingInput = {
  previousId: null,
  schoolYear: "",
  gradeLevel: "",
  subjectId: "",
  cohort: "",
  termLabel: "",
  effectiveFrom: "",
  effectiveUntil: "",
  weeklyMinutes: 1,
  sourceTitle: "",
  sourceReference: "",
  verificationState: "draft",
  profileManifestJson: "{}",
};
export function SchoolOfferingsScreen({
  service,
  subjects,
  canManage,
}: {
  service: SchoolOfferingsApplicationService;
  subjects: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [items, setItems] = useState<SchoolOffering[]>([]);
  const [input, setInput] = useState<OfferingInput>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void service
      .list()
      .then((v) => {
        if (live) setItems(v);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [service]);
  function field<K extends keyof OfferingInput>(key: K, value: OfferingInput[K]) {
    setInput((old) => ({ ...old, [key]: value }));
  }
  function profileField(key: string) {
    const profile: Record<string, unknown> = JSON.parse(input.profileManifestJson);
    return typeof profile[key] === "string" ? profile[key] : "";
  }
  function profileChange(key: string, value: string) {
    const profile: Record<string, unknown> = JSON.parse(input.profileManifestJson);
    field("profileManifestJson", JSON.stringify({ ...profile, [key]: value }));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await service.save(input);
      setItems(await service.list());
      setInput(empty);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Subjects and curriculum offerings</h2>
      <p>
        Record the subjects, term dates and weekly time confirmed for your school. Each save retains
        an immutable source and profile snapshot. This register does not change existing grades or
        automatically adopt a grading policy.
      </p>
      {error && <p role="alert">{error}</p>}
      {canManage && (
        <fieldset disabled={busy}>
          <legend>
            {input.previousId ? "New version of selected offering" : "Add school offering"}
          </legend>
          <label>
            School year
            <input
              placeholder="2026-2027"
              value={input.schoolYear}
              onChange={(e) => field("schoolYear", e.target.value)}
              disabled={!!input.previousId}
            />
          </label>
          <label>
            Grade
            <select
              value={input.gradeLevel}
              onChange={(e) => field("gradeLevel", e.target.value)}
              disabled={!!input.previousId}
            >
              <option value="">Choose grade</option>
              {["K", ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select
              value={input.subjectId}
              onChange={(e) => field("subjectId", e.target.value)}
              disabled={!!input.previousId}
            >
              <option value="">Choose subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cohort
            <input
              value={input.cohort}
              onChange={(e) => field("cohort", e.target.value)}
              disabled={!!input.previousId}
            />
          </label>
          <label>
            Term
            <input
              value={input.termLabel}
              onChange={(e) => field("termLabel", e.target.value)}
              disabled={!!input.previousId}
            />
          </label>
          <label>
            Starts on
            <input
              type="date"
              value={input.effectiveFrom}
              onChange={(e) => field("effectiveFrom", e.target.value)}
            />
          </label>
          <label>
            Ends on
            <input
              type="date"
              value={input.effectiveUntil}
              onChange={(e) => field("effectiveUntil", e.target.value)}
            />
          </label>
          <label>
            Weekly teaching minutes
            <input
              type="number"
              min="1"
              max="2400"
              value={input.weeklyMinutes}
              onChange={(e) => field("weeklyMinutes", Number(e.target.value))}
            />
          </label>
          <label>
            Source title
            <input
              value={input.sourceTitle}
              onChange={(e) => field("sourceTitle", e.target.value)}
            />
          </label>
          <label>
            Source reference or memorandum
            <input
              value={input.sourceReference}
              onChange={(e) => field("sourceReference", e.target.value)}
            />
          </label>
          <label>
            Confirmation
            <select
              value={input.verificationState}
              onChange={(e) =>
                field("verificationState", e.target.value as OfferingInput["verificationState"])
              }
            >
              <option value="draft">Draft — source not confirmed</option>
              <option value="school_confirmed">School confirmed with evidence</option>
            </select>
          </label>
          <details>
            <summary>School grading policy notes (optional)</summary>
            <p>
              Record policy evidence for this offering. These notes do not change grade
              calculations; adopting a calculation policy requires its verified authority record.
            </p>
            <label>
              Policy title
              <input
                value={profileField("policyTitle")}
                onChange={(e) => profileChange("policyTitle", e.target.value)}
              />
            </label>
            <label>
              Policy source or memorandum
              <input
                value={profileField("policyReference")}
                onChange={(e) => profileChange("policyReference", e.target.value)}
              />
            </label>
            <label>
              Assessment and grading notes
              <textarea
                value={profileField("assessmentNotes")}
                onChange={(e) => profileChange("assessmentNotes", e.target.value)}
              />
            </label>
          </details>
          <button
            onClick={() => void save()}
            disabled={
              !input.subjectId ||
              !input.schoolYear ||
              !input.gradeLevel ||
              !input.termLabel ||
              !input.cohort ||
              !input.sourceTitle ||
              !input.effectiveFrom ||
              !input.effectiveUntil
            }
          >
            {busy ? "Saving…" : "Save retained version"}
          </button>
          <button onClick={() => setInput(empty)}>Clear selection</button>
        </fieldset>
      )}
      {!canManage && (
        <p>
          Your assigned subjects are shown for reference. The School Head manages these records.
        </p>
      )}
      <ul>
        {items.map((o) => (
          <li key={o.id}>
            {subjects.find((s) => s.id === o.input.subjectId)?.name ?? "Assigned subject"} · Grade{" "}
            {o.input.gradeLevel} · {o.input.schoolYear} · {o.input.termLabel} ·{" "}
            {o.input.weeklyMinutes} minutes/week · {o.input.effectiveFrom} to{" "}
            {o.input.effectiveUntil} ·{" "}
            {o.input.verificationState === "draft" ? "Draft" : "School confirmed"}
            <p>
              {o.input.sourceTitle} · {o.input.sourceReference || "Source evidence pending"}
            </p>
            <details>
              <summary>Snapshot history details</summary>
              <p>
                Saved {o.createdAt} · SHA256 {o.snapshotHash}
              </p>
              <p>Grading policy evidence is retained with this version.</p>
            </details>
            {canManage && !items.some((n) => n.input.previousId === o.id) && (
              <button onClick={() => setInput({ ...o.input, previousId: o.id })}>
                Create next version
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
