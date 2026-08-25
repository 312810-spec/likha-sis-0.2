import { useEffect, useRef, useState } from "react";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { ExportApplicationService } from "../application/export-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SectionApplicationService } from "../application/section-service";
import type { SubjectApplicationService } from "../application/subject-service";
import { ValidationError } from "../domain/errors";
import type { ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type { GradingPeriod } from "../domain/grading";
import type { Section } from "../domain/section";
import type { Subject } from "../domain/subject";
import { ClassRecordWorkspace } from "./ClassRecordWorkspace";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

/** A short "N items · X of Y recorded" readout for one class record's row
 * in the list -- lets a teacher tell at a glance which workspace still
 * needs setup (no items yet) versus which one simply isn't fully scored
 * yet, without opening each one. `Y` is `itemCount * totalEligible`, the
 * theoretical maximum `recordedCount` could reach once every item is
 * fully scored -- see `ClassRecordDetail`'s doc comment. */
function progressSummary(record: ClassRecordDetail): string {
  if (record.itemCount === 0) {
    return "No assessment items yet";
  }
  const possible = record.itemCount * record.totalEligible;
  return `${record.itemCount} item${record.itemCount === 1 ? "" : "s"} · ${record.recordedCount} of ${possible} recorded`;
}

interface ClassRecordsScreenProps {
  classRecordService: ClassRecordApplicationService;
  sectionService: SectionApplicationService;
  subjectService: SubjectApplicationService;
  gradingService: GradingApplicationService;
  assessmentService: AssessmentApplicationService;
  learnerScoreService: LearnerScoreApplicationService;
  exportService: ExportApplicationService;
}

export function ClassRecordsScreen({
  classRecordService,
  sectionService,
  subjectService,
  gradingService,
  assessmentService,
  learnerScoreService,
  exportService,
}: ClassRecordsScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [selectedClassRecordId, setSelectedClassRecordId] = useState<string | null>(null);
  const [classRecords, setClassRecords] = useState<ClassRecordDetail[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradingPeriodId, setGradingPeriodId] = useState("");
  const [periodsForSection, setPeriodsForSection] = useState<GradingPeriod[]>([]);
  const [weightPolicyId, setWeightPolicyId] = useState("");
  const [weightPolicies, setWeightPolicies] = useState<GradingWeightPolicy[]>([]);
  const [creating, setCreating] = useState(false);

  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      classRecordService.listClassRecords(),
      sectionService.listSections(),
      subjectService.listSubjects(),
      classRecordService.listGradingWeightPolicies(),
    ])
      .then(([records, sectionList, subjectList, policies]) => {
        if (cancelled) return;
        setClassRecords(records);
        setSections(sectionList);
        setSubjects(subjectList);
        setWeightPolicies(policies);
        if (sectionList[0]) setSectionId(sectionList[0].id);
        if (subjectList[0]) setSubjectId(subjectList[0].id);
        const defaultPolicy = policies.find((p) => p.isDefault) ?? policies[0];
        if (defaultPolicy) setWeightPolicyId(defaultPolicy.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load class records.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classRecordService, sectionService, subjectService]);

  useEffect(() => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    let cancelled = false;
    gradingService
      .listPeriodsBySchoolYear(section.schoolYear)
      .then((result) => {
        if (cancelled) return;
        setPeriodsForSection(result);
        if (result[0]) setGradingPeriodId(result[0].id);
        else setGradingPeriodId("");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load grading periods for this section's school year.");
      });
    return () => {
      cancelled = true;
    };
  }, [gradingService, sectionId, sections]);

  function handleSectionChange(value: string) {
    setError(null);
    setSectionId(value);
  }

  async function handleAddSubject() {
    setError(null);
    setConfirmation(null);
    setAddingSubject(true);
    try {
      const created = await subjectService.createSubject(newSubjectName);
      setSubjects((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSubjectId(created.id);
      setNewSubjectName("");
      setConfirmation(`${created.name} added.`);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not add this subject.");
    } finally {
      setAddingSubject(false);
    }
  }

  async function handleCreateClassRecord() {
    setError(null);
    setConfirmation(null);
    setCreating(true);
    try {
      const created = await classRecordService.createClassRecord(
        sectionId,
        subjectId,
        gradingPeriodId,
        weightPolicyId,
      );
      if (created === null) {
        setError(
          "Could not open this class record — check that the section, subject, grading period, and grading weighting all belong to your school and share the same school year.",
        );
      } else {
        const records = await classRecordService.listClassRecords();
        setClassRecords(records);
        setConfirmation("Class record opened.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not open this class record.");
    } finally {
      setCreating(false);
    }
  }

  if (selectedClassRecordId) {
    const selectedRecord = classRecords.find((r) => r.id === selectedClassRecordId);
    return (
      <>
        <button type="button" onClick={() => setSelectedClassRecordId(null)}>
          Back to Class Records
        </button>
        {selectedRecord && (
          <p className="field-hint">
            <strong>{selectedRecord.sectionName}</strong> — {selectedRecord.subjectName} —{" "}
            {selectedRecord.gradingPeriodLabel} ({selectedRecord.schoolYear}) — weighting:{" "}
            {selectedRecord.weightPolicyName}
          </p>
        )}
        <ClassRecordWorkspace
          classRecordId={selectedClassRecordId}
          weightPolicyName={selectedRecord?.weightPolicyName ?? null}
          assessmentService={assessmentService}
          learnerScoreService={learnerScoreService}
          exportService={exportService}
        />
      </>
    );
  }

  return (
    <section aria-label="Class Records">
      <h2 ref={headingRef} tabIndex={-1}>
        Class Records
      </h2>

      {mode === "guided" && (
        <p className="field-hint">
          A class record is the workspace for one section, one subject, and one grading period. Open
          one here, then use it to record scores.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      <div className="form-row">
        <div className="field">
          <label htmlFor="class-record-section">Section</label>
          <select
            id="class-record-section"
            value={sectionId}
            onChange={(event) => handleSectionChange(event.target.value)}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name} — Grade {section.gradeLevel} ({section.schoolYear})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="class-record-subject">Subject</label>
          <select
            id="class-record-subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="class-record-period">Grading period</label>
          <select
            id="class-record-period"
            value={gradingPeriodId}
            onChange={(event) => setGradingPeriodId(event.target.value)}
            disabled={periodsForSection.length === 0}
          >
            {periodsForSection.length === 0 && <option value="">No grading periods yet</option>}
            {periodsForSection.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="class-record-weight-policy">DepEd grading weighting</label>
          <select
            id="class-record-weight-policy"
            value={weightPolicyId}
            onChange={(event) => setWeightPolicyId(event.target.value)}
          >
            {weightPolicies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "guided" && (
        <p className="field-hint">
          Pick the DepEd weighting that matches this subject — most subjects use the core weighting;
          EPP/TLE and MAPEH use a different one. This choice is not guessed for you, since a wrong
          pick would compute the wrong grade.
        </p>
      )}

      <button
        type="button"
        disabled={creating || !sectionId || !subjectId || !gradingPeriodId || !weightPolicyId}
        onClick={handleCreateClassRecord}
      >
        {creating ? "Opening…" : "Open class record"}
      </button>

      <div className="form-row">
        <div className="field">
          <label htmlFor="new-subject-name">Add a subject</label>
          <input
            id="new-subject-name"
            type="text"
            placeholder="e.g. Mathematics"
            value={newSubjectName}
            onChange={(event) => setNewSubjectName(event.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={addingSubject || newSubjectName.trim().length === 0}
          onClick={handleAddSubject}
        >
          {addingSubject ? "Adding…" : "Add subject"}
        </button>
      </div>

      {loading ? (
        <Loading label="Loading class records…" />
      ) : classRecords.length === 0 ? (
        <EmptyState>No class records opened yet. Open one above.</EmptyState>
      ) : (
        <table className="attendance-roster">
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col">Subject</th>
              <th scope="col">Grading period</th>
              <th scope="col">School year</th>
              <th scope="col">Weighting</th>
              <th scope="col">Progress</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {classRecords.map((record) => (
              <tr key={record.id}>
                <td>{record.sectionName}</td>
                <td>{record.subjectName}</td>
                <td>{record.gradingPeriodLabel}</td>
                <td>{record.schoolYear}</td>
                <td>{record.weightPolicyName}</td>
                <td>{progressSummary(record)}</td>
                <td>
                  <button type="button" onClick={() => setSelectedClassRecordId(record.id)}>
                    Open workspace
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
