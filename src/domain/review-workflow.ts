export type ReviewIndicator =
  | { kind: "count"; name: string; value: number; provenance: string }
  | {
      kind: "percentage";
      name: string;
      numerator: number;
      denominator: number;
      provenance: string;
    };
export interface SourceSnapshot {
  cutoff: string;
  capturedAt: string;
  fingerprint: string;
  rosterCount: number;
  attendanceCount: number;
  classRecordCount: number;
  completeGradeCount: number;
  incompleteGradeCount: number;
  discrepancies: string[];
  canonicalSources: string;
}
export interface ReviewContent {
  sourceSnapshot?: SourceSnapshot | null;
  attachmentManifest?: { id: string; sha256: string }[];
  kind: "form" | "tanaw";
  title: string;
  formCode: string;
  notes: string;
  sourceCutoff: string;
  dictionaryVersion: string;
  sourcesConfirmed: boolean;
  indicators: ReviewIndicator[];
  discrepancies: { description: string; resolution: string }[];
}
export interface ReviewPacket {
  id: string;
  schoolId: string;
  ownerUserId: string;
  reviewerUserId: string | null;
  sectionId: string;
  revision: number;
  status: "draft" | "submitted" | "returned" | "approved";
  content: ReviewContent;
  contentHash: string;
  parentPacketId: string | null;
  updatedAt: string;
}
export interface ReviewRequest {
  action:
    "create" | "save" | "submit" | "designate" | "return" | "approve" | "correct" | "snapshot";
  id?: string;
  expectedRevision?: number;
  sectionId?: string;
  content?: ReviewContent;
  reviewerUserId?: string;
  reason: string;
}
export interface ReviewHistory {
  revision: number;
  actorUserId: string;
  action: string;
  reason: string;
  content: ReviewContent;
  contentHash: string;
  status: string;
  reviewerUserId: string | null;
  recordedAt: string;
}
export function indicatorDisplay(indicator: ReviewIndicator): string {
  if (indicator.kind === "count") return String(indicator.value);
  return indicator.denominator === 0
    ? "Missing population"
    : `${((indicator.numerator / indicator.denominator) * 100).toFixed(2)}%`;
}
export const draftFormCodes = [
  "SF1",
  "SF2",
  "SF3",
  "SF4",
  "SF5",
  "SF6",
  "SF7",
  "SF9",
  "SF10",
] as const;
export function emptyReviewContent(): ReviewContent {
  return {
    kind: "form",
    title: "",
    formCode: "SF1",
    notes: "",
    sourceCutoff: "",
    dictionaryVersion: "",
    sourcesConfirmed: false,
    indicators: [],
    discrepancies: [],
  };
}
