import { describe, expect, it } from "vitest";
import { evaluateAcademicExcellenceEligibility } from "./award-eligibility";
import { buildAcademicExcellenceCertificate } from "./certificate";

describe("buildAcademicExcellenceCertificate", () => {
  it("builds certificate content for an eligible learner, always including the disclosure", () => {
    const eligibility = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 93,
      subjectGrades: [90, 95],
    });

    const certificate = buildAcademicExcellenceCertificate({
      learnerName: "Juan Dela Cruz",
      schoolName: "Sample Elementary School",
      schoolYear: "2025-2026",
      issuedOn: "2026-03-31",
      eligibility,
    });

    expect(certificate.learnerName).toBe("Juan Dela Cruz");
    expect(certificate.awardTitle).toBe("Academic Excellence Award");
    expect(certificate.generalAverage).toBe(93);
    expect(certificate.eligibilityDisclosure).toMatch(/not been\s+verified/);
    expect(certificate.eligibilityDisclosure).toMatch(/disciplinary/);
  });

  it("refuses to build a certificate for an ineligible learner", () => {
    const eligibility = evaluateAcademicExcellenceEligibility({
      learnerId: "l2",
      generalAverage: 70,
      subjectGrades: [70],
    });

    expect(() =>
      buildAcademicExcellenceCertificate({
        learnerName: "Maria Santos",
        schoolName: "Sample Elementary School",
        schoolYear: "2025-2026",
        issuedOn: "2026-03-31",
        eligibility,
      }),
    ).toThrow(/not eligible/);
  });

  it("allows a custom award title", () => {
    const eligibility = evaluateAcademicExcellenceEligibility({
      learnerId: "l1",
      generalAverage: 93,
      subjectGrades: [90],
    });

    const certificate = buildAcademicExcellenceCertificate({
      learnerName: "Juan Dela Cruz",
      schoolName: "Sample Elementary School",
      schoolYear: "2025-2026",
      issuedOn: "2026-03-31",
      eligibility,
      awardTitle: "With Highest Honors",
    });

    expect(certificate.awardTitle).toBe("With Highest Honors");
  });
});
