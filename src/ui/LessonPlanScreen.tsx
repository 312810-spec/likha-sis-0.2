import { useContext, useEffect, useRef, useState } from "react";
import type { LessonPlanApplicationService } from "../application/lesson-plan-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { LessonPlan, LessonPlanFields } from "../domain/lesson-plan";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { ValidationError } from "../domain/errors";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { SessionDraftContext } from "./session-draft-context";
import { localIsoDate } from "./local-date";
import {
  lessonDraftEpoch,
  lessonDraftKey,
  readLessonWorkspace,
  retainLessonWorkspace,
  subscribeLessonWorkspace,
  type LessonDraft,
} from "./lesson-draft-store";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LessonPlanScreenProps {
  lessonPlanService: LessonPlanApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  teacherUserId: string;
}

const EMPTY_FIELDS: LessonPlanFields = {
  learningCompetency: "",
  learningCompetencyCode: "",
  learningObjectives: "",
  connectionToPreviousLearning: "",
  learningExperiences: "",
  assessment: "",
  waysForward: "",
};

/**
 * Creation Studio — structured lesson-plan builder (third of three
 * confirmed Creation Studio sub-scopes; assessment-item authoring and
 * class-summary export already shipped). Follows the "ILAW" format --
 * Intentions, Learning Experiences, Assessment, Ways Forward -- per
 * DepEd Order No. 16, s. 2026 (researched this session; see
 * `docs/CURRENT-HANDOFF.md`). This is the teacher's own planning tool,
 * not an official DepEd form output -- there is no PDF export here.
 */
export function LessonPlanScreen(props: LessonPlanScreenProps) {
  const sessionOwner = useContext(SessionDraftContext);
  const owner = JSON.stringify([sessionOwner, props.teacherUserId]);
  return <LessonPlanWorkspace key={owner} {...props} owner={owner} />;
}

