import { z } from "zod";
import { CARD_TONES } from "@/components/cards/designs";
import { ILLUSTRATION_NAMES } from "@/components/cards/illustrations";
import { pgErrorCode, type Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { DomainError } from "../errors";
import { recordAudit } from "./audit";
import { moveInOrder, type Direction } from "./ordering";

export const cardSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the card a title")
    .max(40, "Keep the title to 40 characters"),
  tagline: z
    .string()
    .trim()
    .min(1, "Add a short tagline")
    .max(60, "Keep the tagline to 60 characters"),
  illustration: z.enum(ILLUSTRATION_NAMES, { message: "Pick an illustration" }),
  tone: z.enum(CARD_TONES as [string, ...string[]], { message: "Pick a colour" }),
});

export const valueSchema = z.object({
  name: z.string().trim().min(1, "Give the value a name").max(40, "Keep the name to 40 characters"),
});

export type CardInput = z.output<typeof cardSchema>;

export interface CardRecord {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  illustration: string;
  tone: string;
  active: boolean;
  sortOrder: number;
}

export interface ValueRecord {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

const CARD_COLUMNS = sql`id, slug, title, tagline, illustration, tone, active, sort_order AS "sortOrder"`;
const VALUE_COLUMNS = sql`id, slug, name, active, sort_order AS "sortOrder"`;

/** "Above & Beyond!" -> "above-beyond" */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

async function uniqueSlug(
  taken: (slug: string) => Promise<boolean>,
  text: string,
): Promise<string> {
  const base = slugify(text);
  let slug = base;
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const UNIQUE_VIOLATION = "23505";

// ---- cards ----

export function getCard(db: Db, id: string) {
  return db.one<CardRecord>(sql`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ${id}`);
}

export function listAllCards(db: Db) {
  return db.rows<CardRecord & { uses: number }>(sql`
    SELECT ${CARD_COLUMNS},
      (SELECT COUNT(*)::int FROM shoutouts s WHERE s.card_id = cards.id AND s.deleted_at IS NULL) AS uses
    FROM cards ORDER BY sort_order ASC, title ASC`);
}

export async function createCard(db: Db, adminId: string, input: CardInput) {
  const slug = await uniqueSlug(
    async (s) => Boolean(await db.one(sql`SELECT 1 FROM cards WHERE slug = ${s}`)),
    input.title,
  );
  try {
    return await db.transaction(async (tx) => {
      const card = (await tx.one<CardRecord>(sql`
        INSERT INTO cards (slug, title, tagline, illustration, tone, sort_order)
        VALUES (${slug}, ${input.title}, ${input.tagline}, ${input.illustration}, ${input.tone},
          (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cards))
        RETURNING ${CARD_COLUMNS}`))!;
      await recordAudit(tx, {
        actorId: adminId,
        action: "card.created",
        targetType: "card",
        targetId: card.id,
        details: { title: card.title },
      });
      return card;
    });
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new DomainError("DUPLICATE", "A card with that title already exists", "title");
    }
    throw error;
  }
}

export async function updateCard(db: Db, adminId: string, id: string, input: CardInput) {
  try {
    return await db.transaction(async (tx) => {
      const card = await tx.one<CardRecord>(sql`
        UPDATE cards SET title = ${input.title}, tagline = ${input.tagline},
          illustration = ${input.illustration}, tone = ${input.tone}, updated_at = now()
        WHERE id = ${id}
        RETURNING ${CARD_COLUMNS}`);
      if (!card) throw new DomainError("NOT_FOUND", "That card doesn't exist");
      await recordAudit(tx, {
        actorId: adminId,
        action: "card.updated",
        targetType: "card",
        targetId: id,
        details: { ...input },
      });
      return card;
    });
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new DomainError("DUPLICATE", "A card with that title already exists", "title");
    }
    throw error;
  }
}

export async function moveCard(db: Db, adminId: string, id: string, direction: Direction) {
  return db.transaction(async (tx) => {
    const cards = await tx.rows<{ id: string }>(
      sql`SELECT id FROM cards ORDER BY sort_order ASC, title ASC FOR UPDATE`,
    );
    const moved = await moveInOrder(cards, id, direction, (cardId, sortOrder) =>
      tx.execute(sql`UPDATE cards SET sort_order = ${sortOrder} WHERE id = ${cardId}`),
    );
    if (moved) {
      await recordAudit(tx, {
        actorId: adminId,
        action: "card.moved",
        targetType: "card",
        targetId: id,
        details: { direction },
      });
    }
    return moved;
  });
}

