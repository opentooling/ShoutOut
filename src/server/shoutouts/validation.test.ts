import { describe, expect, it } from "vitest";
import { editShoutoutSchema, fieldErrors, sendShoutoutSchema } from "./validation";

const valid = {
  recipientIds: ["a", "b"],
  cardId: "card",
  valueId: "value",
  message: "  Thanks!  ",
  visibility: "PUBLIC",
};

describe("sendShoutoutSchema", () => {
  const schema = sendShoutoutSchema(3);

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
      valueId: "",
      message: "   ",
      visibility: "SECRET",
    });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toEqual({
      recipientIds: "Pick at least one person",
      cardId: "Pick a card",
      valueId: "Pick a company value",
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

describe("editShoutoutSchema", () => {
  it("does not include recipients", () => {
    const { recipientIds: _ignored, ...edit } = valid;
    expect(editShoutoutSchema.parse({ ...edit, visibility: "PRIVATE" })).toEqual({
      ...edit,
      message: "Thanks!",
      visibility: "PRIVATE",
    });
  });
});
