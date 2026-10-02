import { beforeEach, describe, expect, it, vi } from "vitest";
import { TauriBackupRepository } from "./backup-repository";
const { save, open, invoke } = vi.hoisted(() => ({
  save: vi.fn(),
  open: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save, open }));
vi.mock("./invoke", () => ({ invoke }));
beforeEach(() => {
  vi.clearAllMocks();
});
describe("native backup repository", () => {
  it("does not invoke a write or recovery after native dialog cancellation", async () => {
    save.mockResolvedValue(null);
    open.mockResolvedValue(null);
    const repository = new TauriBackupRepository();
    expect(await repository.create("synthetic password")).toBeNull();
    expect(await repository.stageRecovery("synthetic password")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("returns a saved path only after native success and propagates a failed recovery", async () => {
    save.mockResolvedValue("synthetic.likhabak");
    open.mockResolvedValue("synthetic.likhabak");
    invoke.mockResolvedValueOnce(undefined).mockRejectedValueOnce("backup_invalid");
    const repository = new TauriBackupRepository();
    expect(await repository.create("synthetic password")).toBe("synthetic.likhabak");
    await expect(repository.stageRecovery("wrong synthetic password")).rejects.toBe(
      "backup_invalid",
    );
    expect(invoke).toHaveBeenNthCalledWith(1, "create_portable_backup", {
      filePath: "synthetic.likhabak",
      password: "synthetic password",
    });
  });
});
