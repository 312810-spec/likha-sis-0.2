import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConnectivityChecker } from "../../domain/ports/connectivity-checker";
import { RequiresInternetGate } from "./RequiresInternetGate";

function makeChecker(result: boolean | boolean[]): ConnectivityChecker {
  const results = Array.isArray(result) ? [...result] : undefined;
  return {
    isOnline: vi.fn(async () => {
      if (results) {
        return results.length > 1 ? results.shift()! : results[0]!;
      }
      return result as boolean;
    }),
  };
}

describe("RequiresInternetGate", () => {
  it("shows a loading state while the first connectivity check is pending", () => {
    const checker: ConnectivityChecker = { isOnline: () => new Promise(() => {}) };
    render(
      <RequiresInternetGate connectivityChecker={checker}>
        <p>AI generation tool</p>
      </RequiresInternetGate>,
    );
    expect(screen.getByText(/checking your connection/i)).toBeInTheDocument();
    expect(screen.queryByText("AI generation tool")).not.toBeInTheDocument();
  });

  it("renders the children plus an internet-required warning once online", async () => {
    const checker = makeChecker(true);
    render(
      <RequiresInternetGate connectivityChecker={checker}>
        <p>AI generation tool</p>
      </RequiresInternetGate>,
    );
    expect(await screen.findByText("AI generation tool")).toBeInTheDocument();
    expect(screen.getByText(/needs an internet connection/i)).toBeInTheDocument();
  });

  it("blocks the children and offers a retry when offline", async () => {
    const checker = makeChecker(false);
    render(
      <RequiresInternetGate connectivityChecker={checker}>
        <p>AI generation tool</p>
      </RequiresInternetGate>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/no internet connection/i);
    expect(screen.queryByText("AI generation tool")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("re-checks and unblocks once the retry button finds a connection", async () => {
    const user = userEvent.setup();
    const checker = makeChecker([false, true]);
    render(
      <RequiresInternetGate connectivityChecker={checker}>
        <p>AI generation tool</p>
      </RequiresInternetGate>,
    );
    await screen.findByRole("alert");

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /try again/i }));
    });

    expect(await screen.findByText("AI generation tool")).toBeInTheDocument();
    expect(checker.isOnline).toHaveBeenCalledTimes(2);
  });
});
