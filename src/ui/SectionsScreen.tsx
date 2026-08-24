import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SectionApplicationService } from "../application/section-service";
import type { LearnerApplicationService } from "../application/learner-service";
import { ValidationError } from "../domain/errors";
import type { Learner } from "../domain/learner";
import type { Section } from "../domain/section";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SectionsScreenProps {
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SectionsScreen({ sectionService, learnerService }: SectionsScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
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

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([sectionService.listSections(), learnerService.listLearners()])
      .then(([sectionResult, learnerResult]) => {
        if (cancelled) return;
        setSections(sectionResult);
        setLearners(learnerResult);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load sections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionService, learnerService]);

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

  return (
    <section aria-label="Sections">
      <h2 ref={headingRef} tabIndex={-1}>
        Sections
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Create a section (e.g. Grade 7 - Mabini, 2025-2026), then enroll each learner into it.
          Attendance is recorded per section.
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

      {loading ? (
        <p role="status">Loading sections…</p>
      ) : sections.length === 0 ? (
        <p>No sections created yet.</p>
      ) : (
        <ul className="learner-list">
          {sections.map((section) => (
            <li key={section.id}>
              {section.name} — Grade {section.gradeLevel} ({section.schoolYear})
            </li>
          ))}
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
