import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { UserApplicationService } from "../application/user-service";
import { ValidationError } from "../domain/errors";
import type { SchoolMember } from "../domain/school-member";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SchoolMembersScreenProps {
  schoolMemberService: SchoolMemberApplicationService;
  userService: UserApplicationService;
}

/** Wave 3I: a School Head resets a colleague's LIKHA login password --
 * see `docs/adr/0057-admin-assisted-password-reset.md`. Any authenticated
 * school member may view this list (matching `list_school_members`'s
 * existing reference-data convention, the same one
 * `TeachingAssignmentsScreen`'s teacher picker already relies on); the
 * backend alone enforces that only a School Head may actually reset a
 * password, and this screen shows the same form to everyone and surfaces
 * a generic error if the backend declines -- security must not rely on
 * UI hiding, matching `TeachingAssignmentsScreen`/`SectionAdviserScreen`'s
 * established convention exactly. */
export function SchoolMembersScreen({
  schoolMemberService,
  userService,
}: SchoolMembersScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const requestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
        setLoadError("Could not load school members.");
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

  function openResetForm(memberId: string) {
    setError(null);
    setConfirmation(null);
    setNewPassword("");
    setConfirmPassword("");
    setResetTargetId(memberId);
  }

  function cancelResetForm() {
    setResetTargetId(null);
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    if (!resetTargetId) return;
    setError(null);
    setConfirmation(null);
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    const target = members.find((member) => member.id === resetTargetId);
    setResetting(true);
    try {
      await userService.adminResetPassword(resetTargetId, newPassword);
      setConfirmation(`${target?.displayName ?? "This member"}'s password has been reset.`);
      setResetTargetId(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : "Could not reset this password — check that you have permission to manage school membership.",
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <section aria-label="School Members">
      <h2 ref={headingRef} tabIndex={-1}>
        School Members
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          If a colleague forgets their LIKHA password, a School Head can set a new one for them
          here. Share the new password with them directly and privately.
        </p>
      )}

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
        <EmptyState>No members found for this school yet.</EmptyState>
      ) : (
        <table className="attendance-roster">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Roles</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <th scope="row">{member.displayName}</th>
                <td>{member.username}</td>
                <td>{member.roles.length > 0 ? member.roles.join(", ") : "—"}</td>
                <td>
                  {resetTargetId === member.id ? (
                    <form
                      onSubmit={handleReset}
                      aria-label={`Reset password for ${member.displayName}`}
                    >
                      <div className="form-row">
                        <div className="field">
                          <label htmlFor={`new-password-${member.id}`}>New password</label>
                          <input
                            id={`new-password-${member.id}`}
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            required
                            autoComplete="new-password"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`confirm-password-${member.id}`}>Confirm password</label>
                          <input
                            id={`confirm-password-${member.id}`}
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            required
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
                      <button type="submit" className="button-primary" disabled={resetting}>
                        {resetting ? "Resetting…" : "Set new password"}
                      </button>{" "}
                      <button type="button" onClick={cancelResetForm} disabled={resetting}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openResetForm(member.id)}
                      aria-label={`Reset password for ${member.displayName}`}
                    >
                      Reset password
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
