import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BentoGrid, Card } from "./Card";
import { expectNoAccessibilityViolations } from "../../test/a11y";

describe("Card", () => {
  it("renders the title at heading level 3 by default", () => {
    render(<Card title="Attendance">body</Card>);
    expect(screen.getByRole("heading", { level: 3, name: "Attendance" })).toBeInTheDocument();
  });

  it("renders the title at the requested heading level (2)", () => {
    render(
      <Card title="Attendance" headingLevel={2}>
        body
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Attendance" })).toBeInTheDocument();
  });

  it("renders the title at the requested heading level (4)", () => {
    render(
      <Card title="Attendance" headingLevel={4}>
        body
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 4, name: "Attendance" })).toBeInTheDocument();
  });

  it("renders an actions node in the header", () => {
    render(
      <Card title="Attendance" actions={<button type="button">Refresh</button>}>
        body
      </Card>,
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("renders children inside the card body", () => {
    const { container } = render(
      <Card title="Attendance">
        <p>tracked content</p>
      </Card>,
    );
    const body = container.querySelector(".card-body");
    expect(body).not.toBeNull();
    expect(body).toHaveTextContent("tracked content");
  });

  it("reflects the span prop via data-span", () => {
    const { container } = render(
      <Card title="Attendance" span={6}>
        body
      </Card>,
    );
    expect(container.querySelector("section.card")).toHaveAttribute("data-span", "6");
  });

  it("defaults data-span to 12", () => {
    const { container } = render(<Card title="Attendance">body</Card>);
    expect(container.querySelector("section.card")).toHaveAttribute("data-span", "12");
  });

  it("sets data-keep-half only when keepHalf is set", () => {
    const { container, rerender } = render(
      <Card title="Attendance" span={6}>
        body
      </Card>,
    );
    expect(container.querySelector("section.card")).not.toHaveAttribute("data-keep-half");
    rerender(
      <Card title="Attendance" span={6} keepHalf>
        body
      </Card>,
    );
    expect(container.querySelector("section.card")).toHaveAttribute("data-keep-half", "");
  });

  it("renders no heading and no header when there is no title", () => {
    const { container } = render(<Card>plain body</Card>);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".card-header")).toBeNull();
    expect(container.querySelector(".card-body")).toHaveTextContent("plain body");
  });

  it("renders BentoGrid children", () => {
    render(
      <BentoGrid>
        <p>grid child</p>
      </BentoGrid>,
    );
    expect(screen.getByText("grid child")).toBeInTheDocument();
  });

  it("has no axe violations for a BentoGrid of two Cards", async () => {
    const { container } = render(
      <BentoGrid>
        <Card title="Titled" headingLevel={3} span={6}>
          <p>first</p>
        </Card>
        <Card span={6}>
          <p>second</p>
        </Card>
      </BentoGrid>,
    );
    await expectNoAccessibilityViolations(container);
  });
});
