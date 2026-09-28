import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "@/lib/sql";
import { useTestDb } from "../../../test/db";
import { CARD_ID, createUser, VALUE_ID } from "../../../test/factories";
import { exportLeaderboardsCsv } from "../admin/export";
import { exportPointsCsv, listPointsBalances } from "../admin/points";
import { ranksOnly, topPointsRecipients } from "../insights/leaderboard";
import { periodRange } from "../insights/periods";
import { getPointsBalance, getPointsBudget } from "./budget";
import { getVisibleShoutout, listFeed } from "./feed";
import { deleteShoutout } from "./manage";
import { sendShoutout } from "./send";

const now = new Date("2026-09-17T12:00:00Z");
const lastQuarter = new Date("2026-06-10T12:00:00Z");
const points = { enabled: true, quarterlyBudget: 50, choices: [5, 10, 25] };
const config = { quarterlyBudget: 3, points };

describe("points (postgres)", () => {
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
    amount: number,
    {
      at = now,
      settings = config,
    }: { at?: Date; settings?: Parameters<typeof sendShoutout>[3] } = {},
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
        points: amount,
      },
      settings,
      at,
    );
  }

  describe("sending", () => {
    it("gives each recipient the amount and uses it from the sender's budget", async () => {
      const { alice, bob, carol } = await people();
      const shoutout = await send(alice.id, [bob.id, carol.id], 10);
      expect(shoutout.points).toBe(10);
      expect(await getPointsBudget(db, alice.id, 50, now)).toMatchObject({
        used: 20,
        remaining: 30,
        resetsAt: new Date("2026-10-01T00:00:00Z"),
      });
      // Points given last quarter don't count against this one.
      await send(alice.id, [bob.id], 25, { at: lastQuarter });
      expect((await getPointsBudget(db, alice.id, 50, now)).remaining).toBe(30);
    });

    it("rejects points outside the choices, over the budget, or when points mode is off", async () => {
      const { alice, bob, carol } = await people();
      await expect(send(alice.id, [bob.id], 7)).rejects.toMatchObject({
        code: "INVALID_POINTS",
        field: "points",
        message: "Pick one of 5, 10, 25 points",
      });
      await expect(
        send(alice.id, [bob.id], 5, { settings: { quarterlyBudget: 3 } }),
      ).rejects.toMatchObject({ code: "INVALID_POINTS", message: "Points can't be given" });
      await expect(
        send(alice.id, [bob.id], 5, {
          settings: { ...config, points: { ...points, enabled: false } },
        }),
      ).rejects.toMatchObject({ code: "INVALID_POINTS" });

      await send(alice.id, [bob.id], 25);
      await expect(send(alice.id, [bob.id, carol.id], 25)).rejects.toMatchObject({
        code: "POINTS_EXCEEDED",
        field: "points",
        message: "That needs 50 points, but you only have 25 left this quarter",
      });
      // No points is always fine, and nothing was recorded for the failed sends.
      await send(alice.id, [carol.id], 0);
      expect((await getPointsBudget(db, alice.id, 50, now)).used).toBe(25);
    });

    it("sends without limit when the shoutout budget is off", async () => {
      const { alice, bob } = await people();
      const unlimited = { ...config, budgetEnabled: false };
      for (let i = 0; i < 5; i++) await send(alice.id, [bob.id], 0, { settings: unlimited });
      await expect(send(alice.id, [bob.id], 0)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    });

    it("refunds points when a shoutout is deleted", async () => {
      const { alice, bob } = await people();
      const shoutout = await send(alice.id, [bob.id], 25);
      await deleteShoutout(db, alice.id, shoutout.id, now);
      expect((await getPointsBudget(db, alice.id, 50, now)).remaining).toBe(50);
      expect((await getPointsBalance(db, bob.id, now)).balance).toBe(0);
    });
  });

  describe("balances", () => {
    it("counts points received from visible shoutouts only", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, [bob.id], 10);
      await send(carol.id, [bob.id], 25, { at: lastQuarter });
      const hidden = await send(carol.id, [bob.id], 5);
      await db.execute(
        sql`UPDATE shoutouts SET moderation_status = 'HIDDEN' WHERE id = ${hidden.id}`,
      );
      expect(await getPointsBalance(db, bob.id, now)).toEqual({
        balance: 35,
        receivedThisQuarter: 10,
      });
      expect(await getPointsBalance(db, alice.id, now)).toEqual({
        balance: 0,
        receivedThisQuarter: 0,
      });
    });

    it("lists everyone who gave or received points for admins, with a CSV", async () => {
      const { alice, bob, carol, dave } = await people();
      await send(alice.id, [bob.id, carol.id], 10);
      await send(carol.id, [bob.id], 25, { at: lastQuarter });
      await send(dave.id, [alice.id], 0);

      const rows = await listPointsBalances(db, now);
      expect(
        rows.map((r) => [r.name, r.balance, r.receivedThisQuarter, r.givenThisQuarter]),
      ).toEqual([
        ["Bob", 35, 10, 0],
        ["Carol", 10, 10, 0],
        ["Alice", 0, 0, 20],
      ]);

      const csv = (await exportPointsCsv(db, now)).trim().split("\r\n");
      expect(csv[0]).toBe(
        "name,email,active,points_balance,points_received_this_quarter,points_given_this_quarter",
      );
      expect(csv[1]).toBe(`Bob,${bob.email},true,35,10,0`);
      expect(csv).toHaveLength(4);
    });
  });

  describe("leaderboard", () => {
    it("ranks people by points received in the period, visible shoutouts only", async () => {
      const { alice, bob, carol, dave } = await people();
      await send(alice.id, [bob.id, carol.id], 10);
      await send(dave.id, [carol.id], 25);
      await send(alice.id, [dave.id], 25, { at: lastQuarter });
      const hidden = await send(dave.id, [bob.id], 25);
      await db.execute(
        sql`UPDATE shoutouts SET moderation_status = 'HIDDEN' WHERE id = ${hidden.id}`,
      );
      await send(carol.id, [alice.id], 0);

      const quarter = await topPointsRecipients(db, periodRange("quarter", now), 1, bob.id);
      expect(quarter.entries).toEqual([{ id: carol.id, name: "Carol", count: 35, rank: 1 }]);
      expect(quarter.viewer).toEqual({ id: bob.id, name: "Bob", count: 10, rank: 2 });
      expect(quarter.max).toBe(35);

      const all = await topPointsRecipients(db, periodRange("all", now));
      expect(all.entries.map((e) => [e.name, e.count])).toEqual([
        ["Carol", 35],
        ["Dave", 25],
        ["Bob", 10],
      ]);

      const hiddenCounts = ranksOnly(quarter);
      expect(hiddenCounts).toEqual({
        entries: [{ id: carol.id, name: "Carol", count: 0, rank: 1 }],
        viewer: { id: bob.id, name: "Bob", count: 0, rank: 2 },
        max: 0,
      });
      expect(ranksOnly({ entries: [], viewer: null, max: 0 }).viewer).toBeNull();

      const csv = (await exportLeaderboardsCsv(db, "all", now, { points: true })).trim();
      expect(csv).toContain("All time,Most points received,1,Carol,35,points received");
      expect(await exportLeaderboardsCsv(db, "all", now)).not.toContain("points received");
    });
  });

  describe("who sees the amount", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("shows no points anywhere while points mode is off", async () => {
      vi.stubEnv("SHOUTOUT_POINTS_ENABLED", "false");
      const { alice, bob } = await people();
      const shoutout = await send(alice.id, [bob.id], 10);
      expect(
        (await getVisibleShoutout(db, alice.id, shoutout.id, now, { admin: true }))!.points,
      ).toBeNull();
    });

    it("shows points to the sender, the recipients and admins only", async () => {
      vi.stubEnv("SHOUTOUT_POINTS_ENABLED", "true");
      const { alice, bob, carol, dave } = await people();
      const shoutout = await send(alice.id, [bob.id, carol.id], 10);
      const plain = await send(alice.id, [bob.id], 0);

      const pointsFor = async (viewerId: string, admin = false) =>
        (await getVisibleShoutout(db, viewerId, shoutout.id, now, { admin }))!.points;
      expect(await pointsFor(alice.id)).toBe(10);
      expect(await pointsFor(bob.id)).toBe(10);
      expect(await pointsFor(carol.id)).toBe(10);
      expect(await pointsFor(dave.id)).toBeNull();
      expect(await pointsFor(dave.id, true)).toBe(10);
      expect((await getVisibleShoutout(db, alice.id, plain.id, now))!.points).toBeNull();

      const feed = await listFeed(db, dave.id, { now });
      expect(feed.items.every((item) => item.points === null)).toBe(true);
      const adminFeed = await listFeed(db, dave.id, { now, admin: true });
      expect(adminFeed.items.find((item) => item.id === shoutout.id)!.points).toBe(10);
    });
  });
});
