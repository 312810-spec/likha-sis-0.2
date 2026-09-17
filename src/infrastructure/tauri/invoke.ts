import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => {
    if (sessionExpiredListener === listener) sessionExpiredListener = null;
  };
}

/** Commands whose Unauthorized result can mean a valid session lacks action-specific authority. */
const COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING = new Set([
  "login", "register_user", "add_user_to_school", "admin_reset_teacher_password",
  "create_learner", "export_learner_permanent_record_sf10", "find_learner_candidates",
  "create_learner_with_duplicate_check", "update_learner", "preview_sf1_import",
  "commit_sf1_import", "list_sf1_import_history", "import_psgc_snapshot", "create_section",
  "enroll_learner_in_section", "transfer_learner_membership", "end_learner_membership",
  "list_enrollable_learners", "enroll_learner_membership", "correct_same_day_placement",
  "open_subject_attendance_session", "mark_subject_attendance_no_class",
  "record_subject_attendance_entry", "mark_subject_attendance_all_present",
  "subject_attendance_roster_for_session", "list_subject_attendance_sessions",
  "subject_attendance_monitor", "get_learner_score_sync_status",
  "adviser_subject_attendance_overview", "adviser_monthly_attendance_summary",
  "adviser_export_section_monthly_sf2", "export_section_eosy_sf5", "assign_section_adviser",
  "end_section_adviser", "create_teaching_assignment", "replace_teacher_assignment",
  "remove_teaching_assignment", "list_teacher_assignments", "get_teacher_load",
  "create_schedule_meeting", "remove_schedule_meeting", "list_schedule_meetings_by_assignment",
  "set_school_logo", "clear_school_logo",
]);

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
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
