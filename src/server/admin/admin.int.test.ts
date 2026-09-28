import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import {
  CARD_ID,
  createUser,
  VALUE_ID,
  findShoutoutState,
  setCatalogActive,
} from "../../../test/factories";
import { getSummary } from "../insights/analytics";
import { topRecipients } from "../insights/leaderboard";
import { listComments } from "../social/comments";
import { getVisibleShoutout, listFeed } from "../shoutouts/feed";
import { deleteShoutout, updateShoutout } from "../shoutouts/manage";
import { sendShoutout } from "../shoutouts/send";
import { getProfile } from "../users/profile";
import { listAudit } from "./audit";
import {
  createCard,
  createValue,
  getCard,
  listAllCards,
  listAllValues,
  moveCard,
  moveValue,
  renameValue,
  setCardActive,
  setValueActive,
  updateCard,
} from "./catalog";
import { exportLeaderboardsCsv, exportPeopleCsv, exportShoutoutsCsv } from "./export";
import {
  countPendingCases,
  listPendingCases,
  listResolvedCases,
  reportSchema,
  reportShoutout,
  resolveCase,
} from "./moderation";

describe("admin (postgres)", () => {
  const db = useTestDb();

  async function people() {
    const [admin, alice, bob, carol] = await Promise.all(
      ["Admin", "Alice", "Bob", "Carol"].map((name) => createUser(db, { name })),
    );
    return { admin, alice, bob, carol };
  }

  const send = (
    senderId: string,
    recipientId: string,
    extra: { visibility?: "PUBLIC" | "PRIVATE"; message?: string; at?: Date } = {},
  ) =>
    sendShoutout(
      db,
      senderId,
      {
        recipientIds: [recipientId],
        cardId: CARD_ID,
        valueIds: [VALUE_ID],
        message: extra.message ?? "Thanks!",
        visibility: extra.visibility ?? "PUBLIC",
      },
      { quarterlyBudget: 100 },
      extra.at,
    );

  describe("moderation", () => {
    it("has an empty queue when nothing is reported", async () => {
      expect(await listPendingCases(db)).toEqual([]);
      expect(await listResolvedCases(db)).toEqual([]);
      expect(await countPendingCases(db)).toBe(0);
    });

    it("validates reports", () => {
      expect(reportSchema.parse({ reason: "SPAM", note: "  " })).toEqual({
        reason: "SPAM",
        note: undefined,
      });
      expect(reportSchema.safeParse({ reason: "BORING", note: "" }).error?.issues[0].message).toBe(
        "Pick a reason",
      );
      expect(reportSchema.safeParse({ reason: "OTHER", note: "x".repeat(501) }).success).toBe(
        false,
      );
    });

    it("hides a reported shoutout from everyone until an admin restores it", async () => {
      const { admin, alice, bob, carol } = await people();
      const shoutout = await send(alice.id, bob.id);
      await reportShoutout(db, carol.id, shoutout.id, { reason: "INAPPROPRIATE", note: "Not OK" });

      for (const viewer of [alice, bob, carol, admin]) {
        expect(await getVisibleShoutout(db, viewer.id, shoutout.id)).toBeNull();
        expect((await listFeed(db, viewer.id)).items).toHaveLength(0);
      }
      expect(await listComments(db, bob.id, shoutout.id)).toEqual([]);
      expect((await getProfile(db, carol.id, bob.id))?.received).toBe(0);
      expect((await getProfile(db, bob.id, bob.id))?.received).toBe(0);
      expect((await topRecipients(db, {})).entries).toEqual([]);
      expect(
        (await getSummary(db, { start: new Date(0), end: new Date(Date.now() + 1000) })).shoutouts,
      ).toBe(0);
      await expect(
        updateShoutout(db, alice.id, shoutout.id, {
          cardId: CARD_ID,
          valueIds: [VALUE_ID],
          message: "x",
          visibility: "PUBLIC",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // A second person can't report a hidden shoutout they can no longer see.
      await expect(
        reportShoutout(db, bob.id, shoutout.id, { reason: "SPAM" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(await countPendingCases(db)).toBe(1);
      const [pending] = await listPendingCases(db);
      expect(pending.status).toBe("HIDDEN");
      expect(pending.shoutout).toMatchObject({
        id: shoutout.id,
        message: "Thanks!",
        canReport: false,
      });
      expect(pending.reports).toMatchObject([
        { reason: "INAPPROPRIATE", note: "Not OK", reporter: { name: "Carol" }, resolvedAt: null },
      ]);

      await resolveCase(db, admin.id, shoutout.id, "RESTORED");
      expect(await getVisibleShoutout(db, carol.id, shoutout.id)).not.toBeNull();
      expect(await countPendingCases(db)).toBe(0);
      const [resolved] = await listResolvedCases(db);
      expect(resolved).toMatchObject({
        status: "VISIBLE",
        reports: [{ resolution: "RESTORED", resolvedBy: { name: "Admin" } }],
      });
      await expect(resolveCase(db, admin.id, shoutout.id, "REMOVED")).rejects.toMatchObject({
        code: "INVALID_STATE",
      });
    });

    it("removes reported shoutouts, including private ones admins otherwise can't see", async () => {
      const { admin, alice, bob } = await people();
      const privateOne = await send(alice.id, bob.id, {
        visibility: "PRIVATE",
        message: "Secret thanks",
      });
      await expect(
        reportShoutout(db, admin.id, privateOne.id, { reason: "SPAM" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        reportShoutout(db, alice.id, privateOne.id, { reason: "SPAM" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await reportShoutout(db, bob.id, privateOne.id, { reason: "OFFENSIVE" });
      await expect(
        reportShoutout(db, bob.id, privateOne.id, { reason: "SPAM" }),
      ).rejects.toMatchObject({ code: "ALREADY_REPORTED" });

      const [pending] = await listPendingCases(db);
      expect(pending.shoutout.message).toBe("Secret thanks");

      await resolveCase(db, admin.id, privateOne.id, "REMOVED");
      expect((await findShoutoutState(db, privateOne.id))?.moderationStatus).toBe("REMOVED");
      expect(await getVisibleShoutout(db, bob.id, privateOne.id)).toBeNull();
      await expect(deleteShoutout(db, alice.id, privateOne.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const audit = await listAudit(db);
      expect(audit.entries.map((e) => [e.action, e.actor.name])).toEqual([
        ["shoutout.removed", "Admin"],
        ["shoutout.reported", "Bob"],
      ]);
    });

    it("orders the queue by oldest report and pages the audit log", async () => {
      const { admin, alice, bob, carol } = await people();
      const first = await send(alice.id, bob.id, { message: "First" });
      const second = await send(alice.id, bob.id, { message: "Second" });
      await reportShoutout(
        db,
        carol.id,
        second.id,
        { reason: "SPAM" },
        new Date("2026-09-01T00:00:00Z"),
      );
      await reportShoutout(
        db,
        carol.id,
        first.id,
        { reason: "SPAM" },
        new Date("2026-09-02T00:00:00Z"),
      );
      expect((await listPendingCases(db)).map((c) => c.shoutout.message)).toEqual([
        "Second",
        "First",
      ]);
      await resolveCase(db, admin.id, first.id, "RESTORED");

      const page1 = await listAudit(db, { limit: 2 });
      expect(page1.entries).toHaveLength(2);
      const page2 = await listAudit(db, { limit: 2, cursor: page1.nextCursor! });
      expect(page2.entries).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe("cards", () => {
    it("creates, edits, reorders, retires and restores cards with an audit trail", async () => {
      const { admin } = await people();
      const card = await createCard(db, admin.id, {
        title: "High Five!",
        tagline: "Nice one",
        illustration: "buddies",
        tone: "sky",
      });
      expect(card).toMatchObject({ slug: "high-five", sortOrder: 11, active: true });
      expect(await getCard(db, card.id)).toEqual(card);
      expect(await getCard(db, "missing")).toBeNull();
      const again = await createCard(db, admin.id, {
        title: "HIGH FIVE!",
        tagline: "x",
        illustration: "heart",
        tone: "coral",
      }).catch((e) => e);
      expect(again).toMatchObject({ code: "DUPLICATE", field: "title" });
      const other = await createCard(db, admin.id, {
        title: "High-Five 2",
        tagline: "x",
        illustration: "heart",
        tone: "coral",
      });
      expect(other.slug).toBe("high-five-2");

      await updateCard(db, admin.id, card.id, {
        title: "Hi Five",
        tagline: "Great teamwork",
        illustration: "trophy",
        tone: "leaf",
      });
      await expect(
        updateCard(db, admin.id, card.id, {
          title: "thank you",
          tagline: "x",
          illustration: "heart",
          tone: "coral",
        }),
      ).rejects.toMatchObject({ code: "DUPLICATE" });
      await expect(
        updateCard(db, admin.id, "missing", {
          title: "Nope",
          tagline: "x",
          illustration: "heart",
          tone: "coral",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(await moveCard(db, admin.id, card.id, "up")).toBe(true);
      let cards = await listAllCards(db);
      expect(cards.map((c) => c.title).slice(-3)).toEqual(["Hi Five", "Crushed It", "High-Five 2"]);
      expect(await moveCard(db, admin.id, cards[0].id, "up")).toBe(false);
      expect(await moveCard(db, admin.id, cards[cards.length - 1].id, "down")).toBe(false);
      expect(await moveCard(db, admin.id, "missing", "down")).toBe(false);
      expect(cards.map((c) => c.sortOrder)).toEqual(cards.map((_, i) => i + 1));

      await setCardActive(db, admin.id, card.id, false);
      cards = await listAllCards(db);
      expect(cards.find((c) => c.id === card.id)).toMatchObject({ active: false, uses: 0 });
      await setCardActive(db, admin.id, card.id, true);
      await expect(setCardActive(db, admin.id, "missing", false)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const actions = (await listAudit(db)).entries.map((e) => e.action);
      expect(actions).toEqual([
        "card.restored",
        "card.retired",
        "card.moved",
        "card.updated",
        "card.created",
        "card.created",
      ]);
    });

    it("keeps at least one card and counts uses", async () => {
      const { admin, alice, bob } = await people();
      await send(alice.id, bob.id);
      await setCatalogActive(db, "cards", false, { except: CARD_ID });
      await expect(setCardActive(db, admin.id, CARD_ID, false)).rejects.toMatchObject({
        code: "LAST_ACTIVE",
      });
      expect((await listAllCards(db)).find((c) => c.id === CARD_ID)?.uses).toBe(1);
      // Retiring an already-retired card is allowed.
      await expect(setCardActive(db, admin.id, "card_mentor", false)).resolves.toBeUndefined();
    });
  });

  describe("values", () => {
    it("creates, renames, reorders, retires and restores values", async () => {
      const { admin } = await people();
      const value = await createValue(db, admin.id, "Kindness");
      expect(value).toMatchObject({ slug: "kindness", sortOrder: 6 });
      await expect(createValue(db, admin.id, "INTEGRITY")).rejects.toMatchObject({
        code: "DUPLICATE",
        field: "name",
      });
      await renameValue(db, admin.id, value.id, "Kindness & Care");
      await expect(renameValue(db, admin.id, value.id, "diversity")).rejects.toMatchObject({
        code: "DUPLICATE",
      });
      await expect(renameValue(db, admin.id, "missing", "Anything")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      expect(await moveValue(db, admin.id, value.id, "up")).toBe(true);
      expect((await listAllValues(db)).map((v) => v.name)).toEqual([
        "Integrity",
        "Diversity",
        "Excellence",
        "Collaboration",
        "Kindness & Care",
        "Engagement",
      ]);
      expect(await moveValue(db, admin.id, VALUE_ID, "up")).toBe(false);

      await setValueActive(db, admin.id, value.id, false);
      await setValueActive(db, admin.id, value.id, true);
      await expect(setValueActive(db, admin.id, "missing", true)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await setCatalogActive(db, "company_values", false, { except: VALUE_ID });
      await expect(setValueActive(db, admin.id, VALUE_ID, false)).rejects.toMatchObject({
        code: "LAST_ACTIVE",
      });
      expect((await listAudit(db)).entries.map((e) => e.action).slice(0, 3)).toEqual([
        "value.restored",
        "value.retired",
        "value.moved",
      ]);
    });
  });

  describe("exports", () => {
    it("exports shoutouts without private messages or moderated ones", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, bob.id, {
        message: '=HYPERLINK("x"), "quoted"',
        at: new Date("2026-09-01T10:00:00Z"),
      });
      await send(alice.id, carol.id, {
        visibility: "PRIVATE",
        message: "Secret",
        at: new Date("2026-09-02T10:00:00Z"),
      });
      const reported = await send(bob.id, carol.id, {
        message: "Reported",
        at: new Date("2026-09-03T10:00:00Z"),
      });
      await reportShoutout(db, alice.id, reported.id, { reason: "SPAM" });
      await send(bob.id, alice.id, { message: "Old", at: new Date("2026-01-01T10:00:00Z") });

      const csv = await exportShoutoutsCsv(db, { start: new Date("2026-08-01T00:00:00Z") });
      const lines = csv.trim().split("\r\n");
      expect(lines[0]).toBe(
        "id,created_at,sender_name,sender_email,recipient_names,recipient_emails,recipient_count,card,values,visibility,message,points_per_recipient,reactions,comments,edited",
      );
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain(`,Alice,`);
      expect(lines[1]).toContain(`"'=HYPERLINK(""x""), ""quoted"""`);
      expect(lines[2]).toContain(",private,[private],0,0,0,false");
      expect(csv).not.toContain("Reported");
      expect(
        (await exportShoutoutsCsv(db, { end: new Date("2026-02-01T00:00:00Z") }))
          .trim()
          .split("\r\n"),
      ).toHaveLength(2);
      expect((await exportShoutoutsCsv(db, {})).trim().split("\r\n")).toHaveLength(4);
    });

    it("exports a per-person summary and full leaderboards", async () => {
      const { alice, bob, carol } = await people();
      const at = new Date();
      await send(alice.id, bob.id, { at });
      await send(alice.id, carol.id, { at });
      await send(carol.id, bob.id, { at });

      const people_ = (await exportPeopleCsv(db, {})).trim().split("\r\n");
      expect(people_[0]).toBe(
        "name,email,active,shoutouts_received,shoutouts_sent,colleagues_recognised,last_received_at,last_sent_at",
      );
      const bobRow = people_.find((l) => l.startsWith("Bob,"))!;
      expect(bobRow).toMatch(/^Bob,[^,]+,true,2,0,0,\d{4}-.*Z,$/);
      expect(people_.find((l) => l.startsWith("Alice,"))).toMatch(/,true,0,2,2,,\d{4}/);
      expect(people_).toHaveLength(5);

      const boards = (await exportLeaderboardsCsv(db, "all")).trim().split("\r\n");
      expect(boards).toEqual([
        "period,board,rank,name,count,unit",
        "All time,Most recognised,1,Bob,2,shoutouts received",
        "All time,Most recognised,2,Carol,1,shoutouts received",
        "All time,Top recognisers,1,Alice,2,colleagues recognised",
        "All time,Top recognisers,2,Carol,1,colleagues recognised",
        "All time,Top values,1,Integrity,3,shoutouts",
      ]);
      expect((await exportLeaderboardsCsv(db, "week")).split("\r\n").length).toBeGreaterThan(1);
    });
  });
});
