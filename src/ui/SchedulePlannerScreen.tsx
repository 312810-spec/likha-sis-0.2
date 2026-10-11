import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchedulePlanningApplicationService } from "../application/schedule-planning-service";
import { WEEKDAY_LABELS } from "../domain/schedule-meeting";
import type {
  GenerationOutcome,
  GenerationResponse,
  PlanPlacement,
  PublishOutcome,
  SchedulePlan,
  ScheduleSettings,
  ScheduleSettingsUpdate,
  Violation,
} from "../domain/schedule-planning";
import { useSessionDraft } from "./useSessionDraft";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SchedulePlannerScreenProps {
  schedulePlanningService: SchedulePlanningApplicationService;
  onBack: () => void;
}

/**
 * CTOS M09 — the Teacher Load Maker, as the workflow names it:
 *
 * ```text
 * Prepare → Confirm → Lock → Generate → Compare → Repair → Validate → Publish
 * ```
 *
 * Each step here is an explicit teacher action. Nothing auto-generates on
 * load, nothing publishes on a timer, and a generation that lands on
 * `impossible` or `stopped` is shown as that state with its proof — never
 * smoothed into a generic failure, and never as an incomplete-but-saved
 * timetable the school could mistake for live.
 *
 * The screen holds no authority of its own. Every write command it issues
 * is re-gated by the School-Head capability at the trusted boundary, and
 * the school itself is never a parameter — it is session-derived
 * server-side on every call.
 */
