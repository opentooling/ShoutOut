import { sql } from "@/lib/sql";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import {
  CARD_ID,
  createUser,
  OTHER_CARD_ID,
  OTHER_VALUE_ID,
  VALUE_ID,
  count,
  findShoutoutState,
  setCatalogActive,
} from "../../../test/factories";
import { getBudget } from "./budget";
import { listActiveCards, listActiveValues } from "./catalog";
import { getVisibleShoutout, listFeed } from "./feed";
import { canModify, deleteShoutout, EDIT_WINDOW_MS, updateShoutout } from "./manage";
import { sendShoutout } from "./send";

const config = { quarterlyBudget: 3, maxRecipients: 5 };
const now = new Date("2026-09-17T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

describe("shoutouts (postgres)", () => {
  const db = useTestDb();

  async function people() {
    const [alice, bob, carol, dave] = await Promise.all(
      ["Alice", "Bob", "Carol", "Dave"].map((name) => createUser(db, { name })),
    );
    return { alice, bob, carol, dave };
  }

  function send(
    senderId: string,
    recipientIds: string[],
    extra: Partial<Parameters<typeof sendShoutout>[2]> = {},
    at = now,
    budget = config.quarterlyBudget,
  ) {
    return sendShoutout(
      db,
      senderId,
      {
        recipientIds,
        cardId: CARD_ID,
        valueIds: [VALUE_ID],
        message: "Thanks!",
        visibility: "PUBLIC",
        ...extra,
      },
      { ...config, quarterlyBudget: budget },
      at,
    );
  }

  describe("catalogue", () => {
    it("lists the seeded active cards and values in order", async () => {
      const cards = await listActiveCards(db);
      expect(cards).toHaveLength(10);
      expect(cards[0]).toMatchObject({ slug: "thank-you", illustration: "heart", tone: "coral" });
      await setCatalogActive(db, "company_values", false, { only: "value_diversity" });
      expect((await listActiveValues(db)).map((v) => v.name)).toEqual([
        "Integrity",
        "Excellence",
        "Collaboration",
        "Engagement",
      ]);
    });
  });

  describe("sendShoutout", () => {
    it("creates a shoutout for each recipient and uses budget", async () => {
      const { alice, bob, carol } = await people();
      const shoutout = await send(alice.id, [bob.id, carol.id, bob.id]);
      expect(shoutout).toMatchObject({
        senderId: alice.id,
        message: "Thanks!",
        visibility: "PUBLIC",
      });
      expect(await count(db, "shoutout_recipients", sql`shoutout_id = ${shoutout.id}`)).toBe(2);
      expect(await getBudget(db, alice.id, 3, now)).toEqual({
        allowance: 3,
        used: 2,
        remaining: 1,
        resetsAt: new Date("2026-10-01T00:00:00Z"),
      });
    });

    it("rejects sending to yourself", async () => {
      const { alice, bob } = await people();
      await expect(send(alice.id, [bob.id, alice.id])).rejects.toMatchObject({
        code: "SELF_RECIPIENT",
        field: "recipientIds",
      });
    });

    it("rejects unknown or inactive recipients, cards and values", async () => {
      const { alice, bob } = await people();
      const inactive = await createUser(db, { name: "Gone", active: false });
      await expect(send(alice.id, [bob.id, inactive.id])).rejects.toMatchObject({
        code: "RECIPIENT_NOT_FOUND",
      });
      await expect(send(alice.id, ["nobody"])).rejects.toMatchObject({
        code: "RECIPIENT_NOT_FOUND",
      });
      await expect(send(alice.id, [bob.id], { cardId: "nope" })).rejects.toMatchObject({
        code: "CARD_NOT_FOUND",
      });
      await setCatalogActive(db, "company_values", false, { only: VALUE_ID });
      await expect(send(alice.id, [bob.id])).rejects.toMatchObject({ code: "VALUE_NOT_FOUND" });
    });

    it("enforces the quarterly budget and resets next quarter", async () => {
      const { alice, bob, carol, dave } = await people();
      await send(alice.id, [bob.id, carol.id]);
      await expect(send(alice.id, [carol.id, dave.id])).rejects.toMatchObject({
        code: "BUDGET_EXCEEDED",
        message: "You only have 1 shoutout left this quarter",
      });
      await send(alice.id, [dave.id]);
      await expect(send(alice.id, [bob.id])).rejects.toMatchObject({
        message: "You've used all your shoutouts this quarter",
      });
      const nextQuarter = new Date("2026-10-01T00:00:00Z");
      await expect(send(alice.id, [bob.id], {}, nextQuarter)).resolves.toBeDefined();
      expect((await getBudget(db, alice.id, 5, now)).remaining).toBe(2);
    });

    it("pluralises the remaining budget", async () => {
      const { alice, bob, carol, dave } = await people();
      await send(alice.id, [bob.id, carol.id], {}, now, 4);
      await expect(send(alice.id, [bob.id, carol.id, dave.id], {}, now, 4)).rejects.toMatchObject({
        message: "You only have 2 shoutouts left this quarter",
      });
    });

    it("never overspends when sends race", async () => {
      const { alice, bob, carol, dave } = await people();
      const results = await Promise.allSettled([
        send(alice.id, [bob.id, carol.id]),
        send(alice.id, [carol.id, dave.id]),
        send(alice.id, [bob.id, dave.id]),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await getBudget(db, alice.id, 3, now)).used).toBe(2);
    });

    it("rejects blank messages at the database level", async () => {
      const { alice, bob } = await people();
      await expect(send(alice.id, [bob.id], { message: "   " })).rejects.toThrow();
    });
  });

  describe("updating and deleting", () => {
    it("lets the sender edit within 24 hours", async () => {
      const { alice, bob } = await people();
      const shoutout = await send(alice.id, [bob.id]);
      const updated = await updateShoutout(
        db,
        alice.id,
        shoutout.id,
        {
          cardId: OTHER_CARD_ID,
          valueIds: [OTHER_VALUE_ID],
          message: "Even better",
          visibility: "PRIVATE",
        },
        later(EDIT_WINDOW_MS),
      );
      expect(updated).toMatchObject({
        cardId: OTHER_CARD_ID,
        message: "Even better",
        visibility: "PRIVATE",
        editedAt: later(EDIT_WINDOW_MS),
      });
    });

    it("keeps several values in the order picked, and edits them", async () => {
      const { alice, bob } = await people();
      const shoutout = await send(alice.id, [bob.id], {
        valueIds: [OTHER_VALUE_ID, VALUE_ID, OTHER_VALUE_ID],
      });
      const names = async () =>
        (await getVisibleShoutout(db, alice.id, shoutout.id, now))!.values.map((v) => v.name);
      expect(await names()).toEqual(["Collaboration", "Integrity"]);

      await updateShoutout(
        db,
        alice.id,
        shoutout.id,
        {
          cardId: CARD_ID,
          valueIds: [VALUE_ID, "value_excellence"],
          message: "Thanks",
          visibility: "PUBLIC",
        },
        now,
      );
      expect(await names()).toEqual(["Integrity", "Excellence"]);
      await expect(
        send(alice.id, [bob.id], { valueIds: [VALUE_ID, "value_missing"] }),
      ).rejects.toMatchObject({ code: "VALUE_NOT_FOUND", field: "valueIds" });
    });

    it("keeps a retired card or value but won't switch to one", async () => {
      const { alice, bob } = await people();
      const shoutout = await send(alice.id, [bob.id]);
      await setCatalogActive(db, "cards", false, { only: CARD_ID });
      await setCatalogActive(db, "company_values", false, { only: VALUE_ID });
      const edit = {
        cardId: CARD_ID,
        valueIds: [VALUE_ID],
        message: "Still thanks",
        visibility: "PUBLIC" as const,
      };
      await expect(updateShoutout(db, alice.id, shoutout.id, edit, now)).resolves.toMatchObject({
        message: "Still thanks",
      });

      await setCatalogActive(db, "cards", false, { only: OTHER_CARD_ID });
      await expect(
        updateShoutout(db, alice.id, shoutout.id, { ...edit, cardId: OTHER_CARD_ID }, now),
      ).rejects.toMatchObject({ code: "CARD_NOT_FOUND" });
      await setCatalogActive(db, "company_values", false, { only: OTHER_VALUE_ID });
      await expect(
        updateShoutout(db, alice.id, shoutout.id, { ...edit, valueIds: [OTHER_VALUE_ID] }, now),
      ).rejects.toMatchObject({ code: "VALUE_NOT_FOUND" });
    });

    it("blocks other people, missing shoutouts and the closed edit window", async () => {
      const { alice, bob } = await people();
      const shoutout = await send(alice.id, [bob.id]);
      const edit = {
        cardId: CARD_ID,
        valueIds: [VALUE_ID],
        message: "x",
        visibility: "PUBLIC" as const,
      };
      await expect(updateShoutout(db, bob.id, shoutout.id, edit, now)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(updateShoutout(db, alice.id, "missing", edit, now)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        deleteShoutout(db, alice.id, shoutout.id, later(EDIT_WINDOW_MS + 1)),
      ).rejects.toMatchObject({ code: "EDIT_WINDOW_CLOSED" });
    });

    it("soft-deletes and refunds the budget", async () => {
      const { alice, bob, carol } = await people();
      const shoutout = await send(alice.id, [bob.id, carol.id]);
      await deleteShoutout(db, alice.id, shoutout.id, later(1000));
      expect((await findShoutoutState(db, shoutout.id))?.deletedAt).toEqual(later(1000));
      expect((await getBudget(db, alice.id, 3, now)).used).toBe(0);
      await expect(deleteShoutout(db, alice.id, shoutout.id, later(2000))).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("canModify covers deleted, other people and time", () => {
      const s = { senderId: "a", createdAt: now, deletedAt: null };
      expect(canModify(s, "a", now)).toBe(true);
      expect(canModify({ senderId: "a", createdAt: now }, "a", now)).toBe(true);
      expect(canModify(s, "b", now)).toBe(false);
      expect(canModify({ ...s, deletedAt: now }, "a", now)).toBe(false);
      expect(canModify(s, "a", later(EDIT_WINDOW_MS + 1))).toBe(false);
      expect(canModify({ senderId: "a", createdAt: new Date() }, "a")).toBe(true);
    });
  });

  describe("feed", () => {
    it("shows public shoutouts to everyone and private ones only to those involved", async () => {
      const { alice, bob, carol, dave } = await people();
      const publicOne = await send(alice.id, [bob.id], { message: "Public thanks" });
      const privateOne = await send(
        alice.id,
        [carol.id],
        { message: "Private thanks", visibility: "PRIVATE" },
        later(1000),
      );
      const deleted = await send(bob.id, [carol.id], { message: "Deleted" }, later(2000));
      await deleteShoutout(db, bob.id, deleted.id, later(3000));

      const messages = async (viewerId: string) =>
        (await listFeed(db, viewerId, { now: later(5000) })).items.map((i) => i.message);

      expect(await messages(alice.id)).toEqual(["Private thanks", "Public thanks"]);
      expect(await messages(carol.id)).toEqual(["Private thanks", "Public thanks"]);
      expect(await messages(dave.id)).toEqual(["Public thanks"]);

      expect(await getVisibleShoutout(db, dave.id, privateOne.id)).toBeNull();
      const visible = await getVisibleShoutout(db, alice.id, publicOne.id, later(5000));
      expect(visible).toMatchObject({
        message: "Public thanks",
        card: { slug: "thank-you", title: "Thank You" },
        values: [{ name: "Integrity" }],
        sender: { id: alice.id, name: "Alice" },
        recipients: [{ id: bob.id, name: "Bob" }],
        canModify: true,
      });
      expect((await getVisibleShoutout(db, bob.id, publicOne.id))?.canModify).toBe(false);
    });

    it("pages newest first with a cursor", async () => {
      const { alice, bob } = await people();
      for (let i = 0; i < 5; i++) {
        await send(alice.id, [bob.id], { message: `Thanks ${i}` }, later(i * 1000), 10);
      }
      const first = await listFeed(db, bob.id, { limit: 2 });
      expect(first.items.map((i) => i.message)).toEqual(["Thanks 4", "Thanks 3"]);
      expect(first.nextCursor).toBe(first.items[1].id);
      const second = await listFeed(db, bob.id, { limit: 2, cursor: first.nextCursor! });
      expect(second.items.map((i) => i.message)).toEqual(["Thanks 2", "Thanks 1"]);
      const last = await listFeed(db, bob.id, { limit: 2, cursor: second.nextCursor! });
      expect(last.items.map((i) => i.message)).toEqual(["Thanks 0"]);
      expect(last.nextCursor).toBeNull();
      expect((await listFeed(db, bob.id)).items).toHaveLength(5);
    });
  });
});
