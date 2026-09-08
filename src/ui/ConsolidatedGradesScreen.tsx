import { useEffect, useState } from "react";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SectionApplicationService } from "../application/section-service";
import type { ClassRecordDetail } from "../domain/class-record";
import {
  buildConsolidatedGradesMatrix,
  type ConsolidatedGradeEntry,
  type ConsolidatedGradesMatrix,
} from "../domain/consolidated-grades";
import type { Section, SectionRosterMember } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ConsolidatedGradesScreenProps {
  sectionService: SectionApplicationService;
  classRecordService: ClassRecordApplicationService;
  learnerScoreService: LearnerScoreApplicationService;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Section x subject x term Consolidated Grades Matrix -- loops the
 * section roster through `computeTermGrade` for every class record in
 * the section (every subject, every grading period already set up), then
 * reshapes the results via `domain/consolidated-grades.ts`. Read-only:
 * nothing here writes a grade.
 */
export function ConsolidatedGradesScreen({
  sectionService,
  classRecordService,
  learnerScoreService,
}: ConsolidatedGradesScreenProps) {
  const { mode } = useTeacherMode();
  const [sections, setSections] = useState<Section[]>([]);
  const [classRecords, setClassRecords] = useState<ClassRecordDetail[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<ConsolidatedGradesMatrix | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([sectionService.listSections(), classRecordService.listClassRecords()])
      .then(([sectionResult, classRecordResult]) => {
        if (cancelled) return;
        setSections(sectionResult);
        setClassRecords(classRecordResult);
        if (sectionResult.length > 0 && !sectionId) setSectionId(sectionResult[0]!.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load sections and class records.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [sectionService, classRecordService]);

  const classRecordsForSection = classRecords.filter((cr) => cr.sectionId === sectionId);

  async function handleBuild() {
    if (!sectionId) return;
    setError(null);
    setComputing(true);
    setMatrix(null);
    try {
      const roster: SectionRosterMember[] = await sectionService.roster(
        sectionId,
        todayAsIsoDate(),
      );
      const entries: ConsolidatedGradeEntry[] = [];
      for (const member of roster) {
        for (const record of classRecordsForSection) {
          const computed = await learnerScoreService.computeTermGrade(record.id, member.learnerId);
          if (!computed) continue;
          entries.push({
            learnerId: member.learnerId,
            learnerName: `${member.givenName} ${member.familyName}`,
            subjectId: record.subjectId,
            subjectName: record.subjectName,
            gradingPeriodId: record.gradingPeriodId,
            gradingPeriodLabel: record.gradingPeriodLabel,
            termGrade: computed.termGrade,
          });
        }
      }
      setMatrix(buildConsolidatedGradesMatrix(entries));
    } catch {
      setError("Could not build the consolidated grades matrix for this section.");
    } finally {
      setComputing(false);
    }
  }

  return (
    <Page
      title="Consolidated Grades Matrix"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Pick a section, then build the matrix to see every learner's grade across every subject
            and grading period recorded so far.
          </p>
        ) : undefined
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <EmptyState>No sections exist yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="consolidated-grades-section">Section</label>
              <select
                id="consolidated-grades-section"
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value);
                  setMatrix(null);
                }}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gradeLevel}, {s.schoolYear})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleBuild}
              aria-disabled={computing || !sectionId || classRecordsForSection.length === 0}
            >
              {computing ? "Building…" : "Build matrix"}
            </button>
          </div>

          {classRecordsForSection.length === 0 && (
            <EmptyState>This section has no class records set up yet.</EmptyState>
          )}

          {matrix &&
            (matrix.rows.length === 0 ? (
              <EmptyState>No grades computed for this section yet.</EmptyState>
            ) : (
              <div className="consolidated-grades-scroll">
                <table className="consolidated-grades-matrix">
                  <thead>
                    <tr>
                      <th scope="col" rowSpan={2}>
                        Learner
                      </th>
                      {matrix.subjects.map((subject) => (
                        <th
                          key={subject.subjectId}
                          scope="colgroup"
                          colSpan={matrix.gradingPeriods.length}
                        >
                          {subject.subjectName}
                        </th>
                      ))}
                      <th scope="col" rowSpan={2}>
                        General average
                      </th>
                    </tr>
                    <tr>
                      {matrix.subjects.flatMap((subject) =>
                        matrix.gradingPeriods.map((period) => (
                          <th key={`${subject.subjectId}-${period.gradingPeriodId}`} scope="col">
                            {period.gradingPeriodLabel}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.learnerId}>
                        <th scope="row">{row.learnerName}</th>
                        {matrix.subjects.flatMap((subject) =>
                          matrix.gradingPeriods.map((period) => {
                            const grade =
                              row.gradesBySubject[subject.subjectId]?.[period.gradingPeriodId];
                            return (
                              <td key={`${subject.subjectId}-${period.gradingPeriodId}`}>
                                {grade === undefined ? "—" : grade.toFixed(2)}
                              </td>
                            );
                          }),
                        )}
                        <td>{row.generalAverage === null ? "—" : row.generalAverage.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </>
      )}
    </Page>
  );
}
