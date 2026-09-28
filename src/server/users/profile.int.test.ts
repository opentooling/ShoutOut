import { toQuery } from "@/lib/sql";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import { CARD_ID, createUser, OTHER_VALUE_ID, VALUE_ID } from "../../../test/factories";
import { sendShoutout } from "../shoutouts/send";
import { getProfile, listProfileShoutouts, profileVisibility } from "./profile";

const config = { quarterlyBudget: 50, maxRecipients: 5 };

describe("profiles (postgres)", () => {
  const db = useTestDb();

  it("shows others only public shoutouts and yourself everything", async () => {
    const [alice, bob, carol] = await Promise.all(
      ["Alice", "Bob", "Carol"].map((name) => createUser(db, { name })),
    );
    const send = (
      senderId: string,
      recipientId: string,
      visibility: "PUBLIC" | "PRIVATE",
      valueId = VALUE_ID,
    ) =>
      sendShoutout(
        db,
        senderId,
        {
          recipientIds: [recipientId],
          cardId: CARD_ID,
          valueIds: [valueId],
          message: `${visibility} thanks`,
          visibility,
        },
        config,
      );
    await send(alice.id, bob.id, "PUBLIC");
    await send(carol.id, bob.id, "PUBLIC", OTHER_VALUE_ID);
    await send(carol.id, bob.id, "PUBLIC", OTHER_VALUE_ID);
    await send(alice.id, bob.id, "PRIVATE");
    await send(bob.id, carol.id, "PRIVATE");

    const asCarol = await getProfile(db, carol.id, bob.id);
    expect(asCarol).toEqual({
      person: { id: bob.id, name: "Bob", email: expect.any(String), active: true },
      isSelf: false,
      received: 3,
      sent: 0,
      topValues: [
        { name: "Collaboration", count: 2 },
        { name: "Integrity", count: 1 },
      ],
    });

    const asBob = await getProfile(db, bob.id, bob.id);
    expect(asBob).toMatchObject({ isSelf: true, received: 4, sent: 1 });
    expect(asBob?.topValues[0]).toEqual({ name: "Collaboration", count: 2 });
    expect(asBob?.topValues[1]).toEqual({ name: "Integrity", count: 2 });

    const received = await listProfileShoutouts(db, carol.id, bob.id, "received");
    expect(received.items.map((i) => i.visibility)).toEqual(["PUBLIC", "PUBLIC", "PUBLIC"]);
    const sentAsSelf = await listProfileShoutouts(db, bob.id, bob.id, "sent", { limit: 5 });
    expect(sentAsSelf.items.map((i) => i.message)).toEqual(["PRIVATE thanks"]);
    expect((await listProfileShoutouts(db, alice.id, bob.id, "sent")).items).toEqual([]);

    expect(await getProfile(db, alice.id, "missing")).toBeNull();
  });

  it("builds visibility rules", () => {
    expect(toQuery(profileVisibility("a", "b"))).toEqual({
      text: "s.deleted_at IS NULL AND s.moderation_status = 'VISIBLE' AND s.visibility = 'PUBLIC'",
      values: [],
    });
    expect(toQuery(profileVisibility("a", "a")).values).toEqual(["a", "a"]);
  });
});
