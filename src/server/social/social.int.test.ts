import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import {
  CARD_ID,
  createUser,
  OTHER_CARD_ID,
  OTHER_VALUE_ID,
  VALUE_ID,
  count,
} from "../../../test/factories";
import { getVisibleShoutout, listFeed, type FeedFilters } from "../shoutouts/feed";
import { sendShoutout } from "../shoutouts/send";
import { addComment, commentSchema, deleteComment, listComments } from "./comments";
import { toggleReaction } from "./reactions";

const config = { quarterlyBudget: 50, maxRecipients: 5 };

describe("reactions and comments (postgres)", () => {
  const db = useTestDb();

  async function setup() {
    const [alice, bob, carol] = await Promise.all(
      ["Alice", "Bob", "Carol"].map((name) => createUser(db, { name })),
    );
    const send = (visibility: "PUBLIC" | "PRIVATE", message = "Thanks!") =>
      sendShoutout(
        db,
        alice.id,
        { recipientIds: [bob.id], cardId: CARD_ID, valueIds: [VALUE_ID], message, visibility },
        config,
      );
    return {
      alice,
      bob,
      carol,
      publicOne: await send("PUBLIC"),
      privateOne: await send("PRIVATE"),
    };
  }

  describe("toggleReaction", () => {
    it("adds, counts and removes reactions", async () => {
      const { bob, carol, publicOne } = await setup();
      expect(await toggleReaction(db, bob.id, publicOne.id, "fire")).toEqual({ reacted: true });
      await toggleReaction(db, carol.id, publicOne.id, "fire");
      await toggleReaction(db, carol.id, publicOne.id, "party");

      const item = await getVisibleShoutout(db, bob.id, publicOne.id);
      expect(item?.reactions).toEqual([
        {
          key: "party",
          emoji: "🎉",
          label: "Celebrate",
          count: 1,
          reacted: false,
          names: ["Carol"],
        },
        {
          key: "fire",
          emoji: "🔥",
          label: "On fire",
          count: 2,
          reacted: true,
          names: ["Bob", "Carol"],
        },
      ]);

      expect(await toggleReaction(db, bob.id, publicOne.id, "fire")).toEqual({ reacted: false });
      expect(await count(db, "reactions")).toBe(2);
    });

    it("only allows known emoji on shoutouts the user can see", async () => {
      const { carol, publicOne, privateOne, bob } = await setup();
      await expect(toggleReaction(db, carol.id, publicOne.id, "poop")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(toggleReaction(db, carol.id, privateOne.id, "fire")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(toggleReaction(db, bob.id, privateOne.id, "fire")).resolves.toEqual({
        reacted: true,
      });
    });
  });

  describe("comments", () => {
    it("validates comment bodies", () => {
      expect(commentSchema.parse({ body: "  hi  " })).toEqual({ body: "hi" });
      expect(commentSchema.safeParse({ body: " " }).error?.issues[0].message).toBe(
        "Write a comment",
      );
      expect(commentSchema.safeParse({ body: "x".repeat(501) }).error?.issues[0].message).toBe(
        "Keep it to 500 characters or fewer",
      );
    });

    it("lets anyone who can see a shoutout comment, and authors delete their own", async () => {
      const { alice, bob, carol, publicOne, privateOne } = await setup();
      const t = (s: number) => new Date(Date.UTC(2026, 8, 17, 12, 0, s));
      const first = await addComment(db, carol.id, publicOne.id, "Well deserved!", t(1));
      await addComment(db, bob.id, publicOne.id, "Thank you 🙏", t(2));
      await addComment(db, bob.id, privateOne.id, "Private thanks back", t(3));

      await expect(addComment(db, carol.id, privateOne.id, "Sneaky")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const comments = await listComments(db, carol.id, publicOne.id);
      expect(comments.map((c) => [c.author.name, c.body, c.canDelete])).toEqual([
        ["Carol", "Well deserved!", true],
        ["Bob", "Thank you 🙏", false],
      ]);
      expect(await listComments(db, carol.id, privateOne.id)).toEqual([]);
      expect(await listComments(db, alice.id, privateOne.id)).toHaveLength(1);

      const feed = await listFeed(db, alice.id);
      expect(feed.items.map((i) => i.commentCount)).toEqual([1, 2]);

      await expect(deleteComment(db, bob.id, first.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await deleteComment(db, carol.id, first.id);
      await expect(deleteComment(db, carol.id, first.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(await listComments(db, carol.id, publicOne.id)).toHaveLength(1);
      expect((await getVisibleShoutout(db, alice.id, publicOne.id))?.commentCount).toBe(1);
    });

    it("rejects blank comments at the database level", async () => {
      const { bob, publicOne } = await setup();
      await expect(addComment(db, bob.id, publicOne.id, "   ")).rejects.toThrow();
    });
  });

  describe("feed filters", () => {
    it("filters by person, value, card, date range and text", async () => {
      const { alice, bob, carol } = await setup();
      const dave = await createUser(db, { name: "Dave" });
      const at = (day: number) => new Date(Date.UTC(2026, 8, day, 12));
      const make = (senderId: string, recipientId: string, day: number, extra: object = {}) =>
        sendShoutout(
          db,
          senderId,
          {
            recipientIds: [recipientId],
            cardId: CARD_ID,
            valueIds: [VALUE_ID],
            message: "Plain",
            visibility: "PUBLIC",
            ...extra,
          },
          config,
          at(day),
        );
      await make(carol.id, dave.id, 10, { message: "Unicorn work", valueIds: [OTHER_VALUE_ID] });
      await make(dave.id, bob.id, 12, { cardId: OTHER_CARD_ID });
      await make(bob.id, carol.id, 14);

      const messages = async (filters: FeedFilters) =>
        (await listFeed(db, alice.id, { filters })).items.map((i) => i.message).sort();

      expect(await messages({ personId: dave.id })).toHaveLength(2);
      expect(await messages({ valueId: OTHER_VALUE_ID })).toEqual(["Unicorn work"]);
      expect(await messages({ cardId: OTHER_CARD_ID })).toHaveLength(1);
      expect(await messages({ query: "UNICORN" })).toEqual(["Unicorn work"]);
      // Wildcards in the search box match literally.
      expect(await messages({ query: "%" })).toEqual([]);
      expect(await messages({ query: "_" })).toEqual([]);
      expect(await messages({ query: "  " })).toHaveLength(5);
      expect(await messages({ from: at(11), to: new Date(Date.UTC(2026, 8, 12)) })).toHaveLength(1);
      expect(await messages({ personId: dave.id, valueId: OTHER_VALUE_ID })).toEqual([
        "Unicorn work",
      ]);
    });
  });
});