export function SchedulePlannerScreen({
  schedulePlanningService,
  onBack,
}: SchedulePlannerScreenProps) {
  const { mode } = useTeacherMode();

  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [placements, setPlacements] = useState<PlanPlacement[] | null>(null);
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [generation, setGeneration] = useState<GenerationResponse | null>(null);
  const [publishOutcome, setPublishOutcome] = useState<PublishOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<"generate" | "validate" | "publish" | "remove" | null>(
    null,
  );
  const busy = operation !== null;
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: "generate" | "publish" | "remove";
    placement?: PlanPlacement;
    trigger: HTMLButtonElement;
  } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmation) cancelRef.current?.focus();
  }, [confirmation]);
  function closeConfirmation() {
    const trigger = confirmation?.trigger;
    setConfirmation(null);
    trigger?.focus();
  }
  function confirmAction() {
    const pending = confirmation;
    closeConfirmation();
    if (pending?.action === "generate") void handleGenerate();
    if (pending?.action === "publish") void handlePublish();
    if (pending?.action === "remove" && pending.placement)
      void handleRemovePlacement(pending.placement);
  }
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    Promise.all([
      schedulePlanningService.getScheduleSettings(),
      schedulePlanningService.currentSchedulePlan(),
    ])
      .then(([loadedSettings, loadedPlan]) => {
        if (requestRef.current !== requestId) return;
        setSettings(loadedSettings);
        setPlan(loadedPlan);
        if (loadedPlan) {
          return schedulePlanningService.listSchedulePlanPlacements(loadedPlan.id).then((rows) => {
            if (requestRef.current !== requestId) return;
            setPlacements(rows);
            setNeedsRefresh(false);
          });
        }
        setPlacements(null);
        setNeedsRefresh(false);
        return undefined;
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setNeedsRefresh(true);
        setError(
          "Could not refresh the school's scheduling setup. The last loaded plan may be out of date.",
        );
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      requestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedulePlanningService]);

  async function handleGenerate() {
    if (busy || needsRefresh) return;
    const requestId = requestRef.current;
    setError(null);
    setPublishOutcome(null);
    setViolations(null);
    setOperation("generate");
    try {
      const response = await schedulePlanningService.generateSchedulePlan();
      if (requestRef.current !== requestId) return;
      setGeneration(response);
      setNeedsRefresh(true);
      try {
        const rows = await schedulePlanningService.listSchedulePlanPlacements(response.planId);
        const current = await schedulePlanningService.currentSchedulePlan();
        if (requestRef.current !== requestId) return;
        setPlacements(rows);
        setPlan(current);
        setNeedsRefresh(false);
      } catch {
        if (requestRef.current !== requestId) return;
        setError(
          `Draft revision ${response.revision} was generated, but the updated schedule could not be loaded. Refresh the schedule before another change.`,
        );
      }
    } catch {
      if (requestRef.current !== requestId) return;
      setNeedsRefresh(true);
      setError(
        "Generation was not confirmed. A draft may have been staged. Refresh the schedule before another change.",
      );
    } finally {
      if (requestRef.current === requestId) setOperation(null);
    }
  }

  async function handleValidate() {
    if (!plan || busy || needsRefresh) return;
    const requestId = requestRef.current;
    setError(null);
    setOperation("validate");
    try {
      const result = await schedulePlanningService.validateSchedulePlan(plan.id);
      if (requestRef.current !== requestId) return;
      setViolations(result);
    } catch {
      if (requestRef.current !== requestId) return;
      setError("Could not run the checker on this plan.");
    } finally {
      if (requestRef.current === requestId) setOperation(null);
    }
  }

  async function handlePublish() {
    if (!plan || busy || needsRefresh) return;
    const requestId = requestRef.current;
    setError(null);
    setOperation("publish");
    try {
      const outcome = await schedulePlanningService.publishSchedulePlan(plan.id);
      if (requestRef.current !== requestId) return;
      setPublishOutcome(outcome);
      if (outcome.outcome === "published") {
        setViolations([]);
        setNeedsRefresh(true);
        try {
          const current = await schedulePlanningService.currentSchedulePlan();
          if (requestRef.current !== requestId) return;
          setPlan(current);
          setNeedsRefresh(false);
        } catch {
          if (requestRef.current !== requestId) return;
          setError(
            "Publication is confirmed, but the updated schedule could not be loaded. Refresh the schedule before another change.",
          );
        }
      }
    } catch {
      if (requestRef.current !== requestId) return;
      setNeedsRefresh(true);
      setError(
        "Publication was not confirmed. The plan may already be live. Refresh the schedule before another change.",
      );
    } finally {
      if (requestRef.current === requestId) setOperation(null);
    }
  }

  async function handleRemovePlacement(placement: PlanPlacement) {
    if (!plan || busy || needsRefresh) return;
    const requestId = requestRef.current;
    setError(null);
    setOperation("remove");
    try {
      const removed = await schedulePlanningService.removeSchedulePlanPlacement(
        plan.id,
        placement.id,
      );
      if (requestRef.current !== requestId) return;
      if (removed) {
        setPlacements((current) =>
          current ? current.filter((row) => row.id !== placement.id) : current,
        );
        // A repaired set must be re-validated before it can publish, so the
        // last checker result is no longer the state of the plan.
        setViolations(null);
        setPublishOutcome(null);
      } else {
        setNeedsRefresh(true);
        setError("Removal was not confirmed. Refresh the schedule before another change.");
      }
    } catch {
      if (requestRef.current !== requestId) return;
      setNeedsRefresh(true);
      setError("Removal was not confirmed. Refresh the schedule before another change.");
    } finally {
      if (requestRef.current === requestId) setOperation(null);
    }
  }

  if (loading) {
    return (
      <Page title="Teacher Load Maker">
        <Loading label="Loading the school's scheduling setup…" />
      </Page>
    );
  }

  if (!settings) {
    return (
      <Page title="Teacher Load Maker">
        {error && (
          <Alert tone="error">
            <p>{error}</p>
            <button type="button" onClick={load}>
              Retry
            </button>
          </Alert>
        )}
      </Page>
    );
  }

  return (
    <Page
      title="Teacher Load Maker"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Prepare the school&rsquo;s grid, generate a draft plan, check it independently, then
            publish. Nothing goes live until you press Publish.
          </p>
        ) : undefined
      }
      actions={
        <button type="button" onClick={onBack}>
          Back
        </button>
      }
    >
      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load} disabled={busy}>
            Refresh schedule
          </button>
        </Alert>
      )}

      {confirmation && (
        <section
          className="card"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="schedule-confirm-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeConfirmation();
            }
          }}
        >
          <h3 id="schedule-confirm-title">
            {confirmation.action === "generate"
              ? "Replace the draft?"
              : confirmation.action === "publish"
                ? "Publish this schedule?"
                : "Remove this placement?"}
          </h3>
          <p>
            {confirmation.action === "generate"
              ? "Generating again replaces the current draft. Published history remains available."
              : confirmation.action === "publish"
                ? "This makes the timetable live for the school after the checker accepts it."
                : "The placement will be removed from this draft. Check the repaired plan before publication."}
          </p>
          <button type="button" ref={cancelRef} onClick={closeConfirmation}>
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={confirmAction}>
            {confirmation.action === "generate"
              ? "Confirm replacement"
              : confirmation.action === "publish"
                ? "Confirm publication"
                : "Confirm removal"}
          </button>
        </section>
      )}
      {needsRefresh && (
        <p role="status">Showing the last loaded schedule. Refresh before making changes.</p>
      )}
      <SettingsSection
        schedulePlanningService={schedulePlanningService}
        settings={settings}
        onSaved={load}
        disabled={busy || needsRefresh || confirmation !== null}
      />

      <section className="card">
        <h3>Generate</h3>
        <p className="field-hint">
          Locks every input into the plan&rsquo;s fingerprint, then builds the timetable against it.
          Re-running replaces the draft.
        </p>
        {plan && (
          <p className="field-hint">
            {plan.status === "draft" ? "Draft" : "Published"} revision {plan.revision}
            {plan.generatorNote ? ` — ${plan.generatorNote}` : ""}
          </p>
        )}
        <button
          type="button"
          className="button-primary"
          disabled={busy || needsRefresh}
          onClick={(event) =>
            plan
              ? setConfirmation({ action: "generate", trigger: event.currentTarget })
              : void handleGenerate()
          }
        >
          {operation === "generate" ? "Generating…" : "Generate plan"}
        </button>
        {generation && <GenerationReport outcome={generation.outcome} />}
      </section>

      <section className="card">
        <h3>Compare and repair</h3>
        {!plan || !placements ? (
          <EmptyState>No draft plan yet. Generate one to see its placements here.</EmptyState>
        ) : placements.length === 0 ? (
          <EmptyState>This draft has no placements.</EmptyState>
        ) : (
          <table className="attendance-roster">
            <caption>
              {placements.length} placement{placements.length === 1 ? "" : "s"} in the draft
            </caption>
            <thead>
              <tr>
                <th scope="col">Teacher</th>
                <th scope="col">Section</th>
                <th scope="col">Subject</th>
                <th scope="col">Day</th>
                <th scope="col">Time</th>
                <th scope="col">Room</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((placement) => (
                <tr key={placement.id}>
                  <th scope="row">{placement.teacherName}</th>
                  <td>{placement.sectionName}</td>
                  <td>{placement.subjectName}</td>
                  <td>{WEEKDAY_LABELS[placement.weekday]}</td>
                  <td>
                    {placement.startsAt}–{placement.endsAt}
                  </td>
                  <td>{placement.room ?? "—"}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busy || needsRefresh || plan.status !== "draft"}
                      aria-label={`Remove ${placement.teacherName}'s ${WEEKDAY_LABELS[placement.weekday]} ${placement.startsAt} placement`}
                      onClick={(event) =>
                        setConfirmation({
                          action: "remove",
                          placement,
                          trigger: event.currentTarget,
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Validate</h3>
        <p className="field-hint">
          Runs the checker independently of the generator, over the draft exactly as it stands.
        </p>
        <button type="button" disabled={busy || !plan || needsRefresh} onClick={handleValidate}>
          {operation === "validate" ? "Checking…" : "Check this plan"}
        </button>
        {violations && <ViolationList violations={violations} />}
      </section>

      <section className="card">
        <h3>Publish</h3>
        <p className="field-hint">
          Re-locks the inputs, re-validates the plan, then makes it live in one transaction. A stale
          or violating plan is refused, not partially applied.
        </p>
        <button
          type="button"
          className="button-primary"
          disabled={
            busy ||
            !plan ||
            needsRefresh ||
            plan.status !== "draft" ||
            publishOutcome?.outcome === "published"
          }
          onClick={(event) => setConfirmation({ action: "publish", trigger: event.currentTarget })}
        >
          {operation === "publish" ? "Publishing…" : "Publish plan"}
        </button>
        {publishOutcome && <PublishReport outcome={publishOutcome} />}
      </section>
    </Page>
  );
}

interface SettingsSectionProps {
  schedulePlanningService: SchedulePlanningApplicationService;
  settings: ScheduleSettings;
  onSaved: () => void;
  disabled: boolean;
}

/** Prepare — the school's bell grid and workload limits, saved only on an
 * explicit submit because a partial grid is not a grid. */
function SettingsSection({
  schedulePlanningService,
  settings,
  onSaved,
  disabled,
}: SettingsSectionProps) {
  const [draft, setDraft] = useSessionDraft<ScheduleSettingsUpdate>(
    `schedule-settings:${settings.schoolId}`,
    () => ({
      dayStartsAt: settings.dayStartsAt,
      dayEndsAt: settings.dayEndsAt,
      schoolDays: settings.schoolDays,
      periodMinutes: settings.periodMinutes,
      passingMinutes: settings.passingMinutes,
      maxDailyTeachingMinutes: settings.maxDailyTeachingMinutes,
      maxWeeklyTeachingMinutes: settings.maxWeeklyTeachingMinutes,
    }),
  );
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || disabled || uncertain) return;
    setError(null);
    setSaving(true);
    try {
      await schedulePlanningService.updateScheduleSettings(draft);
      onSaved();
    } catch {
      setUncertain(true);
      setError(
        "Saving was not confirmed. Keep your entries and refresh the settings to check what was recorded.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" aria-label="Schedule settings" onSubmit={handleSubmit}>
      <h3>Prepare — the school&rsquo;s grid</h3>
      <div className="form-row">
        <label className="field">
          <span>Day starts</span>
          <input
            type="time"
            value={draft.dayStartsAt}
            onChange={(event) => setDraft({ ...draft, dayStartsAt: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Day ends</span>
          <input
            type="time"
            value={draft.dayEndsAt}
            onChange={(event) => setDraft({ ...draft, dayEndsAt: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>School days per week</span>
          <input
            type="number"
            min={1}
            max={7}
            value={draft.schoolDays}
            onChange={(event) => setDraft({ ...draft, schoolDays: Number(event.target.value) })}
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Period length (minutes)</span>
          <input
            type="number"
            min={5}
            max={240}
            value={draft.periodMinutes}
            onChange={(event) => setDraft({ ...draft, periodMinutes: Number(event.target.value) })}
            required
          />
        </label>
        <label className="field">
          <span>Passing time (minutes)</span>
          <input
            type="number"
            min={0}
            max={240}
            value={draft.passingMinutes}
            onChange={(event) => setDraft({ ...draft, passingMinutes: Number(event.target.value) })}
            required
          />
        </label>
        <label className="field">
          <span>Daily teaching limit (minutes)</span>
          <input
            type="number"
            min={30}
            max={1440}
            value={draft.maxDailyTeachingMinutes}
            onChange={(event) =>
              setDraft({ ...draft, maxDailyTeachingMinutes: Number(event.target.value) })
            }
            required
          />
        </label>
        <label className="field">
          <span>Weekly teaching limit (minutes)</span>
          <input
            type="number"
            min={30}
            max={10080}
            value={draft.maxWeeklyTeachingMinutes}
            onChange={(event) =>
              setDraft({ ...draft, maxWeeklyTeachingMinutes: Number(event.target.value) })
            }
            required
          />
        </label>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={saving || disabled || uncertain}>
        {saving ? "Saving…" : "Save settings"}
      </button>
      {uncertain && (
        <button type="button" onClick={onSaved}>
          Refresh settings
        </button>
      )}
    </form>
  );
}

/** Reports which of the three required states a generation landed in, with
 * the proof or outstanding list that makes each one actionable. */
function GenerationReport({ outcome }: { outcome: GenerationOutcome }) {
  if (outcome.outcome === "valid") {
    return (
      <Alert tone="success">
        <p>
          {outcome.placements.length} meeting{outcome.placements.length === 1 ? "" : "s"} placed.
          {outcome.notes.length > 0 ? ` ${outcome.notes.join("; ")}` : ""}
        </p>
      </Alert>
    );
  }
  if (outcome.outcome === "impossible") {
    return (
      <Alert tone="error">
        <p>
          Proven impossible under the supplied constraints — {outcome.placements.length} placed,{" "}
          {outcome.proofs.length} blocking proof
          {outcome.proofs.length === 1 ? "" : "s"}:
        </p>
        <ul>
          {outcome.proofs.map((proof) => (
            <li key={proof.teachingAssignmentId}>
              {proof.teacherName} — {proof.subjectName}, {proof.sectionName}:{" "}
              {proof.requiredWeeklyMinutes} weekly minutes required against{" "}
              {proof.availableWeeklyMinutes} available.
            </li>
          ))}
        </ul>
      </Alert>
    );
  }
  return (
    <Alert tone="warning">
      <p>
        Search stopped at {outcome.stepsUsed} steps with {outcome.unplaced.length} assignment
        {outcome.unplaced.length === 1 ? "" : "s"} still unplaced. No solution yet — repair an input
        and regenerate.
      </p>
      {outcome.unplaced.length > 0 && (
        <ul>
          {outcome.unplaced.map((unplaced) => (
            <li key={unplaced.teachingAssignmentId}>
              {unplaced.teacherName} — {unplaced.subjectName}, {unplaced.sectionName}:{" "}
              {unplaced.stillNeededMinutes} minutes still needed.
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

/** The independent checker's findings, in the checker's own words — each
 * violation already names the constraint, the people and the times. */
function ViolationList({ violations }: { violations: Violation[] }) {
  if (violations.length === 0) {
    return (
      <Alert tone="success">
        <p>No violations found.</p>
      </Alert>
    );
  }
  return (
    <Alert tone="error">
      <p>
        {violations.length} violation{violations.length === 1 ? "" : "s"} found:
      </p>
      <ul>
        {violations.map((violation, index) => (
          <li key={index}>{describeViolation(violation)}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** One sentence per violation kind. The checker supplies every number and
 * name; this only supplies the grammar. Not every violation carries a
 * weekday, so the day is resolved per case rather than up front. */
function describeViolation(violation: Violation): string {
  switch (violation.kind) {
    case "teacherConflict":
      return `${violation.teacherName} has two classes at once on ${WEEKDAY_LABELS[violation.weekday]}: ${violation.startsAt}–${violation.endsAt} overlaps ${violation.conflictingStartsAt}–${violation.conflictingEndsAt}.`;
    case "sectionConflict":
      return `${violation.sectionName} is expected in two places at once on ${WEEKDAY_LABELS[violation.weekday]}: ${violation.startsAt}–${violation.endsAt} overlaps ${violation.conflictingStartsAt}–${violation.conflictingEndsAt}.`;
    case "roomConflict":
      return `${violation.room} hosts two classes at once on ${WEEKDAY_LABELS[violation.weekday]}: ${violation.startsAt}–${violation.endsAt} overlaps ${violation.conflictingStartsAt}–${violation.conflictingEndsAt}.`;
    case "teacherUnavailable":
      return `${violation.teacherName} is not available on ${WEEKDAY_LABELS[violation.weekday]} from ${violation.unavailableStartsAt} to ${violation.unavailableEndsAt}, but a class was placed at ${violation.startsAt}–${violation.endsAt}.`;
    case "teacherDailyOverload":
      return `${violation.teacherName} teaches ${violation.minutes} minutes on ${WEEKDAY_LABELS[violation.weekday]}, over the ${violation.limit}-minute daily limit.`;
    case "teacherWeeklyOverload":
      return `${violation.teacherName} teaches ${violation.minutes} minutes this week, over the ${violation.limit}-minute weekly limit.`;
    case "missingPassingBuffer":
      return `${violation.teacherName} has a ${violation.gapMinutes}-minute gap on ${WEEKDAY_LABELS[violation.weekday]}, under the ${violation.required}-minute passing time.`;
    case "sharedLearners":
      return `${violation.sectionName} and ${violation.conflictingSectionName} share a learner but are both scheduled on ${WEEKDAY_LABELS[violation.weekday]} at ${violation.startsAt}–${violation.endsAt}.`;
    case "requirementShortfall":
      return `${violation.subjectName} for ${violation.sectionName} is scheduled for ${violation.scheduledMinutes} minutes, short of the ${violation.requiredMinutes}-minute weekly requirement.`;
    case "unknownRoom":
      return `${violation.room} is not a registered room, but a class was placed there on ${WEEKDAY_LABELS[violation.weekday]} at ${violation.startsAt}.`;
    case "legacyConflict":
      return `A placement on ${WEEKDAY_LABELS[violation.weekday]} at ${violation.startsAt}–${violation.endsAt} conflicts with a meeting the school created by hand.`;
  }
}

/** Publication reports its own outcome as a value, never as an error — a
 * stale or violating plan is the workflow speaking. */
function PublishReport({ outcome }: { outcome: PublishOutcome }) {
  if (outcome.outcome === "published") {
    return (
      <Alert tone="success">
        <p>
          Published as revision {outcome.revision} — {outcome.meetingCount} meeting
          {outcome.meetingCount === 1 ? "" : "s"} are now live.
        </p>
      </Alert>
    );
  }
  if (outcome.outcome === "stale") {
    return (
      <Alert tone="warning">
        <p>
          This plan is stale: an input changed between generation and publication. Regenerate the
          plan against the school as it stands now, then publish again.
        </p>
      </Alert>
    );
  }
  if (outcome.outcome === "violations") {
    return (
      <Alert tone="error">
        <p>
          Publication refused: the checker found {outcome.violations.length} violation
          {outcome.violations.length === 1 ? "" : "s"}. Repair the plan and publish again.
        </p>
        <ViolationList violations={outcome.violations} />
      </Alert>
    );
  }
  if (outcome.outcome === "notADraft") {
    return (
      <Alert tone="warning">
        <p>This plan is no longer a draft (status: {outcome.status}). Nothing was published.</p>
      </Alert>
    );
  }
  return (
    <Alert tone="warning">
      <p>This plan could not be found in this school. Nothing was published.</p>
    </Alert>
  );
}
