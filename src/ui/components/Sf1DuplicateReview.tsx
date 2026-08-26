import { useState } from "react";
import type { DuplicateDecision, LearnerMatchResult, Sf1ImportRow } from "../../domain/sf1-import";
import { useTeacherMode } from "../theme/useTeacherMode";
import { StatusChip } from "./StatusChip";

interface Sf1DuplicateReviewProps {
  match: LearnerMatchResult;
  row: Sf1ImportRow | undefined;
  resolvedCount: number;
  totalCount: number;
  onDecide: (decision: DuplicateDecision) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

type FieldComparison = "same" | "different" | "missingFromSf1" | "missingFromLikha" | "notStored";

function compareText(sf1Value: string | null, likhaValue: string | null): FieldComparison {
  const a = sf1Value?.trim().toLowerCase() ?? "";
  const b = likhaValue?.trim().toLowerCase() ?? "";
  if (a.length === 0 && b.length === 0) return "same";
  if (a.length === 0) return "missingFromSf1";
  if (b.length === 0) return "missingFromLikha";
  return a === b ? "same" : "different";
}

const COMPARISON_LABEL: Record<FieldComparison, string> = {
  same: "Same",
  different: "Different",
  missingFromSf1: "Missing from SF1",
  missingFromLikha: "Missing from LIKHA",
  notStored: "Not stored in LIKHA",
};

const COMPARISON_TONE: Record<FieldComparison, "success" | "warning" | "neutral"> = {
  same: "success",
  different: "warning",
  missingFromSf1: "neutral",
  missingFromLikha: "neutral",
  notStored: "neutral",
};

/**
 * The primary Wave 2C UX surface (ADR-0043): a side-by-side comparison
 * for one `SuspectedDuplicate` row against a candidate learner. Every
 * field shown here comes from the already-computed preview — this
 * component never re-runs or second-guesses Wave 2B's matching rules,
 * it only presents them and records the teacher's decision. Never
 * offers a merge option (see ADR-0043's Decision 4).
 *
 * `match.candidates` can legitimately hold more than one plausible
 * existing learner — `learner::find_candidates` has no row limit and
 * matches on LRN-or-name, so two same-named learners in one school both
 * come back (independent-review finding, Wave 2C). This component
 * therefore always shows how many candidates were found and lets the
 * teacher choose which one they're comparing against before deciding —
 * it never silently binds the decision to whichever candidate happened
 * to come back first.
 *
 * The caller should render this with `key={match.rowNumber}` (see
 * `Sf1ImportScreen.tsx`) so the selected candidate resets when the
 * active row changes.
 */
export function Sf1DuplicateReview({
  match,
  row,
  resolvedCount,
  totalCount,
  onDecide,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: Sf1DuplicateReviewProps) {
  const { mode } = useTeacherMode();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const candidate = match.candidates[selectedIndex];

  if (!row || !candidate) return null;

  const fields: Array<{
    label: string;
    sf1Value: string;
    likhaValue: string;
    comparison: FieldComparison;
  }> = [
    {
      label: "LRN",
      sf1Value: row.lrn ?? "—",
      likhaValue: candidate.lrn ?? "—",
      comparison: compareText(row.lrn, candidate.lrn),
    },
    {
      label: "Family name",
      sf1Value: row.familyName ?? "—",
      likhaValue: candidate.familyName,
      comparison: compareText(row.familyName, candidate.familyName),
    },
    {
      label: "Given name",
      sf1Value: row.givenName ?? "—",
      likhaValue: candidate.givenName,
      comparison: compareText(row.givenName, candidate.givenName),
    },
    {
      label: "Sex",
      sf1Value: row.sex ?? "—",
      likhaValue: candidate.sex ?? "—",
      comparison: compareText(row.sex, candidate.sex),
    },
    {
      label: "Birth date",
      sf1Value: row.birthdate ?? "—",
      likhaValue: "Not stored in LIKHA",
      comparison: "notStored",
    },
  ];

  return (
    <div className="sf1-duplicate-review" aria-label={`Review row ${match.rowNumber}`}>
      <div className="sf1-review-progress">
        <StatusChip tone="warning">Needs your review</StatusChip>
        <span role="status">
          {resolvedCount} of {totalCount} reviewed
        </span>
        <span>
          <button type="button" onClick={onPrevious} disabled={!hasPrevious}>
            Previous conflict
          </button>{" "}
          <button type="button" onClick={onNext} disabled={!hasNext}>
            Next conflict
          </button>
        </span>
      </div>

      <p>
        {match.reason ??
          "LIKHA found similar learner information and needs you to confirm whether these are the same person."}
      </p>
      <p className="field-hint">
        LIKHA never merges or overwrites records automatically — nothing is saved until you decide,
        and you can change your answer any time before you import.
      </p>
      {mode === "guided" && (
        <p className="field-hint">
          Compare the two records below field by field, then tell LIKHA whether this is the same
          learner or a different one. If you're not sure, it's always safe to choose "These are
          different learners" — LIKHA will simply add a new record, which you (or a Registrar) can
          review later.
        </p>
      )}

      {match.candidates.length > 1 && (
        <div role="group" aria-label="Possible matches found">
          <p>
            {match.candidates.length} possible matches found. Comparing against:{" "}
            <strong>
              {candidate.givenName} {candidate.familyName}
            </strong>
            .
          </p>
          <div className="sf1-review-actions">
            {match.candidates.map((option, index) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={index === selectedIndex}
                onClick={() => setSelectedIndex(index)}
              >
                {option.givenName} {option.familyName}
                {option.lrn ? ` (LRN ${option.lrn})` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <table className="sf1-comparison-table">
        <caption className="visually-hidden">
          Comparing row {match.rowNumber} from your SF1 with an existing LIKHA learner record
        </caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">From your SF1</th>
            <th scope="col">Already in LIKHA</th>
            <th scope="col">Comparison</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.label}>
              <th scope="row">{field.label}</th>
              <td>{field.sf1Value}</td>
              <td>{field.likhaValue}</td>
              <td>
                <StatusChip tone={COMPARISON_TONE[field.comparison]}>
                  {COMPARISON_LABEL[field.comparison]}
                </StatusChip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sf1-review-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => onDecide({ type: "useExisting", learnerId: candidate.id })}
        >
          This is the same learner
        </button>
        <button type="button" onClick={() => onDecide({ type: "createSeparate" })}>
          These are different learners
        </button>
      </div>
    </div>
  );
}
