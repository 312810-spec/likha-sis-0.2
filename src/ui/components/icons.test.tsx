import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "./icons";

const NAMES: IconName[] = [
  "home",
  "today",
  "check",
  "calendar",
  "learners",
  "sections",
  "import",
  "clock",
  "grid",
  "shield",
  "menu",
  "chevron",
];

describe("Icon", () => {
  it("renders a decorative svg for every name", () => {
    for (const name of NAMES) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    }
  });
});
