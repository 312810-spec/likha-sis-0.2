import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SectionApplicationService } from "../application/section-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { ExportApplicationService } from "../application/export-service";
import { ValidationError } from "../domain/errors";
import type { Sf6ExportResult } from "../domain/export";
import type { Learner } from "../domain/learner";
import type { Section } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SectionsScreenProps {
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
  /** Generates the SF6 (Summarized Report on Promotion and Level of
   * Proficiency) End-of-School-Year export. Optional for backwards
   * compatibility with tests/callers that only test section/enrollment
   * management. */
  exportService?: ExportApplicationService;
  /** Open the read-only roster for one section (Wave 2O). A callback +
   * parent state handoff, not a route -- the same pattern
   * TeacherWorkspaceScreen uses for "open attendance for this section". */
  onOpenRoster: (sectionId: string) => void;
  /** Open Teaching Assignments for one section (Wave 2Y). Same handoff
   * pattern as `onOpenRoster`; `sectionName` is passed along too since
   * this screen already has the full `Section` in hand and
   * `TeachingAssignmentsScreen` needs it only for display. */
  onManageAssignments: (sectionId: string, sectionName: string) => void;
  /** Open Section Adviser Management for one section (Wave 3G). Same
   * handoff pattern as `onManageAssignments`. */
  onManageAdviser: (sectionId: string, sectionName: string) => void;
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
  exportService,
  onOpenRoster,
  onManageAssignments,
  onManageAdviser,
}: SectionsScreenProps) {
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

  // SF6 School Promotion Summary export state
  const [sf6SchoolYear, setSf6SchoolYear] = useState("");
  const [sf6Exporting, setSf6Exporting] = useState(false);
  const [sf6Result, setSf6Result] = useState<Sf6ExportResult | null>(null);
  const [sf6Error, setSf6Error] = useState<string | null>(null);
  const [revealingSf6, setRevealingSf6] = useState(false);
  const [revealSf6Error, setRevealSf6Error] = useState<string | null>(null);

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

  const availableSchoolYears = Array.from(
    new Set(sections.map((s) => s.schoolYear).filter(Boolean)),
  );

  async function handleExportSf6(event: FormEvent) {
    event.preventDefault();
    if (!exportService) return;
    setSf6Error(null);
    setSf6Result(null);
    setRevealSf6Error(null);
    setSf6Exporting(true);
    try {
      const effectiveSy = sf6SchoolYear.trim() || availableSchoolYears[0] || "";
      if (!effectiveSy) {
        setSf6Error("Please enter or select a school year to export SF6.");
        return;
      }
      const result = await exportService.exportSchoolEosySf6(effectiveSy);
      setSf6Result(result);
    } catch (err) {
      setSf6Error(
        err instanceof ValidationError
          ? err.message
          : "Could not export SF6 — check that you have permission to export school summaries, or that school year records are complete.",
      );
    } finally {
      setSf6Exporting(false);
    }
  }

  async function handleRevealSf6() {
    if (!exportService || revealingSf6 || !sf6Result) return;
    setRevealSf6Error(null);
    setRevealingSf6(true);
    try {
      await exportService.revealExportedFile(sf6Result.filePath);
    } catch {
      setRevealSf6Error("Could not open the folder for this file.");
    } finally {
      setRevealingSf6(false);
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

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <EmptyState>No sections created yet.</EmptyState>
      ) : (
        <ul className="learner-list">
          {sections.map((section) => (
            <li key={section.id} className="section-list-row">
              <span>
                {section.name} — Grade {section.gradeLevel} ({section.schoolYear})
              </span>
              <button
                type="button"
                onClick={() => onOpenRoster(section.id)}
                aria-label={`Open roster for ${section.name}`}
              >
                Open roster
              </button>{" "}
              <button
                type="button"
                onClick={() => onManageAssignments(section.id, section.name)}
                aria-label={`Manage teaching assignments for ${section.name}`}
              >
                Manage assignments
              </button>{" "}
              <button
                type="button"
                onClick={() => onManageAdviser(section.id, section.name)}
                aria-label={`Manage adviser for ${section.name}`}
              >
                Manage adviser
              </button>
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

      {exportService && (
        <section
          aria-label="School Form 6 (SF6) Summarized Promotion Report"
          style={{ marginTop: "2rem" }}
        >
          <h3>End-of-School-Year Summary (SF6)</h3>
          {mode === "guided" && (
            <p className="field-hint">
              School Form 6 (SF6) consolidates promotion decisions (Promoted, Conditional, Retained)
              and levels of proficiency across all sections and grade levels in the school for the
              selected school year per DepEd Order No. 4, s. 2014 and DepEd Order No. 8, s. 2015.
            </p>
          )}

          {sf6Error && <Alert tone="error">{sf6Error}</Alert>}
          {sf6Result && (
            <Alert tone="success">
              <p>
                Saved to <code>{sf6Result.filePath}</code>.
              </p>
              <button type="button" aria-disabled={revealingSf6} onClick={handleRevealSf6}>
                {revealingSf6 ? "Opening…" : "Open folder"}
              </button>
              {revealSf6Error && <p role="alert">{revealSf6Error}</p>}
              <p>
                This file is a DepEd SF6 Summarized Report on Promotion and Level of Proficiency for
                school year{" "}
                <strong>
                  {sf6SchoolYear.trim() || availableSchoolYears[0] || "the selected school year"}
                </strong>
                . It consolidates:
              </p>
              <ul>
                <li>
                  <strong>Table 1:</strong> Summary of Promotion Decisions (Promoted, Conditional,
                  Retained) by section, grade level, and school total.
                </li>
                <li>
                  <strong>Table 2:</strong> Level of Proficiency distributions (Did Not Meet
                  Expectations to Outstanding) by section, grade level, and school total.
                </li>
              </ul>
              {sf6Result.disclosure.omittedFields.length > 0 && (
                <>
                  <p>
                    It does <strong>not</strong> include:
                  </p>
                  <ul>
                    {sf6Result.disclosure.omittedFields.map((omitted) => (
                      <li key={omitted.field}>
                        <strong>{omitted.field}</strong> — {omitted.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Alert>
          )}

          <form onSubmit={handleExportSf6} aria-label="Export SF6 School Promotion Summary">
            <div className="form-row" style={{ alignItems: "flex-end" }}>
              <div className="field">
                <label htmlFor="sf6-school-year">School year for SF6</label>
                {availableSchoolYears.length > 0 ? (
                  <select
                    id="sf6-school-year"
                    value={sf6SchoolYear || availableSchoolYears[0]}
                    onChange={(e) => setSf6SchoolYear(e.target.value)}
                    disabled={sf6Exporting}
                  >
                    {availableSchoolYears.map((sy) => (
                      <option key={sy} value={sy}>
                        {sy}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="sf6-school-year"
                    type="text"
                    placeholder="2025-2026"
                    value={sf6SchoolYear}
                    onChange={(e) => setSf6SchoolYear(e.target.value)}
                    disabled={sf6Exporting}
                    required
                  />
                )}
              </div>
              <button
                type="submit"
                className="button-primary"
                disabled={
                  sf6Exporting || (availableSchoolYears.length === 0 && !sf6SchoolYear.trim())
                }
              >
                {sf6Exporting ? "Exporting SF6…" : "Export SF6 (Promotion & Proficiency Summary)"}
              </button>
            </div>
          </form>
        </section>
      )}
    </section>
  );
}
