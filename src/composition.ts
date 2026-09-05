import { AssessmentApplicationService } from "./application/assessment-service";
import { AttendanceApplicationService } from "./application/attendance-service";
import { AuthApplicationService } from "./application/auth-service";
import { ClassRecordApplicationService } from "./application/class-record-service";
import { ConflictReviewApplicationService } from "./application/conflict-review-service";
import { DeviceSyncApplicationService } from "./application/device-sync-service";
import { ExportApplicationService } from "./application/export-service";
import { EnrollmentHistoryApplicationService } from "./application/enrollment-history-service";
import { FormGenerationApplicationService } from "./application/form-generation-service";
import { GradingApplicationService } from "./application/grading-service";
import { LearnerApplicationService } from "./application/learner-service";
import { LearnerScoreApplicationService } from "./application/learner-score-service";
import { SchoolApplicationService } from "./application/school-service";
import { SchoolAttendanceApplicationService } from "./application/school-attendance-service";
import { SchoolMemberApplicationService } from "./application/school-member-service";
import { SectionApplicationService } from "./application/section-service";
import { SectionAdvisoryApplicationService } from "./application/section-advisory-service";
import { SetupApplicationService } from "./application/setup-service";
import { Sf1ImportApplicationService } from "./application/sf1-import-service";
import { SubjectApplicationService } from "./application/subject-service";
import { SubjectAttendanceApplicationService } from "./application/subject-attendance-service";
import { SyncStatusApplicationService } from "./application/sync-status-service";
import { TeachingAssignmentApplicationService } from "./application/teaching-assignment-service";
import { UserApplicationService } from "./application/user-service";
import { TauriAssessmentRepository } from "./infrastructure/tauri/assessment-repository";
import { TauriAttendanceRepository } from "./infrastructure/tauri/attendance-repository";
import { TauriAuthRepository } from "./infrastructure/tauri/auth-repository";
import { TauriClassRecordRepository } from "./infrastructure/tauri/class-record-repository";
import { TauriConflictReviewRepository } from "./infrastructure/tauri/conflict-review-repository";
import { TauriDeviceSyncRepository } from "./infrastructure/tauri/device-sync-repository";
import { TauriExportRepository } from "./infrastructure/tauri/export-repository";
import { TauriEnrollmentHistoryRepository } from "./infrastructure/tauri/enrollment-history-repository";
import { TauriFilePicker } from "./infrastructure/tauri/file-picker";
import { TauriFormGenerationRepository } from "./infrastructure/tauri/form-generation-repository";
import { TauriGradingRepository } from "./infrastructure/tauri/grading-repository";
import { TauriLearnerRepository } from "./infrastructure/tauri/learner-repository";
import { TauriLearnerScoreRepository } from "./infrastructure/tauri/learner-score-repository";
import { TauriSchoolRepository } from "./infrastructure/tauri/school-repository";
import { TauriSchoolAttendanceRepository } from "./infrastructure/tauri/school-attendance-repository";
import { TauriSchoolMemberRepository } from "./infrastructure/tauri/school-member-repository";
import { TauriSectionRepository } from "./infrastructure/tauri/section-repository";
import { TauriSectionAdvisoryRepository } from "./infrastructure/tauri/section-advisory-repository";
import { TauriSetupRepository } from "./infrastructure/tauri/setup-repository";
import { TauriSf1ImportRepository } from "./infrastructure/tauri/sf1-import-repository";
import { TauriSubjectRepository } from "./infrastructure/tauri/subject-repository";
import { TauriSubjectAttendanceRepository } from "./infrastructure/tauri/subject-attendance-repository";
import { TauriSyncStatusRepository } from "./infrastructure/tauri/sync-status-repository";
import { TauriTeachingAssignmentRepository } from "./infrastructure/tauri/teaching-assignment-repository";
import { TauriUserRepository } from "./infrastructure/tauri/user-repository";

export { onSessionExpired } from "./infrastructure/tauri/invoke";

/**
 * The one place TS code is allowed to know about the concrete Tauri
 * adapters. UI code imports these pre-wired services, never the
 * `infrastructure/tauri/*` classes directly.
 */
export const authService = new AuthApplicationService(new TauriAuthRepository());
export const schoolService = new SchoolApplicationService(new TauriSchoolRepository());
export const learnerService = new LearnerApplicationService(new TauriLearnerRepository());
/** @public — the `registerUser` capability is fully implemented and
 * tested end to end (application service, repository port, Tauri
 * command, infrastructure adapter) but has no UI consumer yet: today
 * only the first School Head account is created, via
 * `setupService.completeSetup`'s first-run bootstrap. This is the
 * unwired foundation for a future "School Head adds a teacher account"
 * flow (see `docs/product/PRODUCT-CONTRACT.md` §3 RBAC) — not
 * confirmed dead code, so not deleted for the 2026-09-04 dead-code-gate
 * pass. */
export const userService = new UserApplicationService(new TauriUserRepository());
export const setupService = new SetupApplicationService(new TauriSetupRepository());
export const attendanceService = new AttendanceApplicationService(new TauriAttendanceRepository());
const sectionRepository = new TauriSectionRepository();
export const sectionService = new SectionApplicationService(sectionRepository);
export const enrollmentHistoryService = new EnrollmentHistoryApplicationService(
  new TauriEnrollmentHistoryRepository(),
  sectionRepository,
);
export const exportService = new ExportApplicationService(new TauriExportRepository());
export const formGenerationService = new FormGenerationApplicationService(
  new TauriFormGenerationRepository(),
);
export const gradingService = new GradingApplicationService(new TauriGradingRepository());
export const subjectService = new SubjectApplicationService(new TauriSubjectRepository());
export const classRecordService = new ClassRecordApplicationService(
  new TauriClassRecordRepository(),
);
export const assessmentService = new AssessmentApplicationService(new TauriAssessmentRepository());
export const learnerScoreService = new LearnerScoreApplicationService(
  new TauriLearnerScoreRepository(),
);
export const sf1ImportService = new Sf1ImportApplicationService(
  new TauriSf1ImportRepository(),
  new TauriFilePicker(),
);
const teachingAssignmentRepository = new TauriTeachingAssignmentRepository();
export const subjectAttendanceService = new SubjectAttendanceApplicationService(
  new TauriSubjectAttendanceRepository(),
  teachingAssignmentRepository,
);
export const teachingAssignmentService = new TeachingAssignmentApplicationService(
  teachingAssignmentRepository,
);
export const schoolMemberService = new SchoolMemberApplicationService(
  new TauriSchoolMemberRepository(),
);
export const schoolAttendanceService = new SchoolAttendanceApplicationService(
  new TauriSchoolAttendanceRepository(),
);
export const sectionAdvisoryService = new SectionAdvisoryApplicationService(
  new TauriSectionAdvisoryRepository(),
);
export const deviceSyncService = new DeviceSyncApplicationService(new TauriDeviceSyncRepository());
export const conflictReviewService = new ConflictReviewApplicationService(
  new TauriConflictReviewRepository(),
);
export const syncStatusService = new SyncStatusApplicationService(new TauriSyncStatusRepository());
