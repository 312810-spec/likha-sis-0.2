pub mod auth;
mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod export;
pub mod formgen;
pub mod hub_server;
pub mod import;
pub mod repository;
pub mod sync;
pub mod sync_client;

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
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_opener::init())?;

            let conn = db::open_app_db(app.handle())?;
            app.manage(Mutex::new(conn));
            app.manage(auth::SessionManager::new());

            let sspk_cell: hub_server::SharedSspk =
                std::sync::Arc::new(hub_server::SspkCell(std::sync::RwLock::new(None)));
            app.manage(sspk_cell.clone());
            if let Err(error) = hub_server::maybe_spawn_listener(app.handle(), sspk_cell) {
                log::error!("hub sync listener setup failed: {error}");
            }

            if let Err(error) = sync_client::maybe_spawn_loop(app.handle()) {
                log::error!("sync client loop setup failed: {error}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::school::list_schools,
            commands::school::create_school,
            commands::school::set_school_logo,
            commands::school::get_school_logo,
            commands::school::clear_school_logo,
            commands::learner::list_learners_by_school,
            commands::learner::create_learner,
            commands::learner::create_learner_with_duplicate_check,
            commands::learner::get_learner,
            commands::learner::update_learner,
            commands::learner::find_learner_candidates,
            commands::user::register_user,
            commands::user::add_user_to_school,
            commands::user::list_school_members,
            commands::user::admin_reset_teacher_password,
            commands::user::remove_school_member,
            commands::user::grant_school_member_role,
            commands::user::revoke_school_member_role,
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
            commands::attendance::adviser_attendance_roster_for_date,
            commands::attendance::adviser_record_attendance,
            commands::attendance::adviser_bulk_mark_attendance_present,
            commands::adviser_monthly_attendance::adviser_monthly_attendance_summary,
            commands::adviser_monthly_attendance::adviser_export_section_monthly_sf2,
            commands::attendance::monthly_attendance_summary,
            commands::attendance::school_attendance_day_totals,
            commands::section::list_sections_by_school,
            commands::section::create_section,
            commands::section::enroll_learner_in_section,
            commands::section::transfer_learner_membership,
            commands::section::end_learner_membership,
            commands::section::enroll_learner_membership,
            commands::section::correct_same_day_placement,
            commands::section::list_enrollable_learners,
            commands::section::section_roster,
            commands::section::list_learner_enrollment_history,
            commands::section::get_current_enrollment,
            commands::export::export_section_monthly_sf2,
            commands::export::export_school_monthly_attendance_sf4,
            commands::export::export_section_eosy_sf5,
            commands::export::export_school_eosy_sf6,
            commands::export::export_learner_permanent_record_sf10,
            commands::export::export_class_record_report_card,
            commands::export::export_class_record_summary,
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
            commands::learner_score::get_learner_score_sync_status,
            commands::learner_score::compute_learner_term_grade,
            commands::teaching_assignment::create_teaching_assignment,
            commands::teaching_assignment::replace_teacher_assignment,
            commands::teaching_assignment::remove_teaching_assignment,
            commands::teaching_assignment::list_teaching_assignments_by_section,
            commands::teaching_assignment::list_teacher_assignments,
            commands::teaching_assignment::get_teacher_load,
            commands::teaching_assignment::create_schedule_meeting,
            commands::teaching_assignment::remove_schedule_meeting,
            commands::teaching_assignment::list_schedule_meetings_by_assignment,
            commands::subject_attendance::open_subject_attendance_session,
            commands::subject_attendance::mark_subject_attendance_no_class,
            commands::subject_attendance::record_subject_attendance_entry,
            commands::subject_attendance::mark_subject_attendance_all_present,
            commands::subject_attendance::subject_attendance_roster_for_session,
            commands::subject_attendance::list_subject_attendance_sessions,
            commands::subject_attendance::subject_attendance_monitor,
            commands::subject_attendance::adviser_subject_attendance_overview,
            commands::my_day::get_my_day_summary,
            commands::lesson_plan::create_lesson_plan,
            commands::lesson_plan::update_lesson_plan,
            commands::lesson_plan::list_lesson_plans_by_assignment,
            commands::section_advisory::assign_section_adviser,
            commands::section_advisory::end_section_adviser,
            commands::section_advisory::current_section_adviser,
            commands::section_advisory::list_adviser_view_sections,
            commands::import::preview_sf1_import,
            commands::import::commit_sf1_import,
            commands::import::list_sf1_import_history,
            commands::reference_geo::import_psgc_snapshot,
            commands::reference_geo::get_current_psgc_snapshot,
            commands::reference_geo::list_psgc_units,
            commands::formgen::generate_sf1_form,
            commands::formgen::generate_sf9_form,
            commands::device_sync::enroll_device_sync_credential,
            commands::device_sync::revoke_device_sync_credential,
            commands::device_sync::list_device_sync_credentials,
            commands::conflict_review::list_conflict_reviews,
            commands::conflict_review::resolve_conflict_review,
            commands::sync_status::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
