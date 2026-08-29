/**
 * A colleague within the caller's own school -- just enough for a
 * School Head to pick a teacher when creating a Teaching Assignment
 * (Wave 2Y). `roles` may be empty (a member with no role grant yet).
 */
export interface SchoolMember {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}
