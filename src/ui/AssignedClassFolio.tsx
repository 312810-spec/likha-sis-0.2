import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  SubjectAttendanceMonitor,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { useTeacherMode } from "./theme/useTeacherMode";
import type { TeacherClassWorkContext } from "./work-context";

type FolioTab = "overview" | "scores" | "forms";
const TABS: Array<{ id: FolioTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "scores", label: "Scores" },
  { id: "forms", label: "Forms" },
];

interface AssignedClassFolioProps {
  teacherUserId: string;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  onCheckAttendance: (context: TeacherClassWorkContext) => void;
  onOpenClassRecord: (context: TeacherClassWorkContext) => void;
  onOpenAdvisory: () => void;
  onOpenForms: () => void;
  renderScores?: (context: TeacherClassWorkContext, onBackToOverview: () => void) => ReactNode;
  initialTab?: FolioTab;
  selectedClassContext?: TeacherClassWorkContext | null;
  onSelectClass?: (context: TeacherClassWorkContext) => void;
}

interface AssignmentState {
  owner: string;
  assignments: TeachingAssignmentSummary[];
  status: "loading" | "ready" | "error";
}

/** Assignment labels are presentation hints. Connected services revalidate access. */
export function AssignedClassFolio({
  teacherUserId,
  subjectAttendanceService,
  onCheckAttendance,
  onOpenClassRecord,
  onOpenAdvisory,
  onOpenForms,
  renderScores,
  initialTab = "overview",
  selectedClassContext,
  onSelectClass,
}: AssignedClassFolioProps) {
  const { mode } = useTeacherMode();
  const id = useId();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [state, setState] = useState<AssignmentState>({
    owner: teacherUserId,
    assignments: [],
    status: "loading",
  });
  const [selection, setSelection] = useState<string | null>(null);
  const [tab, setActiveSheetTab] = useState<FolioTab>(initialTab);
  const [scoresVisited, setScoresVisited] = useState(initialTab === "scores");
  function setTab(next: FolioTab) {
    setActiveSheetTab(next);
    if (next === "scores") setScoresVisited(true);
  }
  const [overviewFocusRequest, setOverviewFocusRequest] = useState(0);
  useEffect(() => {
    if (overviewFocusRequest > 0) tabRefs.current[0]?.focus();
  }, [overviewFocusRequest]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let active = true;
    // Clear prior-user content immediately; a late response cannot restore it.
    void subjectAttendanceService.listMyAssignments(teacherUserId).then(
      (assignments) => {
        if (active) setState({ owner: teacherUserId, assignments, status: "ready" });
      },
      () => {
        if (active) setState({ owner: teacherUserId, assignments: [], status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [subjectAttendanceService, teacherUserId, loadAttempt]);

  const visible = state.owner === teacherUserId ? state : null;
  const assignments = visible?.assignments ?? [];
  // Removed assignments cannot retain an actionable stale class sheet.
  const selected =
    assignments.find(
      (item) => item.id === (selectedClassContext?.teachingAssignmentId ?? selection),
    ) ?? assignments[0];
  const context: TeacherClassWorkContext | null = selected
    ? {
        teachingAssignmentId: selected.id,
        subjectName: selected.subjectName,
        sectionName: selected.sectionName,
      }
    : null;

  function retry() {
    setState({ owner: teacherUserId, assignments: [], status: "loading" });
    setLoadAttempt((attempt) => attempt + 1);
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % TABS.length;
        break;
      case "ArrowLeft":
        next = (index + TABS.length - 1) % TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="concept-folio">
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {context ? `Selected class: ${context.subjectName}, ${context.sectionName}.` : ""}
      </p>
      <section className="concept-folio-index" aria-labelledby={`${id}-classes`}>
        <h2 id={`${id}-classes`}>My classes</h2>
        {!visible || visible.status === "loading" ? (
          <p role="status">Loading your classes…</p>
        ) : visible.status === "error" ? (
          <div className="concept-folio-state" role="alert">
            <p>Could not load your classes.</p>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="concept-folio-state">
            <p>No teaching assignments yet.</p>
            <p className="field-hint">
              Ask your school administrator to assign your subject classes.
            </p>
          </div>
        ) : (
          <ul className="concept-folio-class-list">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <button
                  type="button"
                  className="concept-folio-class"
                  aria-pressed={assignment.id === selected?.id}
                  aria-label={`${assignment.subjectName} · ${assignment.sectionName}`}
                  onClick={() => {
                    setSelection(assignment.id);
                    onSelectClass?.({
                      teachingAssignmentId: assignment.id,
                      subjectName: assignment.subjectName,
                      sectionName: assignment.sectionName,
                    });
                  }}
                >
                  <strong>{assignment.subjectName}</strong>
                  <span>{assignment.sectionName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && context ? (
        <section className="concept-folio-sheet" aria-labelledby={`${id}-class-title`}>
          <header className="concept-folio-heading">
            <h2 id={`${id}-class-title`}>{selected.sectionName}</h2>
            <p>
              {selected.subjectName} · {selected.schoolYear}
            </p>
          </header>
          <div className="concept-folio-tabs" role="tablist" aria-label="Class worksheet">
            {TABS.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={`${id}-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`${id}-panel`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => moveTab(event, index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            id={`${id}-panel`}
            className="concept-folio-panel"
            role="tabpanel"
            aria-labelledby={`${id}-tab-${tab}`}
            tabIndex={0}
          >
            {scoresVisited && renderScores ? (
              <div key={selected.id} className="concept-folio-scores" hidden={tab !== "scores"}>
                {renderScores(context, () => {
                  setTab("overview");
                  setOverviewFocusRequest((request) => request + 1);
                })}
              </div>
            ) : null}
            {tab === "overview" ? (
              <>
                {mode === "guided" ? (
                  <p className="field-hint">
                    Choose a class on the left, then open its attendance, scores, or forms. Subject
                    attendance and advisory records are kept separately.
                  </p>
                ) : null}
                <div className="concept-folio-row">
                  <div>
                    <h3>Subject attendance</h3>
                    <p>Attendance for this subject class.</p>
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onCheckAttendance(context)}
                  >
                    Check attendance
                  </button>
                </div>
                <div className="concept-folio-row">
                  <div>
                    <h3>Class record</h3>
                    <p>Assessments, learner scores, and grades.</p>
                  </div>
                  <button type="button" onClick={() => setTab("scores")}>
                    View scores
                  </button>
                </div>
                <ClassRosterSummary
                  key={selected.id}
                  service={subjectAttendanceService}
                  assignmentId={selected.id}
                />
                <section className="concept-folio-links" aria-labelledby={`${id}-forms-title`}>
                  <h3 id={`${id}-forms-title`}>Forms</h3>
                  <button type="button" onClick={() => onOpenAdvisory()}>
                    <span>Advisory attendance</span>
                    <span aria-hidden="true">›</span>
                  </button>
                  <button type="button" onClick={() => onOpenForms()}>
                    <span>School forms and exports</span>
                    <span aria-hidden="true">›</span>
                  </button>
                </section>
              </>
            ) : tab === "scores" ? (
              !renderScores ? (
                <div className="concept-folio-row">
                  <div>
                    <h3>Class record</h3>
                    <p>
                      Select a grading period and weighting policy to work with this class’s scores.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onOpenClassRecord(context)}
                  >
                    Open class record
                  </button>
                </div>
              ) : null
            ) : (
              <section className="concept-folio-form-list" aria-label="Class forms">
                <div className="concept-folio-row">
                  <div>
                    <h3>Advisory attendance summary</h3>
                    <p>
                      Monthly attendance belongs to your assigned advisory, which may differ from
                      this subject class.
                    </p>
                  </div>
                  <button type="button" onClick={() => onOpenAdvisory()}>
                    Open My Advisory
                  </button>
                </div>
                <div className="concept-folio-row">
                  <div>
                    <h3>Report card data</h3>
                    <p>
                      Review this class’s grades in its class record. Available exports are listed
                      in School Forms.
                    </p>
                  </div>
                  <button type="button" onClick={() => setTab("scores")}>
                    Review grades
                  </button>
                </div>
                <div className="concept-folio-row">
                  <div>
                    <h3>School forms and exports</h3>
                    <p>Check supported formats and required records before exporting.</p>
                  </div>
                  <button type="button" onClick={() => onOpenForms()}>
                    Open School Forms
                  </button>
                </div>
              </section>
            )}
          </div>
        </section>
      ) : (
        <div className="concept-folio-sheet concept-folio-empty" aria-hidden="true" />
      )}
    </div>
  );
}

function ClassRosterSummary({
  service,
  assignmentId,
}: {
  service: SubjectAttendanceApplicationService;
  assignmentId: string;
}) {
  const [result, setResult] = useState<SubjectAttendanceMonitor | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    void service.monitor(assignmentId, date).then(
      (monitor) => {
        if (active) {
          setResult(monitor);
          setStatus("ready");
        }
      },
      () => {
        if (active) setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [service, assignmentId, attempt]);
  return (
    <section className="concept-folio-roster" aria-label="Subject attendance summary">
      <h3>Class learners</h3>
      <p className="field-hint">Subject attendance totals as of today</p>
      {status === "loading" ? (
        <p role="status">Loading class learners…</p>
      ) : status === "error" ? (
        <div role="alert">
          <p>Could not load class learners.</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Retry learners
          </button>
        </div>
      ) : !result ? (
        <p>Class learner information is unavailable.</p>
      ) : result.rows.length === 0 ? (
        <p>No learners are currently in this class roster.</p>
      ) : (
        <div
          className="concept-folio-table-wrap"
          role="region"
          aria-label="Class attendance roster"
          tabIndex={0}
        >
          <table>
            <caption className="visually-hidden">Subject attendance totals</caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                <th scope="col">Present</th>
                <th scope="col">Absent</th>
                <th scope="col">Late</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.membershipId}>
                  <th scope="row">
                    {row.familyName}, {row.givenName}
                  </th>
                  <td>{row.presentCount}</td>
                  <td>{row.absentCount}</td>
                  <td>{row.lateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
