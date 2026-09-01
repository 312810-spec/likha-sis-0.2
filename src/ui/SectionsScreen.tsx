import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SectionApplicationService } from "../application/section-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import { ValidationError } from "../domain/errors";
import type { Learner } from "../domain/learner";
import type { SchoolMember } from "../domain/school-member";
import type { Section } from "../domain/section";
import type { SectionAdvisory } from "../domain/section-advisory";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

export interface SectionsScreenProps {
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
  sectionAdvisoryService?: SectionAdvisoryApplicationService;
  schoolMemberService?: SchoolMemberApplicationService;
  /** Open the read-only roster for one section (Wave 2O). A callback +
   * parent state handoff, not a route -- the same pattern
   * TeacherWorkspaceScreen uses for "open attendance for this section". */
  onOpenRoster: (sectionId: string) => void;
  /** Open Teaching Assignments for one section (Wave 2Y). Same handoff
   * pattern as `onOpenRoster`; `sectionName` is passed along too since
   * this screen already has the full `Section` in hand and
   * `TeachingAssignmentsScreen` needs it only for display. */
  onManageAssignments: (sectionId: string, sectionName: string) => void;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SectionsScreen({
  sectionService,
  learnerService,
  sectionAdvisoryService,
  schoolMemberService,
  onOpenRoster,
  onManageAssignments,
}: SectionsScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [advisories, setAdvisories] = useState<Record<string, SectionAdvisory | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [schoolYear, setSchoolYear] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);

  const [enrollSectionId, setEnrollSectionId] = useState("");
  const [enrollLearnerId, setEnrollLearnerId] = useState("");
  const [enrollStartsOn, setEnrollStartsOn] = useState(todayAsIsoDate);
  const [enrolling, setEnrolling] = useState(false);

