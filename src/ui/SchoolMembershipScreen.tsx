import { useEffect, useRef, useState } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import { SCHOOL_MEMBER_ROLES, type SchoolMember } from "../domain/school-member";
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

/** Matches `GENERIC_FAILURE_MESSAGE`'s shape for role revocation --
 * `auth::revoke_school_member_role`'s own fail-closed cases (unknown
 * target, wrong school, last-School-Head-role guard) are also
 * deliberately collapsed into one message here. */
const GENERIC_ROLE_REVOKE_FAILURE_MESSAGE =
  "Could not remove this role. It may already be gone, removing it may leave the school without a School Head, or you may not have permission to change roles.";

const GENERIC_ROLE_GRANT_FAILURE_MESSAGE =
  "Could not grant this role. The member may no longer be part of this school, or you may not have permission to change roles.";

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
 * School Membership Removal + Role Management: lets a School Head see
 * every member of their school with their roles, revoke a member's
 * access entirely, and grant or revoke individual roles for a member
 * who stays -- e.g. promoting a Teacher to also hold Registrar, or
 * stepping someone down from School Head. Any authenticated school
 * member sees the same list (matching `AdminPasswordResetScreen`'s and
 * `DeviceManagementScreen`'s established convention of not hiding a
 * screen behind client-side role checks); the backend alone enforces
 * that these actions only succeed for a School Head holding
 * `ManageSchoolMembership` in their own school -- security must not
 * rely on UI hiding.
 *
 * Removing a member, and revoking a role that would leave them with no
 * role at all (including the school's own last School Head role), are
 * two-step, plain-language confirmations, not a single click or a
 * browser `confirm()` dialog -- matching `DeviceManagementScreen`'s
 * established "no unexplained destructive action" convention. Granting
 * an additional role is additive and reversible (a mistake is simply
 * revoked again), so it only needs a deliberate picker + confirm step,
 * not that heavier two-step confirmation.
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

  // Role-grant picker state: which member's picker is open, and the
  // role currently selected in it.
  const [grantOpenForId, setGrantOpenForId] = useState<string | null>(null);
  const [grantRoleChoice, setGrantRoleChoice] = useState<string>(SCHOOL_MEMBER_ROLES[0]);
  const [granting, setGranting] = useState(false);

  // Role-revoke confirmation state: which member+role is pending a
  // destructive-confirmation step (only used when revoking would leave
  // the member with no role at all).
  const [pendingRevoke, setPendingRevoke] = useState<{ memberId: string; role: string } | null>(
    null,
  );
  const [revokingRole, setRevokingRole] = useState(false);

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

  function startGrant(member: SchoolMember) {
    setError(null);
    setConfirmation(null);
    const availableRole = SCHOOL_MEMBER_ROLES.find((role) => !member.roles.includes(role));
    setGrantRoleChoice(availableRole ?? SCHOOL_MEMBER_ROLES[0]);
    setGrantOpenForId(member.id);
  }

  function cancelGrant() {
    setGrantOpenForId(null);
  }

  async function confirmGrant(member: SchoolMember) {
    if (granting) return;
    setError(null);
    setConfirmation(null);
    setGranting(true);
    try {
      const succeeded = await schoolMemberService.grantRole(member.id, grantRoleChoice);
      if (succeeded) {
        setConfirmation(
          `${member.displayName} was granted the ${roleLabel(grantRoleChoice)} role.`,
        );
        setMembers((current) =>
          current.map((m) =>
            m.id === member.id && !m.roles.includes(grantRoleChoice)
              ? { ...m, roles: [...m.roles, grantRoleChoice].sort() }
              : m,
          ),
        );
        setGrantOpenForId(null);
      } else {
        setError(GENERIC_ROLE_GRANT_FAILURE_MESSAGE);
      }
    } catch {
      setError(GENERIC_ROLE_GRANT_FAILURE_MESSAGE);
    } finally {
      setGranting(false);
    }
  }

  /** A role revocation that would leave the member with no role at all
   * (including revoking a school's only School Head's own School Head
   * role) needs the same destructive-confirmation step `startRemove`
   * uses -- defense in depth alongside the backend's own fail-closed
   * guard, matching this codebase's "security must not rely on UI
   * hiding" principle by still relying on the backend as the real
   * protection, never skipping the call. Revoking one of several roles
   * a member holds is reversible and low-stakes, so it applies
   * immediately without an extra step. */
  async function handleRevoke(member: SchoolMember, role: string) {
    setError(null);
    setConfirmation(null);
    const wouldLeaveNoRoles = member.roles.length === 1 && member.roles[0] === role;
    if (wouldLeaveNoRoles && pendingRevoke?.memberId !== member.id) {
      setPendingRevoke({ memberId: member.id, role });
      return;
    }
    if (revokingRole) return;
    setRevokingRole(true);
    try {
      const succeeded = await schoolMemberService.revokeRole(member.id, role);
      if (succeeded) {
        setConfirmation(`${roleLabel(role)} was removed from ${member.displayName}.`);
        setMembers((current) =>
          current.map((m) =>
            m.id === member.id ? { ...m, roles: m.roles.filter((r) => r !== role) } : m,
          ),
        );
      } else {
        setError(GENERIC_ROLE_REVOKE_FAILURE_MESSAGE);
      }
    } catch {
      setError(GENERIC_ROLE_REVOKE_FAILURE_MESSAGE);
    } finally {
      setRevokingRole(false);
      setPendingRevoke(null);
    }
  }

  function cancelRevoke() {
    setPendingRevoke(null);
  }

  return (
    <Page
      title="School Members"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            This shows everyone currently able to sign in to your school&rsquo;s records, with their
            roles. You can grant an additional role, remove a single role, or remove someone
            entirely if they have left the school. Their past records (learners they created,
            classes they taught, and so on) are kept -- only access changes.
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
            const isPendingRemove = pendingRemoveId === member.id;
            const isGrantOpen = grantOpenForId === member.id;
            const grantableRoles = SCHOOL_MEMBER_ROLES.filter(
              (role) => !member.roles.includes(role),
            );
            return (
              <li key={member.id} className="device-card">
                <div className="device-card-main">
                  <p className="device-card-name">{member.displayName}</p>
                  <p className="device-card-detail">{member.username}</p>
                  {member.roles.length > 0 ? (
                    <ul aria-label={`${member.displayName}'s roles`}>
                      {member.roles.map((role) => {
                        const isPendingRevokeForThisRole =
                          pendingRevoke?.memberId === member.id && pendingRevoke.role === role;
                        return (
                          <li key={role} className="device-card-detail">
                            {roleLabel(role)}{" "}
                            {isPendingRevokeForThisRole ? (
                              <span role="group" aria-label={`Remove ${roleLabel(role)} role?`}>
                                <span>Remove this role? </span>
                                <button
                                  type="button"
                                  onClick={cancelRevoke}
                                  aria-disabled={revokingRole}
                                >
                                  Cancel
                                </button>{" "}
                                <button
                                  type="button"
                                  className="button-danger"
                                  onClick={() => handleRevoke(member, role)}
                                  aria-disabled={revokingRole}
                                >
                                  {revokingRole ? "Removing…" : "Yes, remove this role"}
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="button-danger-secondary"
                                onClick={() => handleRevoke(member, role)}
                                aria-disabled={revokingRole}
                                aria-label={`Remove ${roleLabel(role)} role from ${member.displayName}`}
                              >
                                Remove role
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="device-card-detail">No role assigned yet</p>
                  )}
                </div>

                {isGrantOpen ? (
                  <div
                    className="device-card-confirm"
                    role="group"
                    aria-label={`Grant a role to ${member.displayName}?`}
                  >
                    <label>
                      Role to grant
                      <select
                        value={grantRoleChoice}
                        onChange={(e) => setGrantRoleChoice(e.target.value)}
                        disabled={granting}
                      >
                        {grantableRoles.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="device-card-confirm-actions">
                      <button type="button" onClick={cancelGrant} aria-disabled={granting}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmGrant(member)}
                        aria-disabled={granting || grantableRoles.length === 0}
                      >
                        {granting ? "Granting…" : "Grant role"}
                      </button>
                    </div>
                  </div>
                ) : (
                  grantableRoles.length > 0 && (
                    <button type="button" onClick={() => startGrant(member)}>
                      Grant a role
                    </button>
                  )
                )}

                {isPendingRemove ? (
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
