import { AuthApplicationService } from "./application/auth-service";
import { LearnerApplicationService } from "./application/learner-service";
import { SchoolApplicationService } from "./application/school-service";
import { SetupApplicationService } from "./application/setup-service";
import { UserApplicationService } from "./application/user-service";
import { TauriAuthRepository } from "./infrastructure/tauri/auth-repository";
import { TauriLearnerRepository } from "./infrastructure/tauri/learner-repository";
import { TauriSchoolRepository } from "./infrastructure/tauri/school-repository";
import { TauriSetupRepository } from "./infrastructure/tauri/setup-repository";
import { TauriUserRepository } from "./infrastructure/tauri/user-repository";

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
