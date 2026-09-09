/**
 * The pull-side conflict review queue's read model — see
 * `repository::sync_conflict_review` (Rust) for the staging side and
 * `commands::conflict_review` for the command surface this mirrors.
 *
 * A conflict is staged when this device already has an unsynced local
 * edit to an entity the sync hub also has a newer accepted version of —
 * ADR-0067's protocol contract point 6 ("Learner identity, enrollment,
 * attendance, and grading records never use silent last-write-wins").
 * The resolution mechanism itself (`resolve_conflict_review`, Rust) is
 * generic across every `EntityKind` wired to sync, not just the ones
 * below — see `commands::conflict_review`'s own doc comment. Every
 * entity kind wired to sync as of this commit (Learner, Attendance,
 * Section, LessonPlan, NutritionRecord, BehavioralIncident,
 * IncidentIntervention, GradeSubmission, GradeSubmissionNote) has a
 * dedicated, field-level `ConflictEntityPreview` variant; `{ kind:
 * "unknown" }` remains only as the fallback for a future entity kind
 * wired to sync before its own preview is added — still resolvable via
 * "use incoming," just without a field-by-field breakdown until then.
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
    }
  | {
      kind: "lessonPlan";
      planDate: string;
      learningCompetency: string;
      learningCompetencyCode: string;
      learningObjectives: string;
    }
  | {
      kind: "nutritionRecord";
      learnerId: string;
      schoolYear: string;
      period: string;
      heightM: number;
      weightKg: number;
      nutritionalStatus: string | null;
    }
  | {
      kind: "behavioralIncident";
      learnerId: string;
      severityTier: string;
      category: string;
      description: string;
      incidentDate: string;
      resolvedAt: string | null;
    }
  | {
      kind: "incidentIntervention";
      incidentId: string;
      entryType: string;
      note: string;
    }
  | {
      kind: "gradeSubmission";
      classRecordId: string;
      status: string;
      submittedAt: string;
    }
  | {
      kind: "gradeSubmissionNote";
      submissionId: string;
      noteType: string;
      note: string;
    }
  | {
      /** Fallback for a sync-wired entity kind with no dedicated typed
       * preview yet — see the Rust `ConflictEntityPreview::Unknown` doc
       * comment. The record still decrypted successfully; there is
       * simply no field-level breakdown for it, so "use incoming" stays
       * available. */
      kind: "unknown";
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
