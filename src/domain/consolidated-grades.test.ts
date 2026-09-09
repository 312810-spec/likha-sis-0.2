import { describe, expect, it } from "vitest";
import {
  buildConsolidatedGradesMatrix,
  computeGeneralAverage,
  type ConsolidatedGradeEntry,
} from "./consolidated-grades";

describe("computeGeneralAverage", () => {
  it("averages term grades", () => {
    expect(computeGeneralAverage([90, 80, 100])).toBeCloseTo(90);
  });

  it("returns null for an empty list rather than NaN", () => {
    expect(computeGeneralAverage([])).toBeNull();
  });
});

describe("buildConsolidatedGradesMatrix", () => {
  const entries: ConsolidatedGradeEntry[] = [
    {
      learnerId: "l2",
      learnerName: "Beatriz Santos",
      subjectId: "math",
      subjectName: "Mathematics",
      gradingPeriodId: "q1",
      gradingPeriodLabel: "Quarter 1",
      termGrade: 88,
    },
    {
      learnerId: "l1",
      learnerName: "Andres Reyes",
      subjectId: "math",
      subjectName: "Mathematics",
      gradingPeriodId: "q1",
      gradingPeriodLabel: "Quarter 1",
      termGrade: 90,
    },
    {
      learnerId: "l1",
      learnerName: "Andres Reyes",
      subjectId: "science",
      subjectName: "Science",
      gradingPeriodId: "q1",
      gradingPeriodLabel: "Quarter 1",
      termGrade: 94,
    },
  ];

  it("collects distinct subjects and grading periods", () => {
    const matrix = buildConsolidatedGradesMatrix(entries);
    expect(matrix.subjects).toEqual([
      { subjectId: "math", subjectName: "Mathematics" },
      { subjectId: "science", subjectName: "Science" },
    ]);
    expect(matrix.gradingPeriods).toEqual([
      { gradingPeriodId: "q1", gradingPeriodLabel: "Quarter 1" },
    ]);
  });

  it("orders rows by learner name and nests grades by subject/period", () => {
    const matrix = buildConsolidatedGradesMatrix(entries);
    expect(matrix.rows.map((r) => r.learnerName)).toEqual(["Andres Reyes", "Beatriz Santos"]);
    expect(matrix.rows[0]?.gradesBySubject).toEqual({ math: { q1: 90 }, science: { q1: 94 } });
  });

  it("computes each row's general average across all its subjects", () => {
    const matrix = buildConsolidatedGradesMatrix(entries);
    const andres = matrix.rows.find((r) => r.learnerId === "l1");
    expect(andres?.generalAverage ?? undefined).toBeCloseTo(92);
  });

  it("returns an empty matrix for no entries", () => {
    const matrix = buildConsolidatedGradesMatrix([]);
    expect(matrix).toEqual({ subjects: [], gradingPeriods: [], rows: [] });
  });
});
