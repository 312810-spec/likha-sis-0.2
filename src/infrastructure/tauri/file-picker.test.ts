import { open } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";
import { TauriFilePicker } from "./file-picker";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const mockOpen = vi.mocked(open);

describe("TauriFilePicker", () => {
  it("filters to .xls/.xlsx and returns the chosen path", async () => {
    mockOpen.mockResolvedValueOnce("C:\\Users\\teacher\\sf1.xlsx");

    const result = await new TauriFilePicker().pickSf1Workbook();

    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        directory: false,
        filters: [{ name: expect.any(String), extensions: ["xls", "xlsx"] }],
      }),
    );
    expect(result).toBe("C:\\Users\\teacher\\sf1.xlsx");
  });

  it("returns null when the teacher cancels the dialog", async () => {
    mockOpen.mockResolvedValueOnce(null);

    const result = await new TauriFilePicker().pickSf1Workbook();

    expect(result).toBeNull();
  });
});
