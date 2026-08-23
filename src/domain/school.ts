/**
 * A school is the top-level data-isolation scope: every other record in
 * the working database is owned by exactly one school.
 */
export interface School {
  id: string;
  name: string;
  createdAt: string;
}
