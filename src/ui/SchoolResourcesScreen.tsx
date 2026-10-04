import { useEffect, useState } from "react";
import type { SchoolResourcesApplicationService } from "../application/school-resources-service";
import type { ResourceIssue, SupportPlan, SupportSession } from "../domain/school-resources";
export function SchoolResourcesScreen({
  service,
  learners = [],
}: {
  service: SchoolResourcesApplicationService;
  learners?: { id: string; label: string }[];
}) {
  const [issues, setIssues] = useState<ResourceIssue[]>([]);
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [learner, setLearner] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState("");
  const [issue, setIssue] = useState("");
  const [reason, setReason] = useState("");
  const [goal, setGoal] = useState("");
  const [evidence, setEvidence] = useState("");
  const [plan, setPlan] = useState("");
  const [observation, setObservation] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([service.listIssues(), service.listSupportPlans()])
      .then(([a, b]) => {
        if (live) {
          setIssues(a);
          setPlans(b);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [service]);
  useEffect(() => {
    let live = true;
    setSessions([]);
    if (plan)
      void service
        .listSupportSessions(plan)
        .then((v) => {
          if (live) setSessions(v);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [service, plan]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setIssues(await service.listIssues());
      setPlans(await service.listSupportPlans());
      if (plan) setSessions(await service.listSupportSessions(plan));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Resources and learning support</h2>
      <p>
        School working records, saved on this device. SF3 information is a draft until the official
        template is confirmed. Support notes describe learning needs; they do not diagnose a
        learner.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Learner
        <select value={learner} onChange={(e) => setLearner(e.target.value)}>
          <option value="">Choose assigned learner</option>
          {learners.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      {!learners.length && <p>Open an assigned class roster to select learners.</p>}
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <h3>Issue or return a resource</h3>
      <label>
        Resource name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Quantity
        <input
          type="number"
          min="1"
          max="1000"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <button
        disabled={busy || !learner || !date || !name}
        onClick={() => void run(() => service.issue(learner, name, quantity, date))}
      >
        Record issue
      </button>
      <ul>
        {issues.map((i) => (
          <li key={i.id}>
            {i.resourceName}: {i.issuedQuantity - i.returnedQuantity} outstanding of{" "}
            {i.issuedQuantity}
          </li>
        ))}
      </ul>
      <label>
        Issued resource
        <select value={issue} onChange={(e) => setIssue(e.target.value)}>
          <option value="">Choose issue</option>
          {issues.map((i) => (
            <option key={i.id} value={i.id}>
              {i.resourceName} · {i.issuedQuantity - i.returnedQuantity} outstanding
            </option>
          ))}
        </select>
      </label>
      <label>
        Return condition or note
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        disabled={busy || !issue || !date || !reason}
        onClick={() => void run(() => service.returnResource(issue, quantity, reason, date))}
      >
        Record partial or full return
      </button>
      <h3>Learning support</h3>
      <label>
        Learning goal
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <label>
        Observed evidence
        <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </label>
      <p>The chosen date will be the follow-up date.</p>
      <button
        disabled={busy || !learner || !date || !goal || !evidence}
        onClick={() => void run(() => service.createSupportPlan(learner, goal, evidence, date))}
      >
        Save support plan
      </button>
      <label>
        Support plan
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Choose plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.goal} · follow-up {p.followUpOn}
            </option>
          ))}
        </select>
      </label>
      <label>
        Session observation
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} />
      </label>
      <label>
        Next step
        <textarea value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <button
        disabled={busy || !plan || !date || !observation || !next}
        onClick={() => void run(() => service.recordSupportSession(plan, date, observation, next))}
      >
        Record support session
      </button>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            {s.sessionOn}: {s.observation} · Next: {s.nextStep}
          </li>
        ))}
      </ul>
    </section>
  );
}
