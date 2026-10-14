import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LessonPlanApplicationService } from "../application/lesson-plan-service";
import type { LessonSourceArtifact } from "../domain/lesson-plan";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { LessonSourceIntegrity } from "./LessonSourceIntegrity";

const ARTIFACT: LessonSourceArtifact = {
  id: "artifact-1",
  fileName: "synthetic.pdf",
  mediaType: "application/pdf",
  byteLength: 20,
  sha256: "a".repeat(64),
  ingestedByUserId: "u1",
  ingestedByName: "Synthetic Teacher",
  createdAt: "2026-10-14T00:00:00Z",
  alreadyImported: false,
};

function setup(read: () => Promise<LessonSourceArtifact | null>) {
  const service = { getSourceArtifact: vi.fn(read) } as unknown as LessonPlanApplicationService;
  return {
    ...render(<LessonSourceIntegrity artifactId="artifact-1" service={service} />),
    service,
  };
}

describe("LessonSourceIntegrity", () => {
  it("loads verified metadata only after an explicit check and separates approval", async () => {
    const user = userEvent.setup();
    const { service, container } = setup(async () => ARTIFACT);
    expect(service.getSourceArtifact).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Check attached source integrity" }));
    expect(await screen.findByRole("status")).toHaveTextContent("SHA-256 match");
    expect(screen.getByText("synthetic.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Source SHA-256")).toHaveValue(ARTIFACT.sha256);
    expect(screen.getByText(/Official approval, applicability/)).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });

  it("does not claim a match for missing or inconsistent bytes and supports retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    setup(async () => {
      if (fail) throw new Error("synthetic integrity mismatch");
      return ARTIFACT;
    });
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("no integrity match is claimed");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([null, { ...ARTIFACT, id: "different-id" }])(
    "rejects missing or wrong artifact identity",
    async (result) => {
      const user = userEvent.setup();
      setup(async () => result);
      await user.click(screen.getByRole("button"));
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
  );

  it("ignores a late read after unmount", async () => {
    const user = userEvent.setup();
    let finish!: (result: LessonSourceArtifact) => void;
    const pending = new Promise<LessonSourceArtifact>((resolve) => {
      finish = resolve;
    });
    const { unmount } = setup(() => pending);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();
    unmount();
    await act(async () => {
      finish(ARTIFACT);
      await pending;
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
