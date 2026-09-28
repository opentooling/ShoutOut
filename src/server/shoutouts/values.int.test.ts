import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import { CARD_ID, createUser, OTHER_VALUE_ID, VALUE_ID } from "../../../test/factories";
import { listAllValues } from "../admin/catalog";
import { exportShoutoutsCsv } from "../admin/export";
import { getValueBreakdown } from "../insights/analytics";
import { topValues } from "../insights/leaderboard";
import { getProfile } from "../users/profile";
import { listFeed } from "./feed";
import { sendShoutout } from "./send";

const now = new Date("2026-09-17T12:00:00Z");

describe("several values per shoutout (postgres)", () => {
  const db = useTestDb();

  it("counts each value a shoutout celebrates, everywhere values are counted", async () => {
    const [alice, bob] = await Promise.all(
      ["Alice", "Bob"].map((name) => createUser(db, { name })),
    );
    const send = (valueIds: string[], message: string) =>
      sendShoutout(
        db,
        alice.id,
        { recipientIds: [bob.id], cardId: CARD_ID, valueIds, message, visibility: "PUBLIC" },
        { quarterlyBudget: 10 },
        now,
      );
    await send([VALUE_ID, OTHER_VALUE_ID], "Both");
    await send([OTHER_VALUE_ID], "One");

    const board = await topValues(db, {});
    expect(board.entries.map((e) => [e.name, e.count])).toEqual([
      ["Collaboration", 2],
      ["Integrity", 1],
    ]);
    const breakdown = await getValueBreakdown(db, {});
    expect(breakdown.find((b) => b.name === "Integrity")?.count).toBe(1);
    expect(breakdown.find((b) => b.name === "Collaboration")?.count).toBe(2);
    expect((await getProfile(db, bob.id, bob.id))!.topValues).toEqual([
      { name: "Collaboration", count: 2 },
      { name: "Integrity", count: 1 },
    ]);
    const uses = await listAllValues(db);
    expect(uses.find((v) => v.id === VALUE_ID)?.uses).toBe(1);

    // Filtering by a value finds shoutouts that include it, not only as the first one.
    const filtered = await listFeed(db, bob.id, { now, filters: { valueId: OTHER_VALUE_ID } });
    expect(filtered.items.map((item) => item.message).sort()).toEqual(["Both", "One"]);

    const csv = await exportShoutoutsCsv(db, {});
    expect(csv).toContain(",Thank You,Integrity; Collaboration,public,Both,");
  });
});
