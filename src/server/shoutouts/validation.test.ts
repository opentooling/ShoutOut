import { describe, expect, it } from "vitest";
import { editShoutoutSchema, fieldErrors, sendShoutoutSchema } from "./validation";

const valid = {
  recipientIds: ["a", "b"],
  cardId: "card",
  valueIds: ["value"],
  message: "  Thanks!  ",
  visibility: "PUBLIC",
};

describe("sendShoutoutSchema", () => {
  const schema = sendShoutoutSchema(3, 2);

  it("accepts and normalises valid input", () => {
    expect(schema.parse({ ...valid, recipientIds: ["a", "b", "a"] })).toEqual({
      ...valid,
      recipientIds: ["a", "b"],
      message: "Thanks!",
      points: 0,
    });
  });

  it("reads points as a whole number, empty meaning none", () => {
    expect(schema.parse({ ...valid, points: "25" }).points).toBe(25);
    expect(schema.parse({ ...valid, points: "" }).points).toBe(0);
    for (const points of ["-5", "2.5", "lots"]) {
      const result = schema.safeParse({ ...valid, points });
      expect(fieldErrors(result.error!)).toEqual({ points: "Pick an amount of points" });
    }
  });

  it("reports the first problem per field", () => {
    const result = schema.safeParse({
      recipientIds: [],
      cardId: "",
      valueIds: [],
      message: "   ",
      visibility: "SECRET",
    });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toEqual({
      recipientIds: "Pick at least one person",
      cardId: "Pick a card",
      valueIds: "Pick a company value",
      message: "Write a short message",
      visibility: expect.any(String),
    });
  });

  it("limits recipients and message length", () => {
    const result = schema.safeParse({
      ...valid,
      recipientIds: ["a", "b", "c", "d"],
      message: "x".repeat(281),
    });
    expect(fieldErrors(result.error!)).toEqual({
      recipientIds: "You can recognise up to 3 people at once",
      message: "Keep it to 280 characters or fewer",
    });
    expect(schema.safeParse({ ...valid, message: "x".repeat(280) }).success).toBe(true);
  });
});

describe("values", () => {
  it("takes up to the configured number, without repeats, in order", () => {
    const parse = (ids: string[], max = 2) =>
      sendShoutoutSchema(3, max).safeParse({ ...valid, valueIds: ids });
    expect(parse(["b", "a", "b"]).data?.valueIds).toEqual(["b", "a"]);
    expect(fieldErrors(parse(["a", "b", "c"]).error!)).toEqual({
      valueIds: "Pick up to 2 company values",
    });
    expect(fieldErrors(parse(["a", "b"], 1).error!)).toEqual({
      valueIds: "Pick one company value",
    });
    expect(
      fieldErrors(editShoutoutSchema(1).safeParse({ ...valid, valueIds: [""] }).error!),
    ).toHaveProperty("valueIds");
  });
});

describe("editShoutoutSchema", () => {
  it("does not include recipients", () => {
    const { recipientIds: _ignored, ...edit } = valid;
    expect(editShoutoutSchema(2).parse({ ...edit, visibility: "PRIVATE" })).toEqual({
      ...edit,
      message: "Thanks!",
      visibility: "PRIVATE",
    });
  });
});
