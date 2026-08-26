import { open } from "@tauri-apps/plugin-dialog";
import type { FilePicker } from "../../domain/ports/file-picker";

/** Tauri-native implementation of {@link FilePicker}, backed by the
 * official first-party `@tauri-apps/plugin-dialog` (see
 * `docs/SOURCE-REGISTRY.md`). */
export class TauriFilePicker implements FilePicker {
  async pickSf1Workbook(): Promise<string | null> {
    const selection = await open({
      title: "Choose an SF1 Excel workbook",
      multiple: false,
      directory: false,
      filters: [{ name: "Excel workbook (.xls or .xlsx)", extensions: ["xls", "xlsx"] }],
    });
    // `multiple: false` guarantees a single string or null, never an
    // array -- this narrows the plugin's own broader union type.
    return typeof selection === "string" ? selection : null;
  }
}
