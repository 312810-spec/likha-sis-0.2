import "./school-planning.css";
import { useEffect, useState } from "react";
import type { SchoolPlanningApplicationService } from "../application/school-planning-service";
import type { SchoolPlanningInput, SchoolPlanningItem } from "../domain/school-planning";
import type { SchoolMember } from "../domain/school-member";
import { Page } from "./components/Page";
import { Alert } from "./components/Alert";
const empty = (): SchoolPlanningInput => ({
  kind: "notice",
  title: "",
  details: "",
  sourceReference: "",
  effectiveOn: "",
  coordinatorUserId: null,
  status: "draft",
  calendarDecision: "noChange",
  affectedArea: "",
});
export function SchoolPlanningScreen({
  service,
  members,
  canManage = false,
}: {
  service: SchoolPlanningApplicationService;
  members: SchoolMember[];
  canManage?: boolean;
}) {
  const [items, setItems] = useState<SchoolPlanningItem[]>([]);
  const [selected, setSelected] = useState<SchoolPlanningItem | null>(null);
  const [input, setInput] = useState(empty);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    service
      .list()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => {
        if (active)
          setError("Could not load school notices and programs. Reopen this page to retry.");
      });
    return () => {
      active = false;
    };
  }, [service]);
  const patch = (next: Partial<SchoolPlanningInput>) => {
    setInput({ ...input, ...next });
    setMessage("");
  };
  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await service.save(input, selected?.id, selected?.revision);
      setSelected(saved);
      setInput(saved.input);
      setItems((old) => [saved, ...old.filter((i) => i.id !== saved.id)]);
      setMessage("Saved on this device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed. Your entries are still here.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="School notices and programs"
      hint={
        <p>
          Weather and calendar notices do not change teaching days until the School Head confirms a
          dated decision. Programs remain inactive until school instructions and a coordinator are
          provided.
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      <label className="field">
        Saved item
        <select
          disabled={busy}
          value={selected?.id ?? ""}
          onChange={(e) => {
            const item = items.find((i) => i.id === e.target.value) ?? null;
            setSelected(item);
            setInput(item ? structuredClone(item.input) : empty());
            setMessage("");
            setError("");
          }}
        >
          <option value="">New empty item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.input.title} · {i.input.status} · version {i.revision}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="school-planning-editor" disabled={busy || !canManage}>
        <legend>School Head review</legend>
        <label className="field">
          Type
          <select
            value={input.kind}
            disabled={!!selected}
            onChange={(e) => {
              const kind = e.target.value as SchoolPlanningInput["kind"];
              patch({
                kind,
                status: kind === "notice" ? "draft" : "inactive",
                calendarDecision: "noChange",
                affectedArea: "",
              });
            }}
          >
            <option value="notice">Notice</option>
            <option value="program">Program</option>
          </select>
        </label>
        <label className="field">
          Name
          <input value={input.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="field">
          School instructions or details
          <textarea value={input.details} onChange={(e) => patch({ details: e.target.value })} />
        </label>
        <label className="field">
          Source or instruction reference
          <input
            value={input.sourceReference}
            onChange={(e) => patch({ sourceReference: e.target.value })}
          />
        </label>
        <label className="field">
          Effective date
          <input
            type="date"
            value={input.effectiveOn}
            onChange={(e) => patch({ effectiveOn: e.target.value })}
          />
        </label>
        {input.kind === "notice" ? (
          <>
            <label className="field">
              Calendar decision
              <select
                value={input.calendarDecision ?? "noChange"}
                onChange={(e) =>
                  patch({
                    calendarDecision: e.target.value as SchoolPlanningInput["calendarDecision"],
                  })
                }
              >
                <option value="noChange">Notice only — no change to teaching days</option>
                <option value="instructional">Confirm a teaching day</option>
                <option value="nonInstructional">Confirm no classes on this date</option>
              </select>
            </label>
            <label className="field">
              Affected area
              <select
                value={input.affectedArea ?? ""}
                onChange={(e) => patch({ affectedArea: e.target.value })}
              >
                <option value="">Choose the affected area</option>
                <option value="wholeSchool">Whole school</option>
                <option value="specificArea">Specific area — details in instructions</option>
              </select>
            </label>
            <label className="field">
              Review status
              <select
                value={input.status}
                onChange={(e) => patch({ status: e.target.value as SchoolPlanningInput["status"] })}
              >
                <option value="draft">Draft — awaiting decision</option>
                <option value="confirmed">Confirmed by School Head</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="field">
              Designated coordinator
              <select
                value={input.coordinatorUserId ?? ""}
                onChange={(e) => patch({ coordinatorUserId: e.target.value || null })}
              >
                <option value="">Choose a school member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Program status
              <select
                value={input.status}
                onChange={(e) => patch({ status: e.target.value as SchoolPlanningInput["status"] })}
              >
                <option value="inactive">Inactive — awaiting instructions</option>
                <option value="active">Active with instructions and coordinator</option>
              </select>
            </label>
          </>
        )}
        <button type="button" onClick={save}>
          Save reviewed item
        </button>
      </fieldset>
      {!canManage && <p>Only the School Head can save or confirm these items.</p>}
    </Page>
  );
}
