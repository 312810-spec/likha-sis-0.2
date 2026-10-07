import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("exposes one concise loading status and keeps placeholders decorative", () => {
    const { container } = render(<Skeleton label="Loading class overview…" lines={4} />);
    expect(screen.getByRole("status", { name: "Loading class overview…" })).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton-line")).toHaveLength(4);
    expect(container.querySelector(".skeleton-heading")).toHaveAttribute("aria-hidden", "true");
  });
});
