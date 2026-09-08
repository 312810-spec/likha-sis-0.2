import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNVERIFIED_GA_THRESHOLD,
  DEFAULT_UNVERIFIED_MIN_SUBJECT_GRADE,
  evaluateAcademicExcellenceEligibility,
} from "./award-eligibility";

describe("evaluateAcademicExcellenceEligibility", () => {
  it("is eligible when GA meets the default threshold and no subject is below the floor", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 92,
      subjectGrades: [90, 92, 95, 88],
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.gaThresholdUsed).toBe(DEFAULT_UNVERIFIED_GA_THRESHOLD);
    expect(result.minSubjectGradeUsed).toBe(DEFAULT_UNVERIFIED_MIN_SUBJECT_GRADE);
  });

  it("is not eligible when GA is below threshold", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 89.9,
      subjectGrades: [95, 95, 95],
    });

    expect(result.eligible).toBe(false);
    expect(result.meetsGaThreshold).toBe(false);
    expect(result.reasons).toHaveLength(1);
  });

  it("is not eligible when a subject grade is below the floor even if GA passes", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 91,
      subjectGrades: [95, 95, 79],
    });

    expect(result.eligible).toBe(false);
    expect(result.meetsMinSubjectGrade).toBe(false);
    expect(result.lowestSubjectGrade).toBe(79);
  });

  it("reports both failure reasons when both legs fail", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 85,
      subjectGrades: [70, 90],
    });

    expect(result.reasons).toHaveLength(2);
  });

  it("respects an explicit school-configured threshold override", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 88,
      subjectGrades: [85, 90],
      gaThreshold: 85,
      minSubjectGrade: 80,
    });

    expect(result.eligible).toBe(true);
    expect(result.gaThresholdUsed).toBe(85);
  });

  it("treats an empty subject-grades list as vacuously meeting the floor", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [],
    });

    expect(result.meetsMinSubjectGrade).toBe(true);
    expect(result.lowestSubjectGrade).toBeNull();
  });

  it("always reports anecdotalRecordsChecked as false — no Anecdotal Records feature exists", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [95],
    });

    expect(result.anecdotalRecordsChecked).toBe(false);
  });
});
