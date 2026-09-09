import { AnecdotalRecordApplicationService } from "./application/anecdotal-record-service";
import { AssessmentApplicationService } from "./application/assessment-service";
import { LessonPlanApplicationService } from "./application/lesson-plan-service";
import { AttendanceApplicationService } from "./application/attendance-service";
import { AuthApplicationService } from "./application/auth-service";
import { ClassRecordApplicationService } from "./application/class-record-service";
import { ConflictReviewApplicationService } from "./application/conflict-review-service";
import { DeviceSyncApplicationService } from "./application/device-sync-service";
import { DocumentRepositoryApplicationService } from "./application/document-repository-service";
import { ExportApplicationService } from "./application/export-service";
import { EnrollmentHistoryApplicationService } from "./application/enrollment-history-service";
import { FormativeAssessmentApplicationService } from "./application/formative-assessment-service";
import { FormGenerationApplicationService } from "./application/form-generation-service";
import { GradeSubmissionApplicationService } from "./application/grade-submission-service";
import { GradingApplicationService } from "./application/grading-service";
import { LearnerApplicationService } from "./application/learner-service";
import { LearnerScoreApplicationService } from "./application/learner-score-service";
import { MyDayApplicationService } from "./application/my-day-service";
import { SchoolApplicationService } from "./application/school-service";
import { SchoolAttendanceApplicationService } from "./application/school-attendance-service";
import { SchoolCoordinatesApplicationService } from "./application/school-coordinates-service";
import { SchoolLogoApplicationService } from "./application/school-logo-service";
import { SchoolMemberApplicationService } from "./application/school-member-service";
import { SectionApplicationService } from "./application/section-service";
import { SectionAdvisoryApplicationService } from "./application/section-advisory-service";
import { SetupApplicationService } from "./application/setup-service";
import { Sf1ImportApplicationService } from "./application/sf1-import-service";
import { SubjectApplicationService } from "./application/subject-service";
import { TeacherOversightAssignmentApplicationService } from "./application/teacher-oversight-assignment-service";
import { SubjectAttendanceApplicationService } from "./application/subject-attendance-service";
import { SyncStatusApplicationService } from "./application/sync-status-service";
import { TeachingAssignmentApplicationService } from "./application/teaching-assignment-service";
import { TransferRecordApplicationService } from "./application/transfer-record-service";
import { UserApplicationService } from "./application/user-service";
import { WeatherApplicationService } from "./application/weather-service";
import { TauriAnecdotalRecordRepository } from "./infrastructure/tauri/anecdotal-record-repository";
import { TauriAssessmentRepository } from "./infrastructure/tauri/assessment-repository";
import { TauriLessonPlanRepository } from "./infrastructure/tauri/lesson-plan-repository";
import { TauriAttendanceRepository } from "./infrastructure/tauri/attendance-repository";
import { TauriAuthRepository } from "./infrastructure/tauri/auth-repository";
import { TauriClassRecordRepository } from "./infrastructure/tauri/class-record-repository";
import { TauriConflictReviewRepository } from "./infrastructure/tauri/conflict-review-repository";
import { TauriDeviceSyncRepository } from "./infrastructure/tauri/device-sync-repository";
import { TauriDocumentRepositoryProvider } from "./infrastructure/tauri/document-repository-provider";
import { TauriExportRepository } from "./infrastructure/tauri/export-repository";
import { TauriEnrollmentHistoryRepository } from "./infrastructure/tauri/enrollment-history-repository";
import { TauriFilePicker } from "./infrastructure/tauri/file-picker";
import { TauriFormativeAssessmentRepository } from "./infrastructure/tauri/formative-assessment-repository";
import { TauriFormGenerationRepository } from "./infrastructure/tauri/form-generation-repository";
import { TauriGradeSubmissionRepository } from "./infrastructure/tauri/grade-submission-repository";
import { TauriGradingRepository } from "./infrastructure/tauri/grading-repository";
import { TauriLearnerRepository } from "./infrastructure/tauri/learner-repository";
import { TauriLearnerScoreRepository } from "./infrastructure/tauri/learner-score-repository";
import { TauriMyDayRepository } from "./infrastructure/tauri/my-day-repository";
import { TauriSchoolRepository } from "./infrastructure/tauri/school-repository";
import { TauriSchoolAttendanceRepository } from "./infrastructure/tauri/school-attendance-repository";
import { TauriSchoolCoordinatesRepository } from "./infrastructure/tauri/school-coordinates-repository";
import { TauriSchoolLogoRepository } from "./infrastructure/tauri/school-logo-repository";
import { TauriSchoolMemberRepository } from "./infrastructure/tauri/school-member-repository";
import { TauriSectionRepository } from "./infrastructure/tauri/section-repository";
import { TauriSectionAdvisoryRepository } from "./infrastructure/tauri/section-advisory-repository";
import { TauriSetupRepository } from "./infrastructure/tauri/setup-repository";
import { TauriSf1ImportRepository } from "./infrastructure/tauri/sf1-import-repository";
import { TauriSubjectRepository } from "./infrastructure/tauri/subject-repository";
import { TauriSubjectAttendanceRepository } from "./infrastructure/tauri/subject-attendance-repository";
import { TauriSyncStatusRepository } from "./infrastructure/tauri/sync-status-repository";
import { TauriTeacherOversightAssignmentRepository } from "./infrastructure/tauri/teacher-oversight-assignment-repository";
import { TauriTeachingAssignmentRepository } from "./infrastructure/tauri/teaching-assignment-repository";
import { TauriTransferRecordRepository } from "./infrastructure/tauri/transfer-record-repository";
import { TauriUserRepository } from "./infrastructure/tauri/user-repository";
import { OpenMeteoWeatherClient } from "./infrastructure/open-meteo-weather-client";

