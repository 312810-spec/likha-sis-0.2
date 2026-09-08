import type { AwardEligibilityResult } from "./award-eligibility";

/**
 * Printable Academic Excellence certificate content model. Pure — no DOM,
 * no printing, no persistence. A UI screen renders this shape to a
 * print-friendly view; this module only decides *what* the certificate
 * says, never *whether* to award it (that is
 * `award-eligibility.ts`'s job).
 */
export interface CertificateContent {
  learnerName: string;
  schoolName: string;
  schoolYear: string;
  awardTitle: string;
  generalAverage: number;
  gaThresholdUsed: number;
  issuedOn: string;
  /** Always shown on the printed certificate and in any export of this
   * content: the eligibility engine's GA threshold is a configurable,
   * unverified-against-DepEd default, and the disciplinary-anecdotes leg
   * of the historical rule was never checked. Certificates must never be
   * printed without this disclosure. */
  eligibilityDisclosure: string;
}

const ELIGIBILITY_DISCLOSURE =
  "This award uses a school-configurable general-average threshold that has not been " +
  "verified against a primary DepEd source, and does not check disciplinary/anecdotal " +
  "records (no such feature exists yet in this system).";

export interface BuildCertificateInput {
  learnerName: string;
  schoolName: string;
  schoolYear: string;
  issuedOn: string;
  eligibility: AwardEligibilityResult;
  awardTitle?: string;
}

/** Throws if the learner is not eligible per `eligibility` — a certificate
 * is never generated for an ineligible learner even if a caller tries. */
export function buildAcademicExcellenceCertificate(
  input: BuildCertificateInput,
): CertificateContent {
  if (!input.eligibility.eligible) {
    throw new Error(
      `Cannot generate an Academic Excellence certificate for learner ${input.eligibility.learnerId}: not eligible per the configured rule.`,
    );
  }

  return {
    learnerName: input.learnerName,
    schoolName: input.schoolName,
    schoolYear: input.schoolYear,
    awardTitle: input.awardTitle ?? "Academic Excellence Award",
    generalAverage: input.eligibility.generalAverage,
    gaThresholdUsed: input.eligibility.gaThresholdUsed,
    issuedOn: input.issuedOn,
    eligibilityDisclosure: ELIGIBILITY_DISCLOSURE,
  };
}
