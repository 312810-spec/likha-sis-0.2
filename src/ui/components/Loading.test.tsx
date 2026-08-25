import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Loading } from "./Loading";

describe("Loading", () => {
  it("renders the given label with role=status", () => {
    render(<Loading label="Loading sections…" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading sections…");
  });
});
