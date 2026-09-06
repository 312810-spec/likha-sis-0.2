import { useEffect, useRef, useState } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SchoolMember } from "../domain/school-member";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SchoolMembershipScreenProps {
  schoolMemberService: SchoolMemberApplicationService;
}

/** A single generic message for every way a removal can fail to actually
 * happen -- a denied capability check (thrown `Unauthorized`), a target
 * that no longer exists, and a removal that would leave the school with
 * zero School Heads (all returned as `false`) are deliberately
 * indistinguishable here, matching `AdminPasswordResetScreen`'s and
 * `DeviceManagementScreen`'s own enumeration-safety choice for the
 * analogous backend contract -- see `auth::remove_school_member`'s doc
 * comment. */
const GENERIC_FAILURE_MESSAGE =
  "Could not remove this member. They may already be removed, removing them may leave the school without a School Head, or you may not have permission to remove members.";

function roleLabel(role: string): string {
  switch (role) {
    case "school_head":
      return "School Head";
    case "registrar":
      return "Registrar";
    case "teacher":
      return "Teacher";
    default:
      return role;
  }
}

/**
 * School Membership Removal: lets a School Head see every member of
 * their school with their roles, and revoke a member's access when they
 * have left or should no longer reach this school's records. Any
 * authenticated school member sees the same list (matching
 * `AdminPasswordResetScreen`'s and `DeviceManagementScreen`'s established
 * convention of not hiding a screen behind client-side role checks); the
 * backend alone enforces that a removal only succeeds for a School Head
 * holding `ManageSchoolMembership` in their own school -- security must
 * not rely on UI hiding.
 *
 * Removal is a two-step, plain-language confirmation, not a single click
 * or a browser `confirm()` dialog -- the consequence (this person loses
 * access right away, though their prior records stay in the system) is
 * stated in the confirmation panel itself, matching
 * `DeviceManagementScreen`'s established "no unexplained destructive
 * action" convention.
 */
export function SchoolMembershipScreen({ schoolMemberService }: SchoolMembershipScreenProps) {
  const { mode } = useTeacherMode();

  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

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

  function startRemove(memberId: string) {
    setError(null);
    setConfirmation(null);
    setPendingRemoveId(memberId);
  }

  function cancelRemove() {
    setPendingRemoveId(null);
  }

  async function confirmRemove(member: SchoolMember) {
    if (removing) return;
    setError(null);
    setConfirmation(null);
    setRemoving(true);
    try {
      const succeeded = await schoolMemberService.removeMember(member.id);
      if (succeeded) {
        setConfirmation(`${member.displayName} was removed and can no longer access this school.`);
        setMembers((current) => current.filter((m) => m.id !== member.id));
      } else {
        setError(GENERIC_FAILURE_MESSAGE);
      }
    } catch {
      setError(GENERIC_FAILURE_MESSAGE);
    } finally {
      setRemoving(false);
      setPendingRemoveId(null);
    }
  }

  return (
    <Page
      title="School Members"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            This shows everyone currently able to sign in to your school&rsquo;s records, with their
            roles. If someone has left the school or should no longer have access, remove them here.
            Their past records (learners they created, classes they taught, and so on) are kept --
            only their future access is revoked.
          </p>
        ) : undefined
      }
    >
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
        <ul className="device-list" aria-label="School members">
          {members.map((member) => {
            const isPending = pendingRemoveId === member.id;
            return (
              <li key={member.id} className="device-card">
                <div className="device-card-main">
                  <p className="device-card-name">{member.displayName}</p>
                  <p className="device-card-detail">{member.username}</p>
                  <p className="device-card-detail">
                    {member.roles.length > 0
                      ? member.roles.map(roleLabel).join(", ")
                      : "No role assigned yet"}
                  </p>
                </div>

                {isPending ? (
                  <div
                    className="device-card-confirm"
                    role="group"
                    aria-label={`Remove ${member.displayName}?`}
                  >
                    <p className="device-card-confirm-text">
                      Remove <strong>{member.displayName}</strong>? They will lose access to this
                      school&rsquo;s records right away. Their past records are kept -- only their
                      access is revoked, and they can be added back later if needed.
                    </p>
                    <div className="device-card-confirm-actions">
                      <button type="button" onClick={cancelRemove} aria-disabled={removing}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        onClick={() => confirmRemove(member)}
                        aria-disabled={removing}
                      >
                        {removing ? "Removing…" : "Yes, remove this member"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button-danger-secondary"
                    onClick={() => startRemove(member.id)}
                  >
                    Remove member
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
