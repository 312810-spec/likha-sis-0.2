pub mod auth;
mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod export;
pub mod repository;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let conn = db::open_app_db(app.handle())?;
            app.manage(Mutex::new(conn));
            app.manage(auth::SessionManager::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::school::list_schools,
            commands::school::create_school,
            commands::learner::list_learners_by_school,
            commands::learner::create_learner,
            commands::learner::get_learner,
            commands::learner::update_learner,
            commands::learner::find_learner_candidates,
            commands::user::register_user,
            commands::user::add_user_to_school,
            commands::setup::installation_status,
            commands::setup::bootstrap_installation,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::current_session,
            commands::auth::extend_session,
            commands::auth::list_audit_log,
            commands::attendance::attendance_roster_for_date,
            commands::attendance::record_attendance,
            commands::attendance::bulk_mark_attendance_present,
            commands::attendance::monthly_attendance_summary,
            commands::section::list_sections_by_school,
            commands::section::create_section,
            commands::section::enroll_learner_in_section,
            commands::section::section_roster,
            commands::section::list_learner_enrollment_history,
            commands::section::get_current_enrollment,
            commands::export::export_section_monthly_sf2,
            commands::export::export_class_record_report_card,
            commands::export::export_learner_roster,
            commands::grading::list_grading_policies,
            commands::grading::list_grading_policy_periods,
            commands::grading::list_grading_periods_by_school_year,
            commands::grading::create_grading_period,
            commands::subject::list_subjects_by_school,
            commands::subject::create_subject,
            commands::class_record::list_class_records_by_school,
            commands::class_record::create_class_record,
            commands::class_record::list_grading_weight_policies,
            commands::assessment_category::list_assessment_category_sets,
            commands::assessment_category::list_assessment_categories_for_set,
            commands::assessment_item::list_assessment_items_by_class_record,
            commands::assessment_item::create_assessment_item,
            commands::assessment_item::rename_assessment_item,
            commands::assessment_item::update_assessment_item,
            commands::assessment_item::delete_assessment_item,
            commands::learner_score::roster_for_assessment_item,
            commands::learner_score::record_learner_score,
            commands::learner_score::compute_learner_term_grade,
            commands::teaching_assignment::create_teaching_assignment,
            commands::teaching_assignment::replace_teacher_assignment,
            commands::teaching_assignment::remove_teaching_assignment,
            commands::teaching_assignment::list_teaching_assignments_by_section,
            commands::teaching_assignment::list_teacher_assignments,
            commands::teaching_assignment::get_teacher_load,
            commands::teaching_assignment::create_schedule_meeting,
            commands::teaching_assignment::list_schedule_meetings_by_assignment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
