import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Broken(): never {
  throw new Error("PRIVATE learner 123456 database path");
}
describe("screen recovery", () => {
  it("focuses a safe explanation and permits a different destination", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { rerender } = render(
        <ErrorBoundary key="scores">
          <Broken />
        </ErrorBoundary>,
      );
      expect(screen.getByRole("alert")).toHaveFocus();
      expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE");
      rerender(
        <ErrorBoundary key="today">
          <h1>Today</h1>
        </ErrorBoundary>,
      );
      expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      log.mockRestore();
    }
  });
  it("retries a screen after a transient render failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    function Screen() {
      if (broken) throw new Error("transient");
      return <h1>Recovered</h1>;
    }
    try {
      render(
        <ErrorBoundary>
          <Screen />
        </ErrorBoundary>,
      );
      broken = false;
      await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
      expect(screen.getByRole("heading", { name: "Recovered" })).toBeInTheDocument();
    } finally {
      log.mockRestore();
    }
  });
});
