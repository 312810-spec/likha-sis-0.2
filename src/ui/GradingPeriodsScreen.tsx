import { useEffect, useRef, useState } from "react";
import type { GradingApplicationService } from "../application/grading-service";
import { ValidationError } from "../domain/errors";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface GradingPeriodsScreenProps {
  gradingService: GradingApplicationService;
}

function currentSchoolYearGuess(): string {
  const now = new Date();
  const year = now.getFullYear();
  // A Philippine school year starting in June spans two calendar years
  // (e.g. June 2026 - April 2027 is "2026-2027") — this is only a
  // starting-point guess for the input, never submitted as-is without the
  // teacher confirming it.
  const startYear = now.getMonth() >= 5 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function GradingPeriodsScreen({ gradingService }: GradingPeriodsScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYearGuess);
  const [policies, setPolicies] = useState<GradingPolicy[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [policyPeriods, setPolicyPeriods] = useState<GradingPolicyPeriod[]>([]);
  const [existingPeriods, setExistingPeriods] = useState<GradingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { startsOn: string; endsOn: string }>>({});
  const [savingPeriodId, setSavingPeriodId] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    gradingService
      .listPolicies()
      .then((result) => {
        if (cancelled) return;
        setPolicies(result);
        const defaultPolicy = result.find((p) => p.isDefault) ?? result[0];
        if (defaultPolicy) setPolicyId(defaultPolicy.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load grading policies.");
      });
    return () => {
      cancelled = true;
    };
  }, [gradingService]);

  useEffect(() => {
    if (!policyId) return;
    let cancelled = false;
    gradingService
      .listPolicyPeriods(policyId)
      .then((result) => {
        if (!cancelled) setPolicyPeriods(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this policy's periods.");
      });
    return () => {
      cancelled = true;
    };
  }, [gradingService, policyId]);

  useEffect(() => {
    if (!schoolYear) return;
    let cancelled = false;
    gradingService
      .listPeriodsBySchoolYear(schoolYear)
      .then((result) => {
        if (!cancelled) setExistingPeriods(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load grading periods for this school year.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gradingService, schoolYear]);

  function handleSchoolYearChange(value: string) {
    setError(null);
    setLoading(true);
    setSchoolYear(value);
  }

  function draftFor(policyPeriodId: string) {
    return drafts[policyPeriodId] ?? { startsOn: "", endsOn: "" };
  }

  function updateDraft(policyPeriodId: string, field: "startsOn" | "endsOn", value: string) {
    setDrafts((current) => ({
      ...current,
      [policyPeriodId]: { ...draftFor(policyPeriodId), [field]: value },
    }));
  }

  async function handleSave(policyPeriodId: string) {
    setError(null);
    setConfirmation(null);
    setSavingPeriodId(policyPeriodId);
    const draft = draftFor(policyPeriodId);
    try {
      const created = await gradingService.createPeriod(
        schoolYear,
        policyPeriodId,
        draft.startsOn,
        draft.endsOn,
      );
      if (created === null) {
        setError("Could not save this grading period.");
      } else {
        setExistingPeriods((current) => [...current, created]);
        setConfirmation(`${created.label} saved.`);
      }
    } catch (err) {
      setError(
        err instanceof ValidationError ? err.message : "Could not save this grading period.",
      );
    } finally {
      setSavingPeriodId(null);
    }
  }

  return (
    <section aria-label="Grading Periods">
      <h2 ref={headingRef} tabIndex={-1}>
        Grading Periods
      </h2>

      {mode === "guided" && (
        <p className="field-hint">
          Pick a school year and grading policy, then enter the actual start/end date for each
          period at your school.
        </p>
      )}

      {policies.length > 0 && (
        <p className="field-hint">
          DepEd's grading-period structure changes over time (see the selected policy's citation
          below) — pick the policy that matches your school's current calendar.
        </p>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="confirmation-banner" role="status">
          {confirmation}
        </div>
      )}

      <div className="form-row">
        <div className="field">
          <label htmlFor="grading-school-year">School year</label>
          <input
            id="grading-school-year"
            type="text"
            placeholder="2026-2027"
            value={schoolYear}
            onChange={(event) => handleSchoolYearChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="grading-policy">Grading policy</label>
          <select
            id="grading-policy"
            value={policyId}
            onChange={(event) => setPolicyId(event.target.value)}
          >
            {policies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
                {policy.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {policies.find((p) => p.id === policyId) && (
        <p className="field-hint">{policies.find((p) => p.id === policyId)?.sourceCitation}</p>
      )}

      {loading ? (
        <p role="status">Loading grading periods…</p>
      ) : (
        <table className="attendance-roster">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Start date</th>
              <th scope="col">End date</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {policyPeriods.map((period) => {
              const existing = existingPeriods.find((p) => p.policyPeriodId === period.id);
              const draft = draftFor(period.id);
              return (
                <tr key={period.id}>
                  <th scope="row">{period.label}</th>
                  {existing ? (
                    <>
                      <td>{existing.startsOn}</td>
                      <td>{existing.endsOn}</td>
                      <td>Saved</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <label htmlFor={`starts-${period.id}`} className="visually-hidden">
                          {period.label} start date
                        </label>
                        <input
                          id={`starts-${period.id}`}
                          type="date"
                          value={draft.startsOn}
                          onChange={(event) =>
                            updateDraft(period.id, "startsOn", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <label htmlFor={`ends-${period.id}`} className="visually-hidden">
                          {period.label} end date
                        </label>
                        <input
                          id={`ends-${period.id}`}
                          type="date"
                          value={draft.endsOn}
                          onChange={(event) => updateDraft(period.id, "endsOn", event.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={savingPeriodId === period.id}
                          onClick={() => handleSave(period.id)}
                        >
                          {savingPeriodId === period.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
