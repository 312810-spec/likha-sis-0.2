import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kpi, KpiStrip, type KpiTone } from "./KpiStrip";
import { expectNoAccessibilityViolations } from "../../test/a11y";

describe("KpiStrip", () => {
  it("renders its Kpi children inside a .kpi-strip", () => {
    const { container } = render(
      <KpiStrip>
        <Kpi label="Present today" value={28} />
        <Kpi label="Absent" value={2} />
      </KpiStrip>,
    );
    const strip = container.querySelector(".kpi-strip");
    expect(strip).not.toBeNull();
    expect(strip?.querySelectorAll(".kpi")).toHaveLength(2);
    expect(strip?.textContent).toContain("Present today");
    expect(strip?.textContent).toContain("28");
  });
});

describe("Kpi", () => {
  it("shows its label, value, and foot", () => {
    const { container } = render(
      <Kpi label="Attendance rate" value="93%" foot="vs 88% last week" />,
    );
    expect(container.querySelector(".kpi-label")?.textContent).toBe("Attendance rate");
    expect(container.querySelector(".kpi-value")?.textContent).toBe("93%");
    expect(container.querySelector(".kpi-foot")?.textContent).toBe("vs 88% last week");
  });

  it("omits the foot and hint when not given", () => {
    const { container } = render(<Kpi label="Sections" value={4} />);
    expect(container.querySelector(".kpi-foot")).toBeNull();
    expect(container.querySelector(".kpi-hint")).toBeNull();
  });

  it("renders the hint after the label when given", () => {
    const { container } = render(<Kpi label="Overdue" value={1} hint="needs follow-up" />);
    const kpi = container.querySelector(".kpi");
    const label = container.querySelector(".kpi-label");
    const hint = container.querySelector(".kpi-hint");
    expect(hint?.textContent).toBe("needs follow-up");
    // hint comes immediately after the label
    expect(label?.nextElementSibling).toBe(hint);
    expect(kpi?.firstElementChild).toBe(label);
  });

  it('defaults data-tone to "neutral"', () => {
    const { container } = render(<Kpi label="Learners" value={30} />);
    expect(container.querySelector(".kpi")?.getAttribute("data-tone")).toBe("neutral");
  });

  it("reflects the tone prop in data-tone", () => {
    const { container } = render(<Kpi label="Missing grades" value={5} tone="warning" />);
    expect(container.querySelector(".kpi")?.getAttribute("data-tone")).toBe("warning");
  });

  it("applies every KpiTone value as data-tone", () => {
    const tones: KpiTone[] = ["neutral", "productive", "success", "warning", "danger"];
    for (const tone of tones) {
      const { container, unmount } = render(<Kpi label="X" value={1} tone={tone} />);
      expect(container.querySelector(".kpi")).toHaveAttribute("data-tone", tone);
      unmount();
    }
  });

  it("accepts value as a number and as a string", () => {
    const asNumber = render(<Kpi label="Count" value={12} />);
    expect(asNumber.container.querySelector(".kpi-value")?.textContent).toBe("12");
    const asString = render(<Kpi label="Ratio" value="12 of 30" />);
    expect(asString.container.querySelector(".kpi-value")?.textContent).toBe("12 of 30");
  });

  it("keeps the label text present regardless of tone", () => {
    const { container } = render(<Kpi label="At risk" value={3} tone="danger" />);
    expect(container.querySelector(".kpi-label")?.textContent).toBe("At risk");
  });

  it("has no axe violations for a strip of three tiles", async () => {
    const { container } = render(
      <KpiStrip>
        <Kpi label="Present today" value={28} tone="success" foot="of 30 enrolled" />
        <Kpi label="Absent" value={2} tone="warning" foot="2 unexplained" />
        <Kpi label="Attendance rate" value="93%" tone="neutral" hint="rolling 5-day" />
      </KpiStrip>,
    );
    await expectNoAccessibilityViolations(container);
  });
});
