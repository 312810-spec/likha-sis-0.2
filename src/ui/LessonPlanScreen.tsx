import { useEffect, useState } from "react";
import type { LessonPlanApplicationService } from "../application/lesson-plan-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { LessonPlan, LessonPlanFields } from "../domain/lesson-plan";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { ValidationError } from "../domain/errors";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Creation Studio — structured lesson-plan builder (third of three
 * confirmed Creation Studio sub-scopes; assessment-item authoring and
 * class-summary export already shipped). Follows the "ILAW" format --
 * Intentions, Learning Experiences, Assessment, Ways Forward -- per
 * DepEd Order No. 16, s. 2026 (researched this session; see
 * `docs/CURRENT-HANDOFF.md`). This is the teacher's own planning tool,
 * not an official DepEd form output -- there is no PDF export here.
 */
export function LessonPlanScreen({
  lessonPlanService,
  subjectAttendanceService,
  teacherUserId,
}: LessonPlanScreenProps) {
  const { mode } = useTeacherMode();

  const [assignments, setAssignments] = useState<TeachingAssignmentSummary[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentId, setAssignmentId] = useState("");
  const [planDate, setPlanDate] = useState(todayIsoDate());

  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [fields, setFields] = useState<LessonPlanFields>(EMPTY_FIELDS);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then((result) => {
        if (cancelled) return;
        setAssignments(result);
        if (result[0]) setAssignmentId(result[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your teaching assignments.");
      })
      .finally(() => {
        if (!cancelled) setAssignmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectAttendanceService, teacherUserId]);

  useEffect(() => {
    if (!assignmentId) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlansLoading(true);
    lessonPlanService
      .listByAssignment(assignmentId)
      .then((result) => {
        if (!cancelled) setPlans(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load lesson plans for this assignment.");
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonPlanService, assignmentId]);

  function startNewPlan() {
    setEditingPlanId(null);
    setFields(EMPTY_FIELDS);
    setPlanDate(todayIsoDate());
    setError(null);
    setConfirmation(null);
  }

  function startEditingPlan(plan: LessonPlan) {
    setEditingPlanId(plan.id);
    setPlanDate(plan.planDate);
    setFields({
      learningCompetency: plan.learningCompetency,
      learningCompetencyCode: plan.learningCompetencyCode,
      learningObjectives: plan.learningObjectives,
      connectionToPreviousLearning: plan.connectionToPreviousLearning,
      learningExperiences: plan.learningExperiences,
      assessment: plan.assessment,
      waysForward: plan.waysForward,
    });
    setError(null);
    setConfirmation(null);
  }

  function updateField(key: keyof LessonPlanFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (saving || !assignmentId) return;
    setSaving(true);
    setError(null);
    try {
      const result = editingPlanId
        ? await lessonPlanService.update(editingPlanId, assignmentId, fields)
        : await lessonPlanService.create(assignmentId, planDate, fields);
      if (result === null) {
        setError(
          editingPlanId
            ? "Could not save this lesson plan."
            : "Could not save this lesson plan — a plan for this date may already exist.",
        );
      } else {
        const refreshed = await lessonPlanService.listByAssignment(assignmentId);
        setPlans(refreshed);
        setConfirmation(editingPlanId ? "Lesson plan updated." : "Lesson plan saved.");
        startNewPlan();
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not save this lesson plan.");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    !saving &&
    assignmentId.length > 0 &&
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

      {assignmentsLoading ? (
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
                value={assignmentId}
                onChange={(event) => {
                  setAssignmentId(event.target.value);
                  startNewPlan();
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
                disabled={editingPlanId !== null}
                onChange={(event) => setPlanDate(event.target.value)}
              />
            </div>
          </div>

          <h3>Intentions</h3>
          <div className="field">
            <label htmlFor="lesson-plan-competency">Learning competency</label>
            <textarea
              id="lesson-plan-competency"
              value={fields.learningCompetency}
              onChange={(event) => updateField("learningCompetency", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-plan-competency-code">Competency code</label>
            <input
              id="lesson-plan-competency-code"
              type="text"
              placeholder="e.g. M7NS-Ig-1"
              value={fields.learningCompetencyCode}
              onChange={(event) => updateField("learningCompetencyCode", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-plan-objectives">Learning objectives (2–3, one per line)</label>
            <textarea
              id="lesson-plan-objectives"
              value={fields.learningObjectives}
              onChange={(event) => updateField("learningObjectives", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-plan-connection">Connection to previous learning</label>
            <textarea
              id="lesson-plan-connection"
              value={fields.connectionToPreviousLearning}
              onChange={(event) => updateField("connectionToPreviousLearning", event.target.value)}
            />
          </div>

          <h3>Learning Experiences</h3>
          <div className="field">
            <label htmlFor="lesson-plan-experiences">Planned activities</label>
            <textarea
              id="lesson-plan-experiences"
              value={fields.learningExperiences}
              onChange={(event) => updateField("learningExperiences", event.target.value)}
            />
          </div>

          <h3>Assessment</h3>
          <div className="field">
            <label htmlFor="lesson-plan-assessment">How learning will be checked</label>
            <textarea
              id="lesson-plan-assessment"
              value={fields.assessment}
              onChange={(event) => updateField("assessment", event.target.value)}
            />
          </div>

          <h3>Ways Forward</h3>
          <div className="field">
            <label htmlFor="lesson-plan-ways-forward">Reflection and next steps</label>
            <textarea
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
          {editingPlanId && (
            <button type="button" onClick={startNewPlan}>
              Cancel edit
            </button>
          )}

          <h3>Saved lesson plans for this class</h3>
          {plansLoading ? (
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
                  <button type="button" onClick={() => startEditingPlan(plan)}>
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
