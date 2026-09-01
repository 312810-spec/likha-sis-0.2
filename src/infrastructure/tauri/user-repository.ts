import { invoke } from "./invoke";
import type { UserRepository } from "../../domain/ports/user-repository";
import type { User } from "../../domain/user";

/** Tauri implementation of {@link UserRepository}. */
export class TauriUserRepository implements UserRepository {
  registerUser(username: string, password: string, displayName: string): Promise<User> {
    return invoke<User>("register_user", { username, password, displayName });
  }

  addUserToSchool(userId: string, schoolId: string): Promise<void> {
    return invoke<void>("add_user_to_school", { userId, schoolId });
  }

  adminResetPassword(targetUserId: string, newPassword: string): Promise<void> {
    return invoke<void>("admin_reset_teacher_password", { targetUserId, newPassword });
  }
}
