import { useEffect, useState } from "react";
import type { AnecdotalRecordApplicationService } from "../application/anecdotal-record-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SectionApplicationService } from "../application/section-service";
import {
  evaluateAcademicExcellenceEligibility,
  type AwardEligibilityResult,
} from "../domain/award-eligibility";
import { buildAcademicExcellenceCertificate, type CertificateContent } from "../domain/certificate";
import type { ClassRecordDetail } from "../domain/class-record";
import type { Section, SectionRosterMember } from "../domain/section";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface CertificateAwardScreenProps {
  sectionService: SectionApplicationService;
  classRecordService: ClassRecordApplicationService;
  learnerScoreService: LearnerScoreApplicationService;
  /** Batch 13, ADR-0084: the real anecdote-check the eligibility loop
   * calls before evaluating `award-eligibility.ts`'s pure function --
   * only its read-only `hasDisqualifyingRecordForLearner` method is used
   * here, gated identically to every other anecdotal-record read/write
   * (`authorize_child_protection_access_for_section`; no weaker gate
   * exists for this sensitive data). */
  anecdotalRecordService: AnecdotalRecordApplicationService;
  schoolName: string;
}

interface LearnerEligibility {
  member: SectionRosterMember;
  result: AwardEligibilityResult;
  subjectsGraded: number;
  subjectsInPeriod: number;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Loops a section roster through `computeTermGrade` for every subject's
 * class record in one grading period, then `award-eligibility.ts`'s
 * evaluator. Deliberately does not average an incomplete set silently
 * against a full-load expectation — `subjectsGraded`/`subjectsInPeriod`
 * are surfaced so a teacher can see when a general average was computed
 * from fewer subjects than exist for the period (e.g. some class records
 * not yet scored).
 */
export function CertificateAwardScreen({
  sectionService,
  classRecordService,
  learnerScoreService,
  anecdotalRecordService,
  schoolName,
}: CertificateAwardScreenProps) {
  const { mode } = useTeacherMode();
  const [sections, setSections] = useState<Section[]>([]);
  const [classRecords, setClassRecords] = useState<ClassRecordDetail[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [gradingPeriodId, setGradingPeriodId] = useState("");
  const [roster, setRoster] = useState<SectionRosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<LearnerEligibility[]>([]);
  const [previewLearnerId, setPreviewLearnerId] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<CertificateContent | null>(null);

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

  const section = sections.find((s) => s.id === sectionId) ?? null;
  const classRecordsForSection = classRecords.filter((cr) => cr.sectionId === sectionId);
  const gradingPeriods = Array.from(
    new Map(
      classRecordsForSection.map((cr) => [cr.gradingPeriodId, cr.gradingPeriodLabel] as const),
    ).entries(),
  );

  // Derived, not effect-driven state: the select's effective value falls
  // back to the first available grading period whenever the teacher
  // hasn't explicitly chosen one for the current section yet, without a
  // setState-in-effect render cascade.
  const effectiveGradingPeriodId =
    gradingPeriodId && gradingPeriods.some(([id]) => id === gradingPeriodId)
      ? gradingPeriodId
      : (gradingPeriods[0]?.[0] ?? "");

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;
    sectionService
      .roster(sectionId, todayAsIsoDate())
      .then((result) => {
        if (!cancelled) setRoster(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the section roster.");
      });
    return () => {
      cancelled = true;
    };
  }, [sectionService, sectionId]);

  async function handleCompute() {
    if (!sectionId || !effectiveGradingPeriodId) return;
    setError(null);
    setComputing(true);
    setEligibility([]);
    const recordsInPeriod = classRecordsForSection.filter(
      (cr) => cr.gradingPeriodId === effectiveGradingPeriodId,
    );
    const asOfDate = todayAsIsoDate();
    try {
      const results: LearnerEligibility[] = [];
      for (const member of roster) {
        const grades: number[] = [];
        for (const record of recordsInPeriod) {
          const computed = await learnerScoreService.computeTermGrade(record.id, member.learnerId);
          if (computed) grades.push(computed.termGrade);
        }
        const generalAverage =
          grades.length > 0 ? grades.reduce((sum, g) => sum + g, 0) / grades.length : 0;
        const hasDisqualifyingAnecdotalRecord =
          await anecdotalRecordService.hasDisqualifyingRecordForLearner(
            sectionId,
            member.learnerId,
            asOfDate,
          );
        const result = evaluateAcademicExcellenceEligibility({
          learnerId: member.learnerId,
          generalAverage,
          subjectGrades: grades,
          hasDisqualifyingAnecdotalRecord,
        });
        results.push({
          member,
          result,
          subjectsGraded: grades.length,
          subjectsInPeriod: recordsInPeriod.length,
        });
      }
      setEligibility(results);
    } catch {
      setError("Could not compute award eligibility for this section.");
    } finally {
      setComputing(false);
    }
  }

  function openCertificate(entry: LearnerEligibility) {
    if (!section) return;
    const content = buildAcademicExcellenceCertificate({
      learnerName: `${entry.member.givenName} ${entry.member.familyName}`,
      schoolName,
      schoolYear: section.schoolYear,
      issuedOn: todayAsIsoDate(),
      eligibility: entry.result,
    });
    setCertificate(content);
    setPreviewLearnerId(entry.member.learnerId);
  }

  function closeCertificate() {
    setCertificate(null);
    setPreviewLearnerId(null);
  }

  if (certificate && previewLearnerId) {
    return (
      <Page
        title="Academic Excellence Certificate"
        actions={
          <>
            <button type="button" onClick={() => window.print()}>
              Print
            </button>
            <button type="button" onClick={closeCertificate}>
              Back to list
            </button>
          </>
        }
      >
        <div className="certificate-printable">
          <p className="certificate-eyebrow">Certificate of Recognition</p>
          <h3 className="certificate-title">{certificate.awardTitle}</h3>
          <p className="certificate-body">is presented to</p>
          <p className="certificate-learner-name">{certificate.learnerName}</p>
          <p className="certificate-body">
            of {certificate.schoolName}, for achieving a general average of{" "}
            {certificate.generalAverage.toFixed(2)} (threshold: {certificate.gaThresholdUsed}) for
            School Year {certificate.schoolYear}.
          </p>
          <p className="certificate-issued-on">Issued on {certificate.issuedOn}</p>
          <Alert tone="warning">{certificate.eligibilityDisclosure}</Alert>
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Certificates &amp; Awards"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Pick a section and grading period, then compute eligibility for the Academic Excellence
            Award. Read the disclosure below before issuing any certificate.
          </p>
        ) : undefined
      }
    >
      <Alert tone="warning">
        This award uses a school-configurable general-average threshold and a
        disciplinary/anecdotal-record disqualification rule (any &quot;negative&quot;-category
        guidance record excludes a learner, regardless of severity) that have not been verified
        against a primary DepEd source.
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Loading label="Loading sections…" />
      ) : sections.length === 0 ? (
        <EmptyState>No sections exist yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="certificate-section">Section</label>
              <select
                id="certificate-section"
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value);
                  setGradingPeriodId("");
                  setEligibility([]);
                }}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gradeLevel}, {s.schoolYear})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="certificate-grading-period">Grading period</label>
              <select
                id="certificate-grading-period"
                value={effectiveGradingPeriodId}
                onChange={(event) => setGradingPeriodId(event.target.value)}
                disabled={gradingPeriods.length === 0}
              >
                {gradingPeriods.length === 0 && <option value="">No class records yet</option>}
                {gradingPeriods.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCompute}
              aria-disabled={
                computing || !sectionId || !effectiveGradingPeriodId || roster.length === 0
              }
            >
              {computing ? "Computing…" : "Compute eligibility"}
            </button>
          </div>

          {eligibility.length === 0 ? (
            <EmptyState>
              Compute eligibility to see which learners in this section qualify for the Academic
              Excellence Award this grading period.
            </EmptyState>
          ) : (
            <table className="attendance-roster">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">General average</th>
                  <th scope="col">Subjects graded</th>
                  <th scope="col">Eligible</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {eligibility.map((entry) => (
                  <tr key={entry.member.learnerId}>
                    <th scope="row">
                      {entry.member.givenName} {entry.member.familyName}
                    </th>
                    <td>{entry.result.generalAverage.toFixed(2)}</td>
                    <td>
                      {entry.subjectsGraded} of {entry.subjectsInPeriod}
                    </td>
                    <td>{entry.result.eligible ? "Eligible" : entry.result.reasons.join(" ")}</td>
                    <td>
                      {entry.result.eligible ? (
                        <button type="button" onClick={() => openCertificate(entry)}>
                          Print certificate
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Page>
  );
}
