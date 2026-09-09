/**
 * Consolidated Grades Matrix — pure, read-only aggregation over
 * already-computed grades. This module creates NO new source of truth:
 * every input entry is expected to come from an existing
 * `ComputedTermGrade` (via `LearnerScoreApplicationService.computeTermGrade`,
 * one call per class record + learner, exactly as `export-service.ts`'s
 * Rust counterpart already does for SF9/SF10 exports) — this just
 * reshapes an array of those into a section x subject x term matrix a
 * screen can render, plus the general-average helper the award-
 * eligibility engine consumes.
 */

export interface ConsolidatedGradeEntry {
  learnerId: string;
  learnerName: string;
  subjectId: string;
  subjectName: string;
  gradingPeriodId: string;
  gradingPeriodLabel: string;
  termGrade: number;
}

/** @public — only consumed structurally, via `ConsolidatedGradesMatrix.rows`. */
export interface ConsolidatedGradesRow {
  learnerId: string;
  learnerName: string;
  /** subjectId -> (gradingPeriodId -> termGrade) */
  gradesBySubject: Record<string, Record<string, number>>;
  generalAverage: number | null;
}

export interface ConsolidatedGradesMatrix {
  subjects: Array<{ subjectId: string; subjectName: string }>;
  gradingPeriods: Array<{ gradingPeriodId: string; gradingPeriodLabel: string }>;
  rows: ConsolidatedGradesRow[];
}

/** The arithmetic mean of the given term grades, or `null` when there is
 * nothing to average (an empty roster's learner, or a learner with no
 * recorded grade in any subject/period yet). */
export function computeGeneralAverage(termGrades: readonly number[]): number | null {
  if (termGrades.length === 0) return null;
  return termGrades.reduce((sum, g) => sum + g, 0) / termGrades.length;
}

export function buildConsolidatedGradesMatrix(
  entries: readonly ConsolidatedGradeEntry[],
): ConsolidatedGradesMatrix {
  const subjectsById = new Map<string, string>();
  const periodsById = new Map<string, string>();
  const rowsByLearner = new Map<
    string,
    { learnerName: string; gradesBySubject: Record<string, Record<string, number>> }
  >();

  for (const entry of entries) {
    subjectsById.set(entry.subjectId, entry.subjectName);
    periodsById.set(entry.gradingPeriodId, entry.gradingPeriodLabel);

    let row = rowsByLearner.get(entry.learnerId);
    if (!row) {
      row = { learnerName: entry.learnerName, gradesBySubject: {} };
      rowsByLearner.set(entry.learnerId, row);
    }
    const bySubject = (row.gradesBySubject[entry.subjectId] ??= {});
    bySubject[entry.gradingPeriodId] = entry.termGrade;
  }

  const rows: ConsolidatedGradesRow[] = Array.from(rowsByLearner.entries()).map(
    ([learnerId, row]) => {
      const allGrades = Object.values(row.gradesBySubject).flatMap((byPeriod) =>
        Object.values(byPeriod),
      );
      return {
        learnerId,
        learnerName: row.learnerName,
        gradesBySubject: row.gradesBySubject,
        generalAverage: computeGeneralAverage(allGrades),
      };
    },
  );
  // Stable, predictable order for a printable/exportable matrix.
  rows.sort((a, b) => a.learnerName.localeCompare(b.learnerName));

  return {
    subjects: Array.from(subjectsById.entries()).map(([subjectId, subjectName]) => ({
      subjectId,
      subjectName,
    })),
    gradingPeriods: Array.from(periodsById.entries()).map(
      ([gradingPeriodId, gradingPeriodLabel]) => ({ gradingPeriodId, gradingPeriodLabel }),
    ),
    rows,
  };
}
