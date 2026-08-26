/**
 * A narrow port over the OS-native "choose a file" dialog — kept
 * separate from `Sf1ImportRepository` because it's not a data
 * read/write, it's a native platform interaction (matching the
 * architecture rule that only `infrastructure/tauri/*` may know about a
 * concrete Tauri plugin; UI code depends on this port, never on
 * `@tauri-apps/plugin-dialog` directly).
 */
export interface FilePicker {
  /**
   * Opens a native file-open dialog filtered to `.xls`/`.xlsx`
   * workbooks. Resolves to the chosen absolute path, or `null` if the
   * teacher cancelled the dialog.
   */
  pickSf1Workbook(): Promise<string | null>;
}