export async function setCardActive(db: Db, adminId: string, id: string, active: boolean) {
  return db.transaction(async (tx) => {
    const card = await tx.one<CardRecord>(
      sql`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ${id} FOR UPDATE`,
    );
    if (!card) throw new DomainError("NOT_FOUND", "That card doesn't exist");
    if (!active && card.active) {
      const row = await tx.one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM cards WHERE active`,
      );
      if (row!.count <= 1) throw new DomainError("LAST_ACTIVE", "Keep at least one card available");
    }
    await tx.execute(sql`UPDATE cards SET active = ${active}, updated_at = now() WHERE id = ${id}`);
    await recordAudit(tx, {
      actorId: adminId,
      action: active ? "card.restored" : "card.retired",
      targetType: "card",
      targetId: id,
      details: { title: card.title },
    });
  });
}

// ---- values ----

export function listAllValues(db: Db) {
  return db.rows<ValueRecord & { uses: number }>(sql`
    SELECT ${VALUE_COLUMNS},
      (SELECT COUNT(*)::int FROM shoutout_values sv JOIN shoutouts s ON s.id = sv.shoutout_id
        WHERE sv.value_id = company_values.id AND s.deleted_at IS NULL) AS uses
    FROM company_values ORDER BY sort_order ASC, name ASC`);
}

export async function createValue(db: Db, adminId: string, name: string) {
  const slug = await uniqueSlug(
    async (s) => Boolean(await db.one(sql`SELECT 1 FROM company_values WHERE slug = ${s}`)),
    name,
  );
  try {
    return await db.transaction(async (tx) => {
      const value = (await tx.one<ValueRecord>(sql`
        INSERT INTO company_values (slug, name, sort_order)
        VALUES (${slug}, ${name}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM company_values))
        RETURNING ${VALUE_COLUMNS}`))!;
      await recordAudit(tx, {
        actorId: adminId,
        action: "value.created",
        targetType: "value",
        targetId: value.id,
        details: { name },
      });
      return value;
    });
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new DomainError("DUPLICATE", "A value with that name already exists", "name");
    }
    throw error;
  }
}

export async function renameValue(db: Db, adminId: string, id: string, name: string) {
  try {
    return await db.transaction(async (tx) => {
      const before = await tx.one<ValueRecord>(
        sql`SELECT ${VALUE_COLUMNS} FROM company_values WHERE id = ${id}`,
      );
      if (!before) throw new DomainError("NOT_FOUND", "That value doesn't exist");
      const value = (await tx.one<ValueRecord>(sql`
        UPDATE company_values SET name = ${name}, updated_at = now() WHERE id = ${id}
        RETURNING ${VALUE_COLUMNS}`))!;
      await recordAudit(tx, {
        actorId: adminId,
        action: "value.renamed",
        targetType: "value",
        targetId: id,
        details: { from: before.name, to: name },
      });
      return value;
    });
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new DomainError("DUPLICATE", "A value with that name already exists", "name");
    }
    throw error;
  }
}

export async function moveValue(db: Db, adminId: string, id: string, direction: Direction) {
  return db.transaction(async (tx) => {
    const values = await tx.rows<{ id: string }>(
      sql`SELECT id FROM company_values ORDER BY sort_order ASC, name ASC FOR UPDATE`,
    );
    const moved = await moveInOrder(values, id, direction, (valueId, sortOrder) =>
      tx.execute(sql`UPDATE company_values SET sort_order = ${sortOrder} WHERE id = ${valueId}`),
    );
    if (moved) {
      await recordAudit(tx, {
        actorId: adminId,
        action: "value.moved",
        targetType: "value",
        targetId: id,
        details: { direction },
      });
    }
    return moved;
  });
}

export async function setValueActive(db: Db, adminId: string, id: string, active: boolean) {
  return db.transaction(async (tx) => {
    const value = await tx.one<ValueRecord>(
      sql`SELECT ${VALUE_COLUMNS} FROM company_values WHERE id = ${id} FOR UPDATE`,
    );
    if (!value) throw new DomainError("NOT_FOUND", "That value doesn't exist");
    if (!active && value.active) {
      const row = await tx.one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM company_values WHERE active`,
      );
      if (row!.count <= 1)
        throw new DomainError("LAST_ACTIVE", "Keep at least one value available");
    }
    await tx.execute(
      sql`UPDATE company_values SET active = ${active}, updated_at = now() WHERE id = ${id}`,
    );
    await recordAudit(tx, {
      actorId: adminId,
      action: active ? "value.restored" : "value.retired",
      targetType: "value",
      targetId: id,
      details: { name: value.name },
    });
  });
}
