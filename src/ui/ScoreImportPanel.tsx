import { useState } from "react";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { LearnerScoreRosterEntry, ScoreImportPreview, ScoreHistoryEntry } from "../domain/learner-score";

export function ScoreImportPanel({ service, itemId, roster, onImported }: { service: LearnerScoreApplicationService; itemId: string; roster: LearnerScoreRosterEntry[]; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ScoreImportPreview | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setMessage(""); try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not complete this action. Your scores remain available."); } finally { setBusy(false); } }
  return <details className="card"><summary>Import scores and view correction history</summary>
    <p>Use learner IDs from this class. Blank scores remain unresolved; enter 0 only for a recorded zero. For exceptions use excused or not_applicable and leave the score empty.</p>
    <button type="button" onClick={() => { setCsv("learner_id,status,score\n" + roster.map((row) => `${row.learnerId},${row.status ?? "scored"},${row.score ?? ""}`).join("\n")); setPreview(null); }}>Prepare this class template</button>
    <label>CSV file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(async () => { if (file.size > 1_000_000) throw new Error("Use a CSV file smaller than 1 MB."); setCsv(await file.text()); setPreview(null); }); }} /></label>
    <label>Score rows<textarea rows={6} value={csv} disabled={busy} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} /></label>
    <button type="button" disabled={busy || !csv} onClick={() => void run(async () => setPreview(await service.previewImport(itemId, csv)))}>Preview scores</button>
    {preview && <><p>{preview.rows.length} valid rows. {preview.alreadyImported ? "This file has already been imported." : "Review before saving."}</p>
      {preview.issues.length > 0 && <ul>{preview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      <table><thead><tr><th>Learner</th><th>Status</th><th>Score</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.learnerId}><td>{roster.find((entry) => entry.learnerId === row.learnerId)?.familyName ?? row.learnerId}</td><td>{row.status}</td><td>{row.score ?? "—"}</td></tr>)}</tbody></table>
      <label>Reason for this import<input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="button" disabled={busy || !!preview.issues.length || preview.alreadyImported || !reason.trim()} onClick={() => void run(async () => { const count = await service.commitImport(itemId, csv, preview.snapshot, reason); setPreview(null); setMessage(`${count} scores saved on this device.`); onImported(); })}>Save reviewed scores</button></>}
    <button type="button" disabled={busy} onClick={() => void run(async () => setHistory(await service.history(itemId)))}>Show correction history</button>
    {history.length > 0 && <ul>{history.map((entry) => <li key={entry.id}>{entry.changedAt} · {roster.find((row) => row.learnerId === entry.learnerId)?.familyName ?? entry.learnerId} · {entry.reason}<details><summary>Change details</summary><p>Previous: {entry.previousJson ?? "Unrecorded"}</p><p>Saved: {entry.nextJson}</p></details></li>)}</ul>}
    {message && <p role="status">{message}</p>}
  </details>;
}
