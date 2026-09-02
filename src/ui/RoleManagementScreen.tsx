import { useEffect, useRef, useState } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import { ValidationError } from "../domain/errors";
import { GRANTABLE_ROLES, roleLabel, type GrantableRole } from "../domain/role";
import type { SchoolMember } from "../domain/school-member";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface RoleManagementScreenProps {
  schoolMemberService: SchoolMemberApplicationService;
}

/** Roles & Permissions milestone: the first UI able to grant or revoke a
 * role beyond Teacher for a colleague at all — `add_user_to_school` has
 * only ever granted Teacher automatically; this closes that disclosed
 * gap. Any authenticated school member may view this screen (matching
 * `list_school_members`'s reference-data convention, and this
 * codebase's "security must not rely on UI hiding" rule); the backend
 * alone enforces `ManageRoles` (School Head only) — a non-School-Head
 * sees the same controls and gets a generic error if they try. Teacher
 * is deliberately not shown as grantable/revocable here — it's the
 * automatic default every member already has.
 *
 * One badge-plus-selector row per member, not one table column per
 * `GRANTABLE_ROLES` entry — the 8-role taxonomy expansion (ADR-0065)
 * made a per-role column layout unworkable (9 grantable roles would
 * mean 9 columns). Each held role renders as a labeled "Revoke" button;
 * a `<select>` plus one "Grant" button offers whichever grantable roles
 * the member doesn't already hold. */
export function RoleManagementScreen({ schoolMemberService }: RoleManagementScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  /** The role selected in each member's "grant a role" picker, keyed by
   * member id — a plain object is fine here, this never needs to be
   * reactive beyond triggering the picker's own re-render. */
  const [selectedRole, setSelectedRole] = useState<Record<string, GrantableRole | "">>({});
  /** `${userId}:${role}` of the one grant/revoke currently in flight, if
   * any — disables only that specific button (via `aria-disabled` +
   * this guard, never plain `disabled`, so it never loses focus on
   * click — see the self-disabling-button fix this codebase already
   * applied everywhere else). */
  const [pendingKey, setPendingKey] = useState<string | null>(null);

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
        setLoadError("Could not load this school's members.");
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

  async function handleGrant(member: SchoolMember, role: GrantableRole) {
    const key = `${member.id}:${role}`;
    if (pendingKey) return;
    setError(null);
    setConfirmation(null);
    setPendingKey(key);
    try {
      await schoolMemberService.grantRole(member.id, role);
      setConfirmation(`${member.displayName} is now a ${roleLabel(role)}.`);
      setSelectedRole((prev) => ({ ...prev, [member.id]: "" }));
      load();
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : `Could not grant ${roleLabel(role)} to ${member.displayName}.`,
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function handleRevoke(member: SchoolMember, role: GrantableRole) {
    const key = `${member.id}:${role}`;
    if (pendingKey) return;
    setError(null);
    setConfirmation(null);
    setPendingKey(key);
    try {
      await schoolMemberService.revokeRole(member.id, role);
      setConfirmation(`${member.displayName} is no longer a ${roleLabel(role)}.`);
      load();
    } catch (err) {
      if (err instanceof ValidationError) {
        setError(err.message);
      } else if (String(err).includes("cannot_remove_last_school_head")) {
        setError(
          `${member.displayName} is the school's only School Head — grant School Head to someone else first.`,
        );
      } else {
        setError(`Could not remove ${roleLabel(role)} from ${member.displayName}.`);
      }
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section aria-label="Roles and Permissions">
      <h2 ref={headingRef} tabIndex={-1}>
        Roles and Permissions
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Every teacher already has the Teacher role. Grant a colleague another role for the
          responsibilities they hold at your school — only a School Head can make these changes.
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
        <Loading label="Loading this school's members…" />
      ) : loadError ? null : (
        <table>
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Roles</th>
              <th scope="col">Grant a role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const heldGrantable = GRANTABLE_ROLES.filter((role) => member.roles.includes(role));
              const availableToGrant = GRANTABLE_ROLES.filter(
                (role) => !member.roles.includes(role),
              );
              const picked = selectedRole[member.id] ?? "";

              return (
                <tr key={member.id}>
                  <th scope="row">{member.displayName}</th>
                  <td>
                    {heldGrantable.length === 0 ? (
                      "Teacher only"
                    ) : (
                      <ul className="role-badge-list">
                        {heldGrantable.map((role) => {
                          const key = `${member.id}:${role}`;
                          const busy = pendingKey === key;
                          return (
                            <li key={`revoke-${role}`}>
                              <button
                                type="button"
                                aria-disabled={busy}
                                onClick={() => {
                                  if (busy) return;
                                  void handleRevoke(member, role);
                                }}
                              >
                                {busy ? "Working…" : `Revoke ${roleLabel(role)}`}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                  <td>
                    {availableToGrant.length === 0 ? (
                      "Holds every grantable role"
                    ) : (
                      <div className="form-row">
                        <label className="visually-hidden" htmlFor={`grant-role-${member.id}`}>
                          Role to grant to {member.displayName}
                        </label>
                        <select
                          id={`grant-role-${member.id}`}
                          value={picked}
                          onChange={(event) =>
                            setSelectedRole((prev) => ({
                              ...prev,
                              [member.id]: event.target.value as GrantableRole | "",
                            }))
                          }
                        >
                          <option value="">Select a role</option>
                          {availableToGrant.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-disabled={!picked || pendingKey === `${member.id}:${picked}`}
                          onClick={() => {
                            if (!picked || pendingKey === `${member.id}:${picked}`) return;
                            void handleGrant(member, picked);
                          }}
                        >
                          {pendingKey === `${member.id}:${picked}` && picked ? "Working…" : "Grant"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
