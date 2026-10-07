import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResumeWorkScreen } from "./ResumeWorkScreen";
import type { ResumeRecovery } from "./resume-pointer-recovery";
import { recoverResumePointer } from "./resume-pointer-recovery";

vi.mock("./resume-pointer-recovery", () => ({ recoverResumePointer: vi.fn() }));
const authority = {
  findAuthorizedClass: vi.fn(),
  isAuthorizedAdvisorySection: vi.fn(),
};
const recovery: ResumeRecovery = {
  destination: "advisory",
  context: { sectionId: "synthetic-section" },
};

describe("resume work account boundaries", () => {
  it("does not resume another user's context when an in-flight click finishes", async () => {
    let finish!: (value: ResumeRecovery | null) => void;
    const pending = new Promise<ResumeRecovery | null>((resolve) => {
      finish = resolve;
    });
    vi.mocked(recoverResumePointer)
      .mockReset()
      .mockResolvedValueOnce(recovery)
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(null);
    const onResume = vi.fn();
    const view = render(
      <ResumeWorkScreen userId="first" authority={authority} onResume={onResume} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /continue your last/i }));
    view.rerender(<ResumeWorkScreen userId="second" authority={authority} onResume={onResume} />);
    expect(screen.queryByRole("button")).toBeNull();
    await act(async () => {
      finish(recovery);
      await pending;
    });
    expect(onResume).not.toHaveBeenCalled();
  });

  it("discards the button when current authorization is revoked before a click", async () => {
    vi.mocked(recoverResumePointer)
      .mockReset()
      .mockResolvedValueOnce(recovery)
      .mockResolvedValueOnce(null);
    const onResume = vi.fn();
    render(<ResumeWorkScreen userId="teacher" authority={authority} onResume={onResume} />);
    await userEvent.click(await screen.findByRole("button", { name: /continue your last/i }));
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
    expect(onResume).not.toHaveBeenCalled();
  });
});
