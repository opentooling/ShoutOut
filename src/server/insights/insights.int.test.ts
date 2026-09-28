import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import {
  CARD_ID,
  createUser,
  OTHER_CARD_ID,
  OTHER_VALUE_ID,
  VALUE_ID,
  setCatalogActive,
  setUserActive,
} from "../../../test/factories";
import { deleteShoutout } from "../shoutouts/manage";
import { sendShoutout } from "../shoutouts/send";
import {
  bucketStart,
  getCardBreakdown,
  getSummary,
  getTrend,
  getUnrecognised,
  getValueBreakdown,
} from "./analytics";
import { topRecipients, topSenders, topValues } from "./leaderboard";

const config = { quarterlyBudget: 100 };
const at = (month: number, day: number) => new Date(Date.UTC(2026, month - 1, day, 12));

describe("leaderboards and analytics (postgres)", () => {
  const db = useTestDb();

  async function seed() {
    const [alice, bob, carol, dave, erin] = await Promise.all(
      ["Alice", "Bob", "Carol", "Dave", "Erin"].map((name) => createUser(db, { name })),
    );
    // Active while the seed shoutouts are sent, deactivated afterwards.
    const gone = await createUser(db, { name: "Gone" });
    const send = (
      sender: string,
      recipients: string[],
      when: Date,
      extra: { valueId?: string; cardId?: string; visibility?: "PUBLIC" | "PRIVATE" } = {},
    ) =>
      sendShoutout(
        db,
        sender,
        {
          recipientIds: recipients,
          cardId: extra.cardId ?? CARD_ID,
          valueIds: [extra.valueId ?? VALUE_ID],
          message: "Thanks",
          visibility: extra.visibility ?? "PUBLIC",
        },
        config,
        when,
      );

    await send(alice.id, [bob.id, carol.id], at(9, 1));
    await send(alice.id, [bob.id], at(9, 2), { visibility: "PRIVATE", valueId: OTHER_VALUE_ID });
    await send(carol.id, [bob.id, dave.id], at(9, 8), { cardId: OTHER_CARD_ID });
    await send(bob.id, [gone.id], at(9, 9));
    await send(dave.id, [carol.id], at(6, 1)); // earlier quarter
    await send(gone.id, [alice.id], at(9, 10));
    await setUserActive(db, gone.id, false);
    const deleted = await send(erin.id, [alice.id], at(9, 11));
    await deleteShoutout(db, erin.id, deleted.id, at(9, 11));
    return { alice, bob, carol, dave, erin, gone };
  }

  const september = { start: at(9, 1), end: new Date(Date.UTC(2026, 9, 1)) };

  it("ranks recipients with ties, private shoutouts and without inactive or deleted ones", async () => {
    const { alice, bob, carol, dave, erin } = await seed();
    const board = await topRecipients(db, september, 2, dave.id);
    expect(board.entries).toEqual([
      { id: bob.id, name: "Bob", count: 3, rank: 1 },
      { id: alice.id, name: "Alice", count: 1, rank: 2 },
    ]);
    expect(board.viewer).toEqual({ id: dave.id, name: "Dave", count: 1, rank: 2 });
    expect(board.max).toBe(3);
    expect((await topRecipients(db, september, 10, bob.id)).viewer).toBeNull();
    expect((await topRecipients(db, september, 10, erin.id)).viewer).toBeNull();
    expect((await topRecipients(db, september)).entries.map((e) => e.name)).toEqual([
      "Bob",
      "Alice",
      "Carol",
      "Dave",
    ]);
    const allTime = await topRecipients(db, {});
    expect(allTime.entries.find((e) => e.id === carol.id)?.count).toBe(2);
  });

  it("ranks senders by colleagues recognised and values by shoutouts", async () => {
    const { alice, carol, bob } = await seed();
    expect((await topSenders(db, september)).entries).toEqual([
      { id: alice.id, name: "Alice", count: 3, rank: 1 },
      { id: carol.id, name: "Carol", count: 2, rank: 2 },
      { id: bob.id, name: "Bob", count: 1, rank: 3 },
    ]);
    const values = await topValues(db, { start: september.start });
    expect(values.entries.map((e) => [e.name, e.count, e.rank])).toEqual([
      ["Integrity", 4, 1],
      ["Collaboration", 1, 2],
    ]);
    expect(values.viewer).toBeNull();
    expect((await topValues(db, { end: at(1, 1) })).max).toBe(0);
  });

  it("summarises activity and participation", async () => {
    await seed();
    expect(await getSummary(db, september)).toEqual({
      shoutouts: 5,
      recognitions: 7,
      activePeople: 5,
      givers: 3,
      receivers: 4,
    });
  });

  it("builds trends with empty buckets and breakdowns", async () => {
    await seed();
    const weekly = await getTrend(db, { start: at(8, 25), end: at(9, 15) }, "week");
    expect(weekly.map((p) => [p.start.toISOString().slice(0, 10), p.count])).toEqual([
      ["2026-08-24", 0],
      ["2026-08-31", 2],
      ["2026-09-07", 3],
      ["2026-09-14", 0],
    ]);
    const monthly = await getTrend(db, { start: at(5, 20), end: at(9, 30) }, "month");
    expect(monthly.map((p) => p.count)).toEqual([0, 1, 0, 0, 5]);

    const values = await getValueBreakdown(db, september);
    expect(values).toHaveLength(5);
    expect(values.slice(0, 2).map((v) => [v.name, v.count])).toEqual([
      ["Integrity", 4],
      ["Collaboration", 1],
    ]);
    await setCatalogActive(db, "company_values", false, { only: "value_diversity" });
    expect(await getValueBreakdown(db, september)).toHaveLength(4);
    const cards = await getCardBreakdown(db, september);
    expect(cards).toHaveLength(10);
    expect(cards[0]).toMatchObject({ name: "Thank You", count: 4 });
  });

  it("lists people not recognised recently, longest waiting first", async () => {
    const { erin } = await seed();
    const people = await getUnrecognised(db, at(9, 5));
    expect(people.map((p) => p.name)).toEqual(["Erin", "Carol"]);
    expect(people[0]).toEqual({
      id: erin.id,
      name: "Erin",
      email: erin.email,
      lastRecognisedAt: null,
    });
    expect(people[1].lastRecognisedAt).toEqual(at(9, 1));
    expect((await getUnrecognised(db, at(9, 30), 1)).map((p) => p.id)).toEqual([erin.id]);
  });

  it("finds the start of a bucket", () => {
    expect(bucketStart(at(9, 17), "week").toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(bucketStart(at(9, 17), "month").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