export { onSessionExpired } from "./infrastructure/tauri/invoke";

/**
 * The one place TS code is allowed to know about the concrete Tauri
 * adapters. UI code imports these pre-wired services, never the
 * `infrastructure/tauri/*` classes directly.
 */
export const authService = new AuthApplicationService(new TauriAuthRepository());
export const schoolService = new SchoolApplicationService(new TauriSchoolRepository());
export const schoolLogoService = new SchoolLogoApplicationService(new TauriSchoolLogoRepository());
export const schoolCoordinatesService = new SchoolCoordinatesApplicationService(
  new TauriSchoolCoordinatesRepository(),
);
/** Weather & Hazard Suspension Alerts (ADR-0077, ADR-0079) — the only
 * client that ever imports `OpenMeteoWeatherClient` directly, matching
 * that class's own doc comment. Every failure this dependency can throw
 * is caught inside `WeatherApplicationService` and degraded to
 * `{ status: "unavailable" }`, never surfaced as an app error. */
export const weatherService = new WeatherApplicationService(new OpenMeteoWeatherClient());
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
export const lessonPlanService = new LessonPlanApplicationService(new TauriLessonPlanRepository());
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
export const transferRecordService = new TransferRecordApplicationService(
  new TauriTransferRecordRepository(),
);
export const formativeAssessmentService = new FormativeAssessmentApplicationService(
  new TauriFormativeAssessmentRepository(),
);
export const anecdotalRecordService = new AnecdotalRecordApplicationService(
  new TauriAnecdotalRecordRepository(),
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
export const myDayService = new MyDayApplicationService(new TauriMyDayRepository());
export const gradeSubmissionService = new GradeSubmissionApplicationService(
  new TauriGradeSubmissionRepository(),
);
export const teacherOversightAssignmentService = new TeacherOversightAssignmentApplicationService(
  new TauriTeacherOversightAssignmentRepository(),
);
/** Official School Repository (Microsoft 365 / SharePoint, ADR-0088) —
 * the only client that ever imports `TauriDocumentRepositoryProvider`
 * directly, matching `weatherService`'s own doc comment above. Invisible
 * elsewhere in the app until a School Head configures it: an
 * unconfigured install's `getConnectionStatus().configured` is simply
 * `false`. */
export const documentRepositoryService = new DocumentRepositoryApplicationService(
  new TauriDocumentRepositoryProvider(),
);
