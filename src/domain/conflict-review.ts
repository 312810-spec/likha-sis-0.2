/**
 * The pull-side conflict review queue's read model — see
 * `repository::sync_conflict_review` (Rust) for the staging side and
 * `commands::conflict_review` for the command surface this mirrors.
 *
 * A conflict is staged when this device already has an unsynced local
 * edit to an entity the sync hub also has a newer accepted version of —
 * ADR-0067's protocol contract point 6 ("Learner identity, enrollment,
 * attendance, and grading records never use silent last-write-wins").
 * Only Learner, Attendance, and Section currently produce staged
 * conflicts (the only entity kinds with a working pull-side decrypt/apply
 * path today).
 */

/** One entity's field values, shaped differently per `kind` — a teacher
 * always sees the actual field names and values that changed, never a
 * generic opaque "conflict exists" placeholder. Discriminated on `kind`,
 * matching the Rust `#[serde(tag = "kind")]` enum exactly. */
export type ConflictEntityPreview =
  | {
      kind: "learner";
      givenName: string;
      familyName: string;
      lrn: string | null;
    }
  | {
      kind: "attendance";
      sectionId: string;
      learnerId: string;
      attendanceDate: string;
      status: string;
    }
  | {
      kind: "section";
      name: string;
      gradeLevel: string;
      schoolYear: string;
    };

/** One staged, not-yet-resolved conflict. */
export interface ConflictReviewSummary {
  id: string;
  entityKind: string;
  entityId: string;
  /** The device that sent the incoming, conflicting change. */
  deviceId: string;
  /** ISO timestamp — when this conflict was first staged. */
  createdAt: string;
  submittedBaseVersion: number;
  currentHubVersion: number;
  /** The other device's edit, decrypted for display. `null` only if it
   * could not be decrypted right now (see `incomingUnavailableReason`) —
   * never silently treated as "no incoming change." */
  incoming: ConflictEntityPreview | null;
  incomingUnavailableReason: string | null;
  /** This device's own current edit, read live from its own local copy.
   * `null` if this device no longer has a local copy of the record. */
  local: ConflictEntityPreview | null;
}

/** Which version of a conflicting record a teacher chose to keep. */
export type ConflictResolutionChoice = "keep_local" | "use_incoming";
