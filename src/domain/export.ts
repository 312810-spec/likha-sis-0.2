/** @public — only consumed structurally, via `FieldDisclosure.omittedFields`
 * and the `Sf*ExportResult`/`ReportCardExportResult`/`LearnerRosterExportResult`
 * types below that every export screen imports by name. */
export interface OmittedField {
  field: string;
  reason: string;
}

/**
 * A machine-readable record of which official-form fields an export
 * populated versus deliberately omitted, and why. This is the single
 * source of truth the UI renders its disclaimer from — it comes straight
 * back from the export command, so the disclaimer can never drift from
 * what the file actually contains.
 *
 * @public — only consumed structurally, via the export-result types below.
 */
export interface FieldDisclosure {
  populatedFields: string[];
  omittedFields: OmittedField[];
}

export interface Sf2ExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}

export interface Sf4ExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}

export interface ReportCardExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}

export interface Sf5ExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}

export interface Sf6ExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}

export interface LearnerRosterExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}

export interface Sf10ExportResult {
  filePath: string;
  disclosure: FieldDisclosure;
}
