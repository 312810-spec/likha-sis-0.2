import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type SessionExpiredListener = () => void;

let sessionExpiredListener: SessionExpiredListener | null = null;

/**
 * Registers the single listener notified when a command fails because
 * the session is no longer valid (idle-timed-out, past the absolute
 * TTL, or revoked) — see ADR-0022. `App.tsx` is the only caller: it
 * clears the current session and shows a clear "please sign in again"
 * message instead of leaving each screen to fail with a generic error.
 * Registering a new listener replaces any previous one (this app has
 * exactly one place that should ever care).
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => {
    if (sessionExpiredListener === listener) {
      sessionExpiredListener = null;
    }
  };
}

/**
 * Every Rust command that additionally gates on a `Capability`, on
 * `authorize_view_teacher_load` (self-or-School-Head), or on
 * `subject_attendance::authorize_own_assignment`, or on
 * `authorize_adviser_of_section` -- see
 * `src-tauri/src/auth/mod.rs`'s `authorize_*` functions and
 * `repository::subject_attendance::authorize_own_assignment`. Each of
 * these can reject `Unauthorized` for a session that is completely
 * valid, just not permitted for this one specific action (a Teacher
 * without `ManageTeachingAssignments`, a Teacher viewing a colleague's
 * load, a caller targeting an assignment they don't own, an unrelated
 * teacher targeting an advisory section) -- a
 * fundamentally different situation from `require_active_session`/
 * `require_active_school_scope`'s own `Unauthorized`, which really
 * does mean "no valid session at all."
 *
 * Wave 3B discovery: this codebase's own `AppError::Unauthorized`
 * serializes identically ("unauthorized") for both situations, so the
 * frontend could not tell them apart -- every one of these commands
 * was silently forcing a global "session expired, please sign in
 * again" logout on an ordinary permission denial, discarding whatever
 * friendlier local message the calling screen intended to show (see
 * `Sf1ImportScreen.test.tsx`'s own "generic, safe message" test, which
 * only ever exercised this in isolation, never through the real
 * `App.tsx` session-listener wiring that made the bug invisible to
 * that test). `login` was the only command ever added to this
 * exemption list, because it was the only one anyone had reason to
 * test end-to-end. Fixing this only changes frontend UX
 * classification of an already-correct backend decision -- no
 * `authorize_*` gate itself changed, so this is not a security
 * loosening. A session that is genuinely expired is still caught
 * promptly: virtually every screen also calls at least one
 * non-exempted, session-only-gated read.
 */
const COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING = new Set([
  "login",
  "register_user",
  "add_user_to_school",
  "admin_reset_teacher_password",
  "create_learner",
  "find_learner_candidates",
  "create_learner_with_duplicate_check",
  "update_learner",
  "preview_sf1_import",
  "commit_sf1_import",
  "list_sf1_import_history",
  "import_psgc_snapshot",
  "create_section",
  "enroll_learner_in_section",
  "transfer_learner_membership",
  "end_learner_membership",
  "list_enrollable_learners",
  "enroll_learner_membership",
  "correct_same_day_placement",
  "open_subject_attendance_session",
  "mark_subject_attendance_no_class",
  "record_subject_attendance_entry",
  "mark_subject_attendance_all_present",
  "subject_attendance_roster_for_session",
  "list_subject_attendance_sessions",
  "subject_attendance_monitor",
  "adviser_subject_attendance_overview",
  "export_section_eosy_sf5",
  "assign_section_adviser",
  "end_section_adviser",
  "create_teaching_assignment",
  "replace_teacher_assignment",
  "remove_teaching_assignment",
  "list_teacher_assignments",
  "get_teacher_load",
  "create_schedule_meeting",
  "remove_schedule_meeting",
  "list_schedule_meetings_by_assignment",
]);

/**
 * Every `TauriXRepository` calls this instead of importing `invoke`
 * directly from `@tauri-apps/api/core` — a thin wrapper that also
 * notices an `Unauthorized` rejection and notifies the single
 * registered listener before re-throwing the original error unchanged,
 * so existing per-repository error handling is completely unaffected.
 */
export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // Forward exactly as many arguments as the caller passed — always
  // passing `args` (even as `undefined`) is observably different from
  // omitting it entirely (a call with one argument vs. two), which
  // broke every repository test asserting the exact `invoke` call shape
  // and, more importantly, is a real behavioral change to preserve
  // parity on, not just a test-satisfying one.
  const call = args === undefined ? tauriInvoke<T>(command) : tauriInvoke<T>(command, args);
  return call.catch((error: unknown) => {
    if (!COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING.has(command) && isUnauthorized(error)) {
      sessionExpiredListener?.();
    }
    throw error;
  });
}

function isUnauthorized(error: unknown): boolean {
  return String(error).includes("unauthorized");
}
