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
  "list_schedule_plans",
  "save_schedule_plan",
  "copy_schedule_plan",
  "generate_schedule_plan",
  "publish_schedule_plan",
  "list_my_published_schedule",
  "get_assessment_lifecycle",
  "set_assessment_lifecycle",
  "save_attachment",
  "list_attachments",
  "read_attachment",
  "issue_learning_resource",
  "list_resource_issues",
  "return_learning_resource",
  "create_support_plan",
  "list_support_plans",
  "record_support_session",
  "list_support_sessions",
  "list_review_packets",
  "export_tanaw_sample",
  "import_tanaw_sample",
  "preview_score_import",
  "commit_score_import",
  "list_score_history",
  "save_school_offering",
  "list_school_offerings",
  "act_review_packet",
  "review_packet_history",
  "list_school_planning_items",
  "save_school_planning_item",
  "login",
  "create_portable_backup",
  "register_user",
  "add_user_to_school",
  "admin_reset_teacher_password",
  "create_learner",
  "export_learner_permanent_record_sf10",
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
  "get_learner_score_sync_status",
  "adviser_subject_attendance_overview",
  "adviser_monthly_attendance_summary",
  "adviser_export_section_monthly_sf2",
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
  "set_school_logo",
  "clear_school_logo",
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
