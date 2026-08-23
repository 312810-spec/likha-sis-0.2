import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ModeProvider } from "./ModeContext";
import { useTeacherMode } from "./useTeacherMode";

function ModeProbe() {
  const { mode, setMode } = useTeacherMode();
  return (
    <div>
      <span data-testid="current-mode">{mode}</span>
      <button type="button" onClick={() => setMode("efficient")}>
        Switch to efficient
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-teacher-mode");
});

describe("ModeProvider", () => {
  it("defaults to comfortable when nothing is stored", () => {
    render(
      <ModeProvider>
        <ModeProbe />
      </ModeProvider>,
    );

    expect(screen.getByTestId("current-mode")).toHaveTextContent("comfortable");
    expect(document.documentElement.dataset.teacherMode).toBe("comfortable");
  });

  it("switching mode updates the context, the DOM attribute, and storage", async () => {
    const user = userEvent.setup();
    render(
      <ModeProvider>
        <ModeProbe />
      </ModeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to efficient" }));

    expect(screen.getByTestId("current-mode")).toHaveTextContent("efficient");
    expect(document.documentElement.dataset.teacherMode).toBe("efficient");
    expect(window.localStorage.getItem("likha-sis:teacher-mode")).toBe("efficient");
  });

  it("restores a previously stored mode on mount", () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");

    render(
      <ModeProvider>
        <ModeProbe />
      </ModeProvider>,
    );

    expect(screen.getByTestId("current-mode")).toHaveTextContent("guided");
  });

  it("ignores an invalid stored value and falls back to the default", () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "not-a-real-mode");

    render(
      <ModeProvider>
        <ModeProbe />
      </ModeProvider>,
    );

    expect(screen.getByTestId("current-mode")).toHaveTextContent("comfortable");
  });

  it("useTeacherMode throws outside of a ModeProvider", () => {
    expect(() => render(<ModeProbe />)).toThrow(/useTeacherMode must be used within/);
  });
});