function LessonPlanWorkspace({
  lessonPlanService,
  subjectAttendanceService,
  teacherUserId,
  owner,
}: LessonPlanScreenProps & { owner: string }) {
  const { mode } = useTeacherMode();
  const epoch = useRef(lessonDraftEpoch()).current;
  const [workspace, setWorkspace] = useState(
    () =>
      readLessonWorkspace(owner) ?? {
        active: {
          assignmentId: "",
          planDate: localIsoDate(),
          editingPlanId: null,
          fields: EMPTY_FIELDS,
        },
        drafts: {} as Record<string, LessonDraft>,
      },
  );
  useEffect(
    () =>
      subscribeLessonWorkspace(owner, () => {
        const retained = readLessonWorkspace(owner);
        if (retained && lessonDraftEpoch() === epoch) setWorkspace(retained);
      }),
    [owner, epoch],
  );
  const { assignmentId, planDate, editingPlanId, fields } = workspace.active;
  const currentAssignment = useRef(assignmentId);
  useEffect(() => {
    currentAssignment.current = assignmentId;
  }, [assignmentId]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function changeWorkspace(update: (value: typeof workspace) => typeof workspace) {
    setWorkspace((current) => {
      const next = update(current);
      retainLessonWorkspace(owner, next, epoch);
      return next;
    });
  }
  function switchDraft(next: LessonDraft) {
    changeWorkspace((current) => {
      const drafts = { ...current.drafts, [lessonDraftKey(current.active)]: current.active };
      return { drafts, active: drafts[lessonDraftKey(next)] ?? next };
    });
    setError(null);
  }
  const [assignments, setAssignments] = useState<TeachingAssignmentSummary[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState(false);
  const [assignmentsAttempt, setAssignmentsAttempt] = useState(0);
  const [plansResult, setPlansResult] = useState<{
    assignmentId: string;
    plans: LessonPlan[];
    service: LessonPlanApplicationService;
  } | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansAttempt, setPlansAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const discardTrigger = useRef<HTMLButtonElement>(null);
  const discardCancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discardPending) discardCancel.current?.focus();
  }, [discardPending]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignmentsLoading(true);
    setAssignmentsError(false);
    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then((result) => {
        if (cancelled) return;
        setAssignments(result);
        changeWorkspace((current) =>
          result.some((item) => item.id === current.active.assignmentId)
            ? current
            : {
                ...current,
                active: {
                  assignmentId: result[0]?.id ?? "",
                  planDate: localIsoDate(),
                  editingPlanId: null,
                  fields: EMPTY_FIELDS,
                },
              },
        );
      })
      .catch(() => {
        if (!cancelled) setAssignmentsError(true);
      })
      .finally(() => {
        if (!cancelled) setAssignmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // changeWorkspace intentionally uses functional state; only repository identity triggers reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, teacherUserId, assignmentsAttempt]);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlansLoading(true);
    setPlansError(null);
    lessonPlanService
      .listByAssignment(assignmentId)
      .then((plans) => {
        if (!cancelled) setPlansResult({ assignmentId, plans, service: lessonPlanService });
      })
      .catch(() => {
        if (!cancelled) setPlansError("Could not load lesson plans for this class.");
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonPlanService, assignmentId, plansAttempt]);

  const plans =
    plansResult?.assignmentId === assignmentId && plansResult.service === lessonPlanService
      ? plansResult.plans
      : [];
  const validAssignment = assignments.some((item) => item.id === assignmentId);
  function startEditingPlan(plan: LessonPlan) {
    switchDraft({
      assignmentId,
      planDate: plan.planDate,
      editingPlanId: plan.id,
      fields: {
        learningCompetency: plan.learningCompetency,
        learningCompetencyCode: plan.learningCompetencyCode,
        learningObjectives: plan.learningObjectives,
        connectionToPreviousLearning: plan.connectionToPreviousLearning,
        learningExperiences: plan.learningExperiences,
        assessment: plan.assessment,
        waysForward: plan.waysForward,
      },
    });
  }
  function updateField(key: keyof LessonPlanFields, value: string) {
    changeWorkspace((current) => ({
      ...current,
      active: { ...current.active, fields: { ...current.active.fields, [key]: value } },
    }));
  }
  function discardDraft() {
    changeWorkspace((current) => {
      const drafts = { ...current.drafts };
      delete drafts[lessonDraftKey(current.active)];
      const next = {
        assignmentId,
        planDate: localIsoDate(),
        editingPlanId: null,
        fields: EMPTY_FIELDS,
      };
      return {
        drafts,
        active: editingPlanId ? (drafts[lessonDraftKey(next)] ?? next) : { ...next, planDate },
      };
    });
    setDiscardPending(false);
    discardTrigger.current?.focus();
  }
  async function handleSave() {
    if (!canSave) return;
    const submitted = workspace.active;
    setSaving(true);
    setError(null);
    let confirmed = false;
    try {
      const result = editingPlanId
        ? await lessonPlanService.update(editingPlanId, assignmentId, fields)
        : await lessonPlanService.create(assignmentId, planDate, fields);
      if (lessonDraftEpoch() !== epoch) return;
      if (!alive.current) {
        // A completed local write must not become a resubmission draft after navigation.
        const retained = readLessonWorkspace(owner);
        if (result !== null && retained) {
          const drafts = { ...retained.drafts };
          delete drafts[lessonDraftKey(submitted)];
          const sameSubmission =
            lessonDraftKey(retained.active) === lessonDraftKey(submitted) &&
            JSON.stringify(retained.active.fields) === JSON.stringify(submitted.fields);
          retainLessonWorkspace(
            owner,
            {
              drafts,
              active: sameSubmission
                ? { ...retained.active, editingPlanId: null, fields: EMPTY_FIELDS }
                : retained.active,
            },
            epoch,
            true,
          );
        }
        return;
      }
      if (result === null) {
        setError(
          editingPlanId
            ? "Could not save this lesson plan."
            : "Could not save this lesson plan — a plan for this date may already exist. Your draft is still here.",
        );
        return;
      }
      confirmed = true;
      const assignment = assignments.find((item) => item.id === submitted.assignmentId);
      setConfirmation(
        `Lesson plan ${editingPlanId ? "updated" : "saved"} on this device for ${assignment?.sectionName ?? "this class"} — ${assignment?.subjectName ?? ""}, ${submitted.planDate}.`,
      );
      changeWorkspace((current) => {
        const drafts = { ...current.drafts };
        delete drafts[lessonDraftKey(submitted)];
        if (lessonDraftKey(current.active) !== lessonDraftKey(submitted))
          return { ...current, drafts };
        return { drafts, active: { ...submitted, fields: EMPTY_FIELDS, editingPlanId: null } };
      });
      const refreshed = await lessonPlanService.listByAssignment(submitted.assignmentId);
      if (alive.current && currentAssignment.current === submitted.assignmentId) {
        setPlansResult({
          assignmentId: submitted.assignmentId,
          plans: refreshed,
          service: lessonPlanService,
        });
        setPlansError(null);
      }
    } catch (err) {
      if (!alive.current || lessonDraftEpoch() !== epoch) return;
      if (confirmed) {
        if (currentAssignment.current === submitted.assignmentId)
          setPlansError(
            "Your lesson plan was saved, but the list could not refresh. Retry lesson plans to see the saved plan.",
          );
      } else
        setError(
          err instanceof ValidationError
            ? err.message
            : "Could not confirm this lesson plan was saved. Your draft is still here; reload lesson plans and check the date before saving again.",
        );
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const canSave =
    !saving &&
    validAssignment &&
    !assignmentsLoading &&
    !assignmentsError &&
    planDate.length > 0 &&
    fields.learningCompetency.trim().length > 0 &&
    fields.learningObjectives.trim().length > 0 &&
    fields.learningExperiences.trim().length > 0 &&
    fields.assessment.trim().length > 0;

  return (
    <Page
      title="Creation Studio — Lesson Plan Builder"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Build a lesson plan in the ILAW format (Intentions, Learning Experiences, Assessment,
            Ways Forward) per DepEd Order No. 16, s. 2026. Pick a class and date, fill in each
            section, then save. This is your own planning tool — it is not submitted to DepEd.
          </p>
        ) : undefined
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {assignmentsError ? (
        <Alert tone="error">
          Could not load your teaching assignments.{" "}
          <button type="button" onClick={() => setAssignmentsAttempt((value) => value + 1)}>
            Retry assignments
          </button>
        </Alert>
      ) : assignmentsLoading ? (
        <Loading label="Loading your teaching assignments…" />
      ) : assignments.length === 0 ? (
        <EmptyState>You have no teaching assignments yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="lesson-plan-assignment">Class</label>
              <select
                id="lesson-plan-assignment"
                disabled={saving}
                value={assignmentId}
                onChange={(event) => {
                  switchDraft({
                    assignmentId: event.target.value,
                    planDate: localIsoDate(),
                    editingPlanId: null,
                    fields: EMPTY_FIELDS,
                  });
                }}
              >
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.sectionName} — {assignment.subjectName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lesson-plan-date">Date</label>
              <input
                id="lesson-plan-date"
                type="date"
                value={planDate}
                disabled={saving || editingPlanId !== null}
                onChange={(event) =>
                  switchDraft({
                    assignmentId,
                    planDate: event.target.value,
                    editingPlanId: null,
                    fields: EMPTY_FIELDS,
                  })
                }
              />
            </div>
          </div>

          <h3>Intentions</h3>
          <div className="field">
            <label htmlFor="lesson-plan-competency">Learning competency</label>
            <textarea
              disabled={saving}
              id="lesson-plan-competency"
              value={fields.learningCompetency}
              onChange={(event) => updateField("learningCompetency", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-plan-competency-code">Competency code</label>
            <input
              id="lesson-plan-competency-code"
              disabled={saving}
              type="text"
              placeholder="e.g. M7NS-Ig-1"
              value={fields.learningCompetencyCode}
              onChange={(event) => updateField("learningCompetencyCode", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-plan-objectives">Learning objectives (2–3, one per line)</label>
            <textarea
              disabled={saving}
              id="lesson-plan-objectives"
              value={fields.learningObjectives}
              onChange={(event) => updateField("learningObjectives", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-plan-connection">Connection to previous learning</label>
            <textarea
              disabled={saving}
              id="lesson-plan-connection"
              value={fields.connectionToPreviousLearning}
              onChange={(event) => updateField("connectionToPreviousLearning", event.target.value)}
            />
          </div>

          <h3>Learning Experiences</h3>
          <div className="field">
            <label htmlFor="lesson-plan-experiences">Planned activities</label>
            <textarea
              disabled={saving}
              id="lesson-plan-experiences"
              value={fields.learningExperiences}
              onChange={(event) => updateField("learningExperiences", event.target.value)}
            />
          </div>

          <h3>Assessment</h3>
          <div className="field">
            <label htmlFor="lesson-plan-assessment">How learning will be checked</label>
            <textarea
              disabled={saving}
              id="lesson-plan-assessment"
              value={fields.assessment}
              onChange={(event) => updateField("assessment", event.target.value)}
            />
          </div>

          <h3>Ways Forward</h3>
          <div className="field">
            <label htmlFor="lesson-plan-ways-forward">Reflection and next steps</label>
            <textarea
              disabled={saving}
              id="lesson-plan-ways-forward"
              value={fields.waysForward}
              onChange={(event) => updateField("waysForward", event.target.value)}
            />
          </div>

          <button
            type="button"
            className="button-primary"
            aria-disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : editingPlanId ? "Save changes" : "Save lesson plan"}
          </button>
          <button
            type="button"
            ref={discardTrigger}
            disabled={saving}
            onClick={() => setDiscardPending(true)}
          >
            {editingPlanId ? "Cancel edit" : "Discard draft"}
          </button>
          {editingPlanId && (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                switchDraft({
                  assignmentId,
                  planDate: localIsoDate(),
                  editingPlanId: null,
                  fields: EMPTY_FIELDS,
                })
              }
            >
              New lesson plan
            </button>
          )}
          {discardPending && (
            <Alert tone="warning">
              <p>
                Discard this unsaved {editingPlanId ? "edit" : "draft"}? Saved lesson plans will
                stay on this device.
              </p>
              <button
                type="button"
                ref={discardCancel}
                onClick={() => {
                  setDiscardPending(false);
                  discardTrigger.current?.focus();
                }}
              >
                Keep working
              </button>
              <button type="button" onClick={discardDraft}>
                Confirm discard
              </button>
            </Alert>
          )}

          <h3>Saved lesson plans for this class</h3>
          {plansError ? (
            <Alert tone="error">
              {plansError}{" "}
              <button type="button" onClick={() => setPlansAttempt((value) => value + 1)}>
                Retry lesson plans
              </button>
            </Alert>
          ) : plansLoading ||
            plansResult?.assignmentId !== assignmentId ||
            plansResult.service !== lessonPlanService ? (
            <Loading label="Loading lesson plans…" />
          ) : plans.length === 0 ? (
            <EmptyState>No lesson plans saved yet for this class.</EmptyState>
          ) : (
            <ul className="lesson-plan-list">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <span>
                    {plan.planDate} — {plan.learningCompetency}
                  </span>
                  <button type="button" disabled={saving} onClick={() => startEditingPlan(plan)}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
