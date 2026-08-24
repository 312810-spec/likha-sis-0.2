import { AssessmentApplicationService } from "./application/assessment-service";
import { AttendanceApplicationService } from "./application/attendance-service";
import { AuthApplicationService } from "./application/auth-service";
import { ClassRecordApplicationService } from "./application/class-record-service";
import { ExportApplicationService } from "./application/export-service";
import { GradingApplicationService } from "./application/grading-service";
import { LearnerApplicationService } from "./application/learner-service";
import { LearnerScoreApplicationService } from "./application/learner-score-service";
import { SchoolApplicationService } from "./application/school-service";
import { SectionApplicationService } from "./application/section-service";
import { SetupApplicationService } from "./application/setup-service";
import { SubjectApplicationService } from "./application/subject-service";
import { UserApplicationService } from "./application/user-service";
import { TauriAssessmentRepository } from "./infrastructure/tauri/assessment-repository";
import { TauriAttendanceRepository } from "./infrastructure/tauri/attendance-repository";
import { TauriAuthRepository } from "./infrastructure/tauri/auth-repository";
import { TauriClassRecordRepository } from "./infrastructure/tauri/class-record-repository";
import { TauriExportRepository } from "./infrastructure/tauri/export-repository";
import { TauriGradingRepository } from "./infrastructure/tauri/grading-repository";
import { TauriLearnerRepository } from "./infrastructure/tauri/learner-repository";
import { TauriLearnerScoreRepository } from "./infrastructure/tauri/learner-score-repository";
import { TauriSchoolRepository } from "./infrastructure/tauri/school-repository";
import { TauriSectionRepository } from "./infrastructure/tauri/section-repository";
import { TauriSetupRepository } from "./infrastructure/tauri/setup-repository";
import { TauriSubjectRepository } from "./infrastructure/tauri/subject-repository";
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
export const userService = new UserApplicationService(new TauriUserRepository());
export const setupService = new SetupApplicationService(new TauriSetupRepository());
export const attendanceService = new AttendanceApplicationService(new TauriAttendanceRepository());
export const sectionService = new SectionApplicationService(new TauriSectionRepository());
export const exportService = new ExportApplicationService(new TauriExportRepository());
export const gradingService = new GradingApplicationService(new TauriGradingRepository());
export const subjectService = new SubjectApplicationService(new TauriSubjectRepository());
export const classRecordService = new ClassRecordApplicationService(
  new TauriClassRecordRepository(),
);
export const assessmentService = new AssessmentApplicationService(new TauriAssessmentRepository());
export const learnerScoreService = new LearnerScoreApplicationService(
  new TauriLearnerScoreRepository(),
);
