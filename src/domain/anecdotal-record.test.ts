import { describe, expect, it } from "vitest";
import {
  ANECDOTAL_CATEGORIES,
  AnecdotalRecordValidationError,
  DISQUALIFYING_ANECDOTAL_CATEGORIES,
  isDisqualifyingAnecdotalCategory,
  validateAnecdotalRecordFollowupInput,
  validateAnecdotalRecordInput,
  type AnecdotalRecordFollowupInput,
  type AnecdotalRecordInput,
} from "./anecdotal-record";

const VALID_RECORD_INPUT: AnecdotalRecordInput = {
  learnerId: "l1",
  sectionId: "sec1",
  category: "positive",
  entryDate: "2026-09-01",
  narrative: "Helped a classmate with a reading exercise.",
};

const VALID_FOLLOWUP_INPUT: AnecdotalRecordFollowupInput = {
  anecdotalRecordId: "ar1",
  sectionId: "sec1",
  asOfDate: "2026-09-01",
  note: "Brief check-in the following week.",
};

describe("validateAnecdotalRecordInput", () => {
  it("trims and forwards a valid input", () => {
    const result = validateAnecdotalRecordInput({
      ...VALID_RECORD_INPUT,
      narrative: "  Helped a classmate.  ",
    });

    expect(result.narrative).toBe("Helped a classmate.");
    expect(result.category).toBe("positive");
  });

  it("rejects a blank learner id", () => {
    expect(() => validateAnecdotalRecordInput({ ...VALID_RECORD_INPUT, learnerId: "  " })).toThrow(
      AnecdotalRecordValidationError,
    );
  });

  it("rejects a blank section id", () => {
    expect(() => validateAnecdotalRecordInput({ ...VALID_RECORD_INPUT, sectionId: "  " })).toThrow(
      AnecdotalRecordValidationError,
    );
  });

  it("rejects a blank entry date", () => {
    expect(() => validateAnecdotalRecordInput({ ...VALID_RECORD_INPUT, entryDate: "  " })).toThrow(
      AnecdotalRecordValidationError,
    );
  });

  it("rejects a blank narrative", () => {
    expect(() => validateAnecdotalRecordInput({ ...VALID_RECORD_INPUT, narrative: "   " })).toThrow(
      AnecdotalRecordValidationError,
    );
  });

  it("accepts each of the three generic categories", () => {
    for (const category of ANECDOTAL_CATEGORIES) {
      expect(() => validateAnecdotalRecordInput({ ...VALID_RECORD_INPUT, category })).not.toThrow();
    }
  });

  it("rejects a category value outside the generic three", () => {
    expect(() =>
      validateAnecdotalRecordInput({
        ...VALID_RECORD_INPUT,
        // @ts-expect-error -- deliberately not one of the generic three;
        // proves a disciplinary-only-style value is rejected, not
        // silently overfit to Awards' narrow framing (ADR-0083).
        category: "disciplinary",
      }),
    ).toThrow(AnecdotalRecordValidationError);
  });
});

describe("validateAnecdotalRecordFollowupInput", () => {
  it("trims and forwards a valid input", () => {
    const result = validateAnecdotalRecordFollowupInput({
      ...VALID_FOLLOWUP_INPUT,
      note: "  Brief check-in.  ",
    });

    expect(result.note).toBe("Brief check-in.");
  });

  it("rejects a blank anecdotal record id", () => {
    expect(() =>
      validateAnecdotalRecordFollowupInput({ ...VALID_FOLLOWUP_INPUT, anecdotalRecordId: "  " }),
    ).toThrow(AnecdotalRecordValidationError);
  });

  it("rejects a blank section id", () => {
    expect(() =>
      validateAnecdotalRecordFollowupInput({ ...VALID_FOLLOWUP_INPUT, sectionId: "  " }),
    ).toThrow(AnecdotalRecordValidationError);
  });

  it("rejects a blank as-of date", () => {
    expect(() =>
      validateAnecdotalRecordFollowupInput({ ...VALID_FOLLOWUP_INPUT, asOfDate: "  " }),
    ).toThrow(AnecdotalRecordValidationError);
  });

  it("rejects a blank note", () => {
    expect(() =>
      validateAnecdotalRecordFollowupInput({ ...VALID_FOLLOWUP_INPUT, note: "   " }),
    ).toThrow(AnecdotalRecordValidationError);
  });
});

describe("isDisqualifyingAnecdotalCategory", () => {
  it("treats 'negative' as disqualifying, per the project's own conservative default", () => {
    expect(isDisqualifyingAnecdotalCategory("negative")).toBe(true);
    expect(DISQUALIFYING_ANECDOTAL_CATEGORIES).toEqual(["negative"]);
  });

  it("does not treat 'positive' or 'neutral' as disqualifying", () => {
    expect(isDisqualifyingAnecdotalCategory("positive")).toBe(false);
    expect(isDisqualifyingAnecdotalCategory("neutral")).toBe(false);
  });
});
