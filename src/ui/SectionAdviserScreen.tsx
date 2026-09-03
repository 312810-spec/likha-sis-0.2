import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import { ValidationError } from "../domain/errors";
import type { SchoolMember } from "../domain/school-member";
import type { SectionAdvisory } from "../domain/section-advisory";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SectionAdviserScreenProps {
  sectionAdvisoryService: SectionAdvisoryApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  /** The section to manage the adviser for. Supplied by the Sections
   * workflow (App.tsx state handoff), never a URL/route param -- the
   * same narrowly-typed pattern `TeachingAssignmentsScreen`'s
   * `sectionId`/`sectionName` already use. */
  sectionId: string;
  sectionName: string;
  onBack: () => void;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Wave 3G: wires Wave 3E's already-tested `assign_section_adviser`/
 * `end_section_adviser`/`current_section_adviser` commands into a real
 * School Head workflow. Reassignment is deliberately explicit
 * end-then-assign, not a one-step "replace" -- the assign form only
 * appears once the current adviser has been ended, the same
 * history-preserving convention `TeachingAssignmentsScreen`'s own
 * remove-then-create shape already established (see
 * `docs/adr/0056-section-advisory-foundation.md`). Any authenticated
 * school member may view this screen (matching
 * `current_section_adviser`'s reference-data convention); the backend
 * alone enforces that only a School Head may assign or end an
 * advisory -- security must not rely on UI hiding, so this screen shows
 * the same form to everyone and surfaces a generic error if the backend
 * declines. */
export function SectionAdviserScreen({
  sectionAdvisoryService,
  schoolMemberService,
  sectionId,
  sectionName,
  onBack,
}: SectionAdviserScreenProps) {
  const { mode } = useTeacherMode();

  const [adviser, setAdviser] = useState<SectionAdvisory | null>(null);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignStartsOn, setAssignStartsOn] = useState(todayAsIsoDate);
  const [assigning, setAssigning] = useState(false);
  const [endsOn, setEndsOn] = useState(todayAsIsoDate);
  const [ending, setEnding] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      sectionAdvisoryService.currentAdviser(sectionId, todayAsIsoDate()),
      schoolMemberService.listMembers(),
    ])
      .then(([adviserResult, memberResult]) => {
        if (requestRef.current !== requestId) return;
        setAdviser(adviserResult);
        setMembers(memberResult);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load this section's adviser.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionAdvisoryService, schoolMemberService, sectionId]);

  const teachers = members.filter((member) => member.roles.includes("teacher"));

  function teacherName(teacherUserId: string): string {
    return members.find((member) => member.id === teacherUserId)?.displayName ?? teacherUserId;
  }

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (assigning || teachers.length === 0) return;
    setError(null);
    setConfirmation(null);
    setAssigning(true);
    try {
      const outcome = await sectionAdvisoryService.assign(
        sectionId,
        assignTeacherId,
        assignStartsOn,
      );
      if (outcome.kind === "assigned") {
        setAdviser(outcome.advisory);
        setConfirmation(`${teacherName(assignTeacherId)} was assigned as adviser.`);
        setAssignTeacherId("");
      } else if (outcome.kind === "alreadyHasAnActiveAdviser") {
        setError("This section already has an active adviser — end that advisory first.");
        load();
      } else {
        setError(
          "Could not assign this adviser — check that the teacher is still valid, or that you have permission to manage section advisers.",
        );
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not assign this adviser.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleEnd(event: FormEvent) {
    event.preventDefault();
    if (!adviser || ending) return;
    setError(null);
    setConfirmation(null);
    setEnding(true);
    try {
      const outcome = await sectionAdvisoryService.end(sectionId, adviser.id, endsOn);
      if (outcome.kind === "ended") {
        setAdviser(null);
        setConfirmation(`${teacherName(adviser.teacherUserId)}'s advisory was ended.`);
      } else {
        setError("Could not end this advisory.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not end this advisory.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <Page
      title={`${sectionName} — adviser`}
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Assign one teacher as this section's adviser. To change advisers, end the current
            advisory first, then assign the new teacher — this keeps a full history of who advised
            this section and when.
          </p>
        ) : undefined
      }
    >
      <button type="button" className="section-roster-back" onClick={onBack}>
        <span aria-hidden="true">← </span>Back to sections
      </button>

      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading this section's adviser…" />
      ) : loadError ? null : adviser ? (
        <form onSubmit={handleEnd} aria-label="End the current advisory">
          <h3>Current adviser</h3>
          <p>
            {teacherName(adviser.teacherUserId)} — adviser since {adviser.startsOn}
          </p>
          <div className="field">
            <label htmlFor="advisory-ends-on">End date</label>
            <input
              id="advisory-ends-on"
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="button-primary" aria-disabled={ending}>
            {ending ? "Ending…" : "End advisory"}
          </button>
        </form>
      ) : (
        <>
          <EmptyState>No adviser is currently assigned to this section.</EmptyState>
          <form onSubmit={handleAssign} aria-label="Assign an adviser">
            <h3>Assign an adviser</h3>
            {teachers.length === 0 ? (
              <p className="field-hint">No teachers are members of this school yet.</p>
            ) : (
              <div className="form-row">
                <div className="field">
                  <label htmlFor="advisory-teacher">Teacher</label>
                  <select
                    id="advisory-teacher"
                    value={assignTeacherId}
                    onChange={(event) => setAssignTeacherId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a teacher
                    </option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="advisory-starts-on">Start date</label>
                  <input
                    id="advisory-starts-on"
                    type="date"
                    value={assignStartsOn}
                    onChange={(event) => setAssignStartsOn(event.target.value)}
                    required
                  />
                </div>
              </div>
            )}
            <button
              type="submit"
              className="button-primary"
              aria-disabled={assigning || teachers.length === 0}
            >
              {assigning ? "Assigning…" : "Assign adviser"}
            </button>
          </form>
        </>
      )}
    </Page>
  );
}
