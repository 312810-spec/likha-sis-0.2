import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchoolResourcesScreen } from "./SchoolResourcesScreen";
import { SchoolResourcesApplicationService } from "../application/school-resources-service";
import type { SchoolResourcesRepository } from "../domain/ports/school-resources-repository";
import type { SupportSession } from "../domain/school-resources";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SchoolResourcesScreen", () => {
  it("hides the previous learner's sessions and ignores an obsolete plan response", async () => {
    const first = deferred<SupportSession[]>();
    const second = deferred<SupportSession[]>();
    const repository = {
      listIssues: vi.fn().mockResolvedValue([]),
      listSupportPlans: vi.fn().mockResolvedValue([
        {
          id: "a",
          learnerId: "learner-a",
          goal: "Read confidently",
          evidence: "Reading sample",
          followUpOn: "2026-10-10",
        },
        {
          id: "b",
          learnerId: "learner-b",
          goal: "Understand fractions",
          evidence: "Exercise",
          followUpOn: "2026-10-11",
        },
      ]),
      listSupportSessions: vi.fn((id: string) => (id === "a" ? first.promise : second.promise)),
    } as unknown as SchoolResourcesRepository;
    render(<SchoolResourcesScreen service={new SchoolResourcesApplicationService(repository)} />);
    await screen.findByRole("option", { name: /Read confidently/ });
    fireEvent.change(screen.getByLabelText("Support plan"), { target: { value: "a" } });
    await waitFor(() => expect(repository.listSupportSessions).toHaveBeenCalledWith("a"));
    fireEvent.change(screen.getByLabelText("Support plan"), { target: { value: "b" } });
    await act(async () => {
      second.resolve([
        {
          id: "sb",
          sessionOn: "2026-10-04",
          observation: "New plan observation",
          nextStep: "Practice",
        },
      ]);
    });
    expect(await screen.findByText(/New plan observation/)).toBeInTheDocument();
    await act(async () => {
      first.resolve([
        {
          id: "sa",
          sessionOn: "2026-10-03",
          observation: "Obsolete plan observation",
          nextStep: "Read",
        },
      ]);
    });
    expect(screen.queryByText(/Obsolete plan observation/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Support plan"), { target: { value: "" } });
    expect(screen.queryByText(/New plan observation/)).not.toBeInTheDocument();
  });
});