  // Section advisory management state
  const [activeAdvisorySectionId, setActiveAdvisorySectionId] = useState<string | null>(null);
  const [assignTeacherUserId, setAssignTeacherUserId] = useState("");
  const [assignStartsOn, setAssignStartsOn] = useState(todayAsIsoDate);
  const [endAdvisoryEndsOn, setEndAdvisoryEndsOn] = useState(todayAsIsoDate);
  const [savingAdvisory, setSavingAdvisory] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [sectionResult, learnerResult, memberResult] = await Promise.all([
          sectionService.listSections(),
          learnerService.listLearners(),
          schoolMemberService ? schoolMemberService.listMembers() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setSections(sectionResult);
        setLearners(learnerResult);
        setMembers(memberResult);

        if (sectionAdvisoryService) {
          const today = todayAsIsoDate();
          const advisoryEntries = await Promise.all(
            sectionResult.map(async (sec) => {
              const adv = await sectionAdvisoryService.getCurrentAdviser(sec.id, today);
              return [sec.id, adv] as const;
            }),
          );
          if (cancelled) return;
          setAdvisories(Object.fromEntries(advisoryEntries));
        }
      } catch {
        if (!cancelled) setError("Could not load sections.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [sectionService, learnerService, sectionAdvisoryService, schoolMemberService]);

  const teachers = members.filter((member) => member.roles.includes("teacher"));

  function teacherName(teacherUserId: string): string {
    return members.find((member) => member.id === teacherUserId)?.displayName ?? teacherUserId;
  }

  async function handleCreateSection(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setCreatingSection(true);
    try {
      const section = await sectionService.createSection(schoolYear, gradeLevel, sectionName);
      setSections((current) => [...current, section]);
      setConfirmation(`${section.name} was created.`);
      setSchoolYear("");
      setGradeLevel("");
      setSectionName("");
      if (sectionAdvisoryService) {
        setAdvisories((current) => ({ ...current, [section.id]: null }));
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not create this section.");
    } finally {
      setCreatingSection(false);
    }
  }

  async function handleEnroll(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setEnrolling(true);
    try {
      const membership = await sectionService.enrollLearner(
        enrollSectionId,
        enrollLearnerId,
        enrollStartsOn,
      );
      if (membership === null) {
        setError("Could not enroll this learner — check the section and learner selected.");
      } else {
        setConfirmation("Learner enrolled.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not enroll this learner.");
    } finally {
      setEnrolling(false);
    }
  }

  async function handleAssignAdviser(section: Section, event: FormEvent) {
    event.preventDefault();
    if (!sectionAdvisoryService) return;
    setError(null);
    setConfirmation(null);
    setSavingAdvisory(true);
    try {
      const outcome = await sectionAdvisoryService.assignAdviser(
        section.id,
        assignTeacherUserId,
        assignStartsOn,
      );
      switch (outcome.kind) {
        case "assigned": {
          setAdvisories((current) => ({ ...current, [section.id]: outcome.advisory }));
          setConfirmation(
            `${teacherName(assignTeacherUserId)} is now the adviser of ${section.name}.`,
          );
          setActiveAdvisorySectionId(null);
          setAssignTeacherUserId("");
          break;
        }
        case "alreadyHasAnActiveAdviser":
          setError("This section already has an active adviser. End the existing advisory first.");
          break;
        case "unknownTeacher":
          setError("Could not assign this teacher — the selected teacher was not found.");
          break;
        case "unknownSection":
          setError("Could not find this section.");
          break;
      }
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : "Could not assign adviser — check that you have permission to manage section advisories.",
      );
    } finally {
      setSavingAdvisory(false);
    }
  }

  async function handleEndAdviser(section: Section, advisory: SectionAdvisory, event: FormEvent) {
    event.preventDefault();
    if (!sectionAdvisoryService) return;
    setError(null);
    setConfirmation(null);
    setSavingAdvisory(true);
    try {
      const outcome = await sectionAdvisoryService.endAdviser(
        section.id,
        advisory.id,
        endAdvisoryEndsOn,
      );
      switch (outcome.kind) {
        case "ended": {
          setAdvisories((current) => ({ ...current, [section.id]: null }));
          setConfirmation(`Ended advisory for ${section.name}.`);
          setActiveAdvisorySectionId(null);
          break;
        }
        case "notFound":
          setError(
            "Could not end this advisory — the advisory was not found or has already ended.",
          );
          break;
      }
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : "Could not end advisory — check that you have permission to manage section advisories.",
      );
    } finally {
      setSavingAdvisory(false);
    }
  }

  return (
    <section aria-label="Sections">
      <h2 ref={headingRef} tabIndex={-1}>
        Sections
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Create a section (e.g. Grade 7 - Mabini, 2025-2026), assign an adviser, and enroll each
          learner into it. Attendance and advisory reporting are scoped per section.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <EmptyState>No sections created yet.</EmptyState>
      ) : (
        <ul className="learner-list">
          {sections.map((section) => {
            const currentAdviser = advisories[section.id];
            const isAdvisoryPanelOpen = activeAdvisorySectionId === section.id;

            return (
              <li key={section.id} className="section-list-row">
                <div>
                  <strong>
                    {section.name} — Grade {section.gradeLevel} ({section.schoolYear})
                  </strong>
                  {sectionAdvisoryService && (
                    <div className="field-hint" style={{ marginTop: "0.25rem" }}>
                      Adviser:{" "}
                      {currentAdviser
                        ? `${teacherName(currentAdviser.teacherUserId)} (since ${currentAdviser.startsOn})`
                        : "No adviser assigned"}
                    </div>
                  )}
                </div>
                <div
                  style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenRoster(section.id)}
                    aria-label={`Open roster for ${section.name}`}
                  >
                    Open roster
                  </button>
                  <button
                    type="button"
                    onClick={() => onManageAssignments(section.id, section.name)}
                    aria-label={`Manage teaching assignments for ${section.name}`}
                  >
                    Manage assignments
                  </button>
                  {sectionAdvisoryService && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmation(null);
                        setActiveAdvisorySectionId(isAdvisoryPanelOpen ? null : section.id);
                        setAssignTeacherUserId("");
                        setAssignStartsOn(todayAsIsoDate());
                        setEndAdvisoryEndsOn(todayAsIsoDate());
                      }}
                      aria-label={`Manage adviser for ${section.name}`}
                    >
                      {isAdvisoryPanelOpen ? "Close adviser panel" : "Manage adviser"}
                    </button>
                  )}
                </div>

                {isAdvisoryPanelOpen && (
                  <div
                    className="form-row"
                    style={{
                      marginTop: "1rem",
                      padding: "1rem",
                      backgroundColor: "var(--color-surface-subtle, #f5f5f5)",
                      borderRadius: "0.375rem",
                      flexDirection: "column",
                      alignItems: "stretch",
                      width: "100%",
                    }}
                    aria-label={`Adviser management for ${section.name}`}
                  >
                    <h3>Manage adviser for {section.name}</h3>
                    {mode === "guided" && (
                      <p className="field-hint">
                        Each section can have at most one active class adviser. To change an
                        adviser, end the current advisory first.
                      </p>
                    )}

                    {currentAdviser ? (
                      <form
                        onSubmit={(event) => handleEndAdviser(section, currentAdviser, event)}
                        aria-label={`End advisory for ${section.name}`}
                      >
                        <p>
                          <strong>Current adviser:</strong>{" "}
                          {teacherName(currentAdviser.teacherUserId)} (effective{" "}
                          {currentAdviser.startsOn})
                        </p>
                        <div className="form-row" style={{ alignItems: "flex-end" }}>
                          <div className="field">
                            <label htmlFor={`end-date-${section.id}`}>End date</label>
                            <input
                              id={`end-date-${section.id}`}
                              type="date"
                              value={endAdvisoryEndsOn}
                              onChange={(e) => setEndAdvisoryEndsOn(e.target.value)}
                              required
                            />
                          </div>
                          <button
                            type="submit"
                            className="button-primary"
                            disabled={savingAdvisory}
                          >
                            {savingAdvisory ? "Ending…" : "End advisory"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveAdvisorySectionId(null)}
                            disabled={savingAdvisory}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form
                        onSubmit={(event) => handleAssignAdviser(section, event)}
                        aria-label={`Assign adviser for ${section.name}`}
                      >
                        {teachers.length === 0 ? (
                          <p className="field-hint">No teachers are members of this school yet.</p>
                        ) : (
                          <div className="form-row" style={{ alignItems: "flex-end" }}>
                            <div className="field">
                              <label htmlFor={`assign-teacher-${section.id}`}>Select teacher</label>
                              <select
                                id={`assign-teacher-${section.id}`}
                                value={assignTeacherUserId}
                                onChange={(e) => setAssignTeacherUserId(e.target.value)}
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
                              <label htmlFor={`assign-start-${section.id}`}>Start date</label>
                              <input
                                id={`assign-start-${section.id}`}
                                type="date"
                                value={assignStartsOn}
                                onChange={(e) => setAssignStartsOn(e.target.value)}
                                required
                              />
                            </div>
                            <button
                              type="submit"
                              className="button-primary"
                              disabled={savingAdvisory || !assignTeacherUserId}
                            >
                              {savingAdvisory ? "Assigning…" : "Assign adviser"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveAdvisorySectionId(null)}
                              disabled={savingAdvisory}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleCreateSection} aria-label="Create a section">
        <h3>Create a section</h3>
        <div className="form-row">
          <div className="field">
            <label htmlFor="section-school-year">School year</label>
            <input
              id="section-school-year"
              type="text"
              placeholder="2025-2026"
              value={schoolYear}
              onChange={(event) => setSchoolYear(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="section-grade-level">Grade level</label>
            <input
              id="section-grade-level"
              type="text"
              placeholder="7"
              value={gradeLevel}
              onChange={(event) => setGradeLevel(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="section-name">Section name</label>
            <input
              id="section-name"
              type="text"
              placeholder="Mabini"
              value={sectionName}
              onChange={(event) => setSectionName(event.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="button-primary" disabled={creatingSection}>
          {creatingSection ? "Creating…" : "Create section"}
        </button>
      </form>

      <form onSubmit={handleEnroll} aria-label="Enroll a learner into a section">
        <h3>Enroll a learner</h3>
        <div className="form-row">
          <div className="field">
            <label htmlFor="enroll-section">Section</label>
            <select
              id="enroll-section"
              value={enrollSectionId}
              onChange={(event) => setEnrollSectionId(event.target.value)}
              required
            >
              <option value="" disabled>
                Select a section
              </option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name} — Grade {section.gradeLevel}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="enroll-learner">Learner</label>
            <select
              id="enroll-learner"
              value={enrollLearnerId}
              onChange={(event) => setEnrollLearnerId(event.target.value)}
              required
            >
              <option value="" disabled>
                Select a learner
              </option>
              {learners.map((learner) => (
                <option key={learner.id} value={learner.id}>
                  {learner.givenName} {learner.familyName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="enroll-starts-on">Start date</label>
            <input
              id="enroll-starts-on"
              type="date"
              value={enrollStartsOn}
              onChange={(event) => setEnrollStartsOn(event.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="button-primary" disabled={enrolling}>
          {enrolling ? "Enrolling…" : "Enroll learner"}
        </button>
      </form>
    </section>
  );
}
