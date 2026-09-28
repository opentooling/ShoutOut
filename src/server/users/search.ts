import type { Db } from "@/lib/db";
import { empty, sql } from "@/lib/sql";

export interface PersonSummary {
  id: string;
  name: string;
  email: string;
}

/** Escapes LIKE wildcards so user input matches literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Active colleagues whose name contains the query or whose email starts with it,
 * excluding the person searching. (Matching anywhere in the email would match
 * everyone on the company domain.)
 */
export function searchPeople(
  db: Db,
  viewerId: string,
  query: string,
  limit = 8,
  { includeSelf = false }: { includeSelf?: boolean } = {},
): Promise<PersonSummary[]> {
  const q = escapeLike(query.trim());
  return db.rows<PersonSummary>(sql`
    SELECT id, name, email FROM users
    WHERE active
      ${includeSelf ? empty : sql`AND id <> ${viewerId}`}
      ${q ? sql`AND (name ILIKE ${`%${q}%`} OR email ILIKE ${`${q}%`})` : empty}
    ORDER BY name ASC
    LIMIT ${limit}`);
}

export function findPerson(
  db: Db,
  id: string,
): Promise<(PersonSummary & { active: boolean }) | null> {
  return db.one(sql`SELECT id, name, email, active FROM users WHERE id = ${id}`);
}
