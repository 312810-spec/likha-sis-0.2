import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { LessonSuggestionReview } from "./LessonSuggestionReview";
import { parseLessonSuggestion } from "../domain/lesson-suggestion";

const DRAFT = {
  learningObjectives: "Synthetic objective",
  connectionToPreviousLearning: "",
  learningExperiences: "Synthetic activity",
  assessment: "<strong>Synthetic assessment</strong>",
  waysForward: "",
};

function setup(raw = JSON.stringify(DRAFT)) {
  const apply = vi.fn();
  function Harness() {
    const [value, setValue] = useState(raw);
    return (
      <LessonSuggestionReview
        raw={value}
        onRawChange={setValue}
        onApply={apply}
        onStage={parseLessonSuggestion}
        disabled={false}
      />
    );
  }
  return { ...render(<Harness />), apply };
}

describe("LessonSuggestionReview", () => {
  it("requires separate staging and explicit teacher approval before applying", async () => {
    const user = userEvent.setup();
    const { apply, container } = setup();
    await user.click(screen.getByText("Review an external AI-assisted planning draft"));
    await user.click(screen.getByRole("button", { name: "Stage draft for review" }));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply reviewed draft" })).toBeDisabled();
    expect(screen.getByText("<strong>Synthetic assessment</strong>").tagName).toBe("DD");
    await expectNoAccessibilityViolations(container);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Apply reviewed draft" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith(DRAFT);
    expect(screen.queryByRole("button", { name: "Apply reviewed draft" })).not.toBeInTheDocument();
  });

  it("invalidates review and approval when pasted text changes", async () => {
    const user = userEvent.setup();
    const { apply } = setup();
    await user.click(screen.getByText("Review an external AI-assisted planning draft"));
    await user.click(screen.getByRole("button", { name: "Stage draft for review" }));
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("External planning draft JSON"), " ");
    expect(screen.queryByRole("button", { name: "Apply reviewed draft" })).not.toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stage draft for review" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("does not apply invalid data or imported competencies", async () => {
    const user = userEvent.setup();
    const { apply } = setup(JSON.stringify({ ...DRAFT, learningCompetency: "not authoritative" }));
    await user.click(screen.getByText("Review an external AI-assisted planning draft"));
    await user.click(screen.getByRole("button", { name: "Stage draft for review" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Competencies");
    expect(apply).not.toHaveBeenCalled();
  });
});
