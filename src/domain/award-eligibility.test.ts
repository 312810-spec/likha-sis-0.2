import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNVERIFIED_GA_THRESHOLD,
  DEFAULT_UNVERIFIED_MIN_SUBJECT_GRADE,
  evaluateAcademicExcellenceEligibility,
} from "./award-eligibility";

describe("evaluateAcademicExcellenceEligibility", () => {
  it("is eligible when GA meets the default threshold, no subject is below the floor, and there is no disqualifying anecdote", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 92,
      subjectGrades: [90, 92, 95, 88],
      hasDisqualifyingAnecdotalRecord: false,
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
      hasDisqualifyingAnecdotalRecord: false,
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
      hasDisqualifyingAnecdotalRecord: false,
    });

    expect(result.eligible).toBe(false);
    expect(result.meetsMinSubjectGrade).toBe(false);
    expect(result.lowestSubjectGrade).toBe(79);
  });

  it("reports both failure reasons when both grade legs fail", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 85,
      subjectGrades: [70, 90],
      hasDisqualifyingAnecdotalRecord: false,
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
      hasDisqualifyingAnecdotalRecord: false,
    });

    expect(result.eligible).toBe(true);
    expect(result.gaThresholdUsed).toBe(85);
  });

  it("treats an empty subject-grades list as vacuously meeting the floor", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [],
      hasDisqualifyingAnecdotalRecord: false,
    });

    expect(result.meetsMinSubjectGrade).toBe(true);
    expect(result.lowestSubjectGrade).toBeNull();
  });

  it("always reports anecdotalRecordsChecked as true — the check now runs against real data (Batch 13)", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [95],
      hasDisqualifyingAnecdotalRecord: false,
    });

    expect(result.anecdotalRecordsChecked).toBe(true);
  });

  it("is eligible when the learner has no anecdotal records at all", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [95, 96],
      hasDisqualifyingAnecdotalRecord: false,
    });

    expect(result.eligible).toBe(true);
    expect(result.hasDisqualifyingAnecdotalRecord).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("excludes a learner who otherwise meets both grade legs but has a disqualifying-category anecdote", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [95, 96],
      hasDisqualifyingAnecdotalRecord: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.hasDisqualifyingAnecdotalRecord).toBe(true);
    expect(result.reasons).toEqual([expect.stringMatching(/disqualifying category/)]);
  });

  it("is still eligible when the learner has only positive/neutral anecdotes (caller resolves this to false)", () => {
    // A caller checks only DISQUALIFYING_ANECDOTAL_CATEGORIES (currently
    // just "negative") before calling this function, so a learner with
    // only positive/neutral records arrives here with `false` — proving
    // this leg does not disqualify on the mere presence of any anecdotal
    // record, only a disqualifying-category one.
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 95,
      subjectGrades: [95, 96],
      hasDisqualifyingAnecdotalRecord: false,
    });

    expect(result.eligible).toBe(true);
  });

  it("reports every failing leg together when grades fail and an anecdote also disqualifies", () => {
    const result = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 70,
      subjectGrades: [70],
      hasDisqualifyingAnecdotalRecord: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });
});
