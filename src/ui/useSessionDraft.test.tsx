import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionDraftProvider } from "./SessionDraftProvider";
import { clearSessionDrafts } from "./session-draft-store";
import { useSessionDraft } from "./useSessionDraft";

beforeEach(clearSessionDrafts);
const wrapper = (owner: string | null) =>
  function Wrapper({ children }: PropsWithChildren) {
    return <SessionDraftProvider owner={owner}>{children}</SessionDraftProvider>;
  };
describe("session drafts", () => {
  it("restores unsaved work on navigation for the same account and school", () => {
    const first = renderHook(() => useSessionDraft("scores", ""), {
      wrapper: wrapper("teacher:school"),
    });
    act(() => first.result.current[1]("17"));
    first.unmount();
    const restored = renderHook(() => useSessionDraft("scores", ""), {
      wrapper: wrapper("teacher:school"),
    });
    expect(restored.result.current[0]).toBe("17");
    restored.unmount();
    for (const owner of ["other:school", "teacher:other-school", null]) {
      const isolated = renderHook(() => useSessionDraft("scores", ""), { wrapper: wrapper(owner) });
      expect(isolated.result.current[0]).toBe("");
      isolated.unmount();
    }
  });
  it("does not let an old async setter repopulate work after logout clears it", () => {
    const first = renderHook(() => useSessionDraft("composer", ""), {
      wrapper: wrapper("teacher:school"),
    });
    const lateSetter = first.result.current[1];
    act(() => lateSetter("unsaved"));
    act(() => clearSessionDrafts());
    act(() => lateSetter("late response"));
    first.unmount();
    const restored = renderHook(() => useSessionDraft("composer", ""), {
      wrapper: wrapper("teacher:school"),
    });
    expect(restored.result.current[0]).toBe("");
  });
  it("ignores setters belonging to an unmounted screen", () => {
    const first = renderHook(() => useSessionDraft("composer", ""), {
      wrapper: wrapper("teacher:school"),
    });
    const lateSetter = first.result.current[1];
    act(() => lateSetter("my work"));
    first.unmount();
    act(() => lateSetter("late response"));
    const restored = renderHook(() => useSessionDraft("composer", ""), {
      wrapper: wrapper("teacher:school"),
    });
    expect(restored.result.current[0]).toBe("my work");
  });
});
