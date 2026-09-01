import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import { ValidationError } from "../domain/errors";
import type { SchoolMember } from "../domain/school-member";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { PageHeader } from "./components/PageHeader";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AdminPasswordResetScreenProps {
  schoolMemberService: SchoolMemberApplicationService;
}

/** A single generic message for every way a reset can fail to actually
 * happen -- a denied capability check (thrown `Unauthorized`), a target
 * that doesn't exist, and a target in a different school (both returned
 * as `false`) are deliberately indistinguishable here, matching the
 * backend's own enumeration-safety choice (see
 * `auth::admin_reset_teacher_password`'s doc comment). Showing a
 * different message per case would leak which one occurred. */
const GENERIC_FAILURE_MESSAGE =
  "Could not reset this password. Check that you selected a valid teacher and have permission to reset passwords.";

/**
 * Wave 3I (ADR-0061): a School Head sets a new password directly for a
 * colleague in their own school, effective immediately -- the
 * recommended mechanism from this wave's 10-scenario decision process.
 * Any authenticated school member sees the same form (matching
 * `SectionAdviserScreen`'s established convention); the backend alone
 * enforces that only a School Head holding `ManageSchoolMembership` may
 * actually perform a reset -- security must not rely on UI hiding.
 */
export function AdminPasswordResetScreen({ schoolMemberService }: AdminPasswordResetScreenProps) {
  const { mode } = useTeacherMode();

  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [targetUserId, setTargetUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    schoolMemberService
      .listMembers()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setMembers(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load the list of school members.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolMemberService]);

  function memberName(memberId: string): string {
    return members.find((member) => member.id === memberId)?.displayName ?? memberId;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setResetting(true);
    try {
      const succeeded = await schoolMemberService.resetPassword(targetUserId, newPassword);
      if (succeeded) {
        setConfirmation(`${memberName(targetUserId)}'s password was reset.`);
        setTargetUserId("");
        setNewPassword("");
      } else {
        setError(GENERIC_FAILURE_MESSAGE);
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : GENERIC_FAILURE_MESSAGE);
    } finally {
      setResetting(false);
    }
  }

  return (
    <section aria-label="Reset a Password">
      <PageHeader
        title="Reset a Password"
        hint={
          mode === "guided" && (
            <p className="field-hint">
              Set a new password for a colleague who has forgotten theirs or is locked out. The new
              password takes effect immediately, and this action is recorded in Sign-in Activity.
            </p>
          )
        }
      />

      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading school members…" />
      ) : loadError ? null : members.length === 0 ? (
        <EmptyState>No other school members yet.</EmptyState>
      ) : (
        <form onSubmit={handleSubmit} aria-label="Reset a colleague's password">
          <div className="form-row">
            <div className="field">
              <label htmlFor="reset-target">Teacher</label>
              <select
                id="reset-target"
                value={targetUserId}
                onChange={(event) => setTargetUserId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select a teacher
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="reset-new-password">New password</label>
              <input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <button type="submit" className="button-primary" disabled={resetting}>
            {resetting ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </section>
  );
}
