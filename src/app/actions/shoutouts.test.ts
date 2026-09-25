import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/server/errors";

const auth = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
const revalidatePath = vi.fn();
const sendShoutout = vi.fn();
const updateShoutout = vi.fn();
const deleteShoutout = vi.fn();

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ db: true }) }));
vi.mock("@/server/shoutouts/send", () => ({ sendShoutout }));
vi.mock("@/server/shoutouts/manage", () => ({ updateShoutout, deleteShoutout }));
const reportShoutout = vi.fn();
vi.mock("@/server/admin/moderation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin/moderation")>()),
  reportShoutout,
}));

const { sendShoutoutAction, updateShoutoutAction, deleteShoutoutAction, reportShoutoutAction } =
  await import("./shoutouts");

const idle = { status: "idle" } as const;

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

const validSend = {
  recipientIds: ["u2", "u3"],
  cardId: "card",
  valueId: "value",
  message: " Thanks! ",
  visibility: "PRIVATE",
};

describe("shoutout actions", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    vi.stubEnv("SHOUTOUT_QUARTERLY_BUDGET", "20");
    vi.stubEnv("SHOUTOUT_MAX_RECIPIENTS", "2");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("sendShoutoutAction", () => {
    it("redirects anonymous users to sign in", async () => {
      auth.mockResolvedValue(null);
      await expect(sendShoutoutAction(idle, form(validSend))).rejects.toThrow(
        "NEXT_REDIRECT /signin",
      );
      expect(sendShoutout).not.toHaveBeenCalled();
    });

    it("sends and returns to the feed", async () => {
      await expect(sendShoutoutAction(idle, form(validSend))).rejects.toThrow(
        "NEXT_REDIRECT /?notice=sent",
      );
      expect(sendShoutout).toHaveBeenCalledWith(
        { db: true },
        "u1",
        {
          recipientIds: ["u2", "u3"],
          cardId: "card",
          valueId: "value",
          message: "Thanks!",
          visibility: "PRIVATE",
        },
        expect.objectContaining({ quarterlyBudget: 20, maxRecipients: 2, emailDelayMs: null }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/");
    });

    it("queues emails to the recipients when email is set up", async () => {
      vi.stubEnv("SMTP_HOST", "relay.example.com");
      vi.stubEnv("SMTP_FROM", "ShoutOut <shoutout@example.com>");
      vi.stubEnv("SHOUTOUT_EMAIL_DELAY_SECONDS", "30");
      await expect(sendShoutoutAction(idle, form(validSend))).rejects.toThrow("NEXT_REDIRECT");
      expect(sendShoutout.mock.calls[0][3]).toMatchObject({ emailDelayMs: 30_000 });
    });

    it("returns field errors for invalid input, using the recipient limit from config", async () => {
      const data = form({ recipientIds: ["a", "b", "c"], message: "" });
      data.append("recipientIds", new File(["x"], "x.txt"));
      const state = await sendShoutoutAction(idle, data);
      expect(state).toEqual({
        status: "error",
        message: "Please check the highlighted fields.",
        fieldErrors: {
          recipientIds: "You can recognise up to 2 people at once",
          cardId: "Pick a card",
          valueId: "Pick a company value",
          message: "Write a short message",
        },
      });
    });

    it("defaults visibility to public", async () => {
      const { visibility: _v, ...rest } = validSend;
      await expect(sendShoutoutAction(idle, form(rest))).rejects.toThrow("NEXT_REDIRECT");
      expect(sendShoutout.mock.calls[0][2].visibility).toBe("PUBLIC");
    });

    it("shows business rule failures on the right field", async () => {
      sendShoutout.mockRejectedValue(
        new DomainError("BUDGET_EXCEEDED", "No budget left", "recipientIds"),
      );
      expect(await sendShoutoutAction(idle, form(validSend))).toEqual({
        status: "error",
        message: "No budget left",
        fieldErrors: { recipientIds: "No budget left" },
      });
      sendShoutout.mockRejectedValue(new DomainError("NOT_FOUND", "Gone"));
      expect(await sendShoutoutAction(idle, form(validSend))).toEqual({
        status: "error",
        message: "Gone",
        fieldErrors: {},
      });
    });

    it("rethrows unexpected errors", async () => {
      sendShoutout.mockRejectedValue(new Error("database down"));
      await expect(sendShoutoutAction(idle, form(validSend))).rejects.toThrow("database down");
    });
  });

  describe("updateShoutoutAction", () => {
    const { recipientIds: _r, ...validEdit } = validSend;

    it("updates and returns to the feed", async () => {
      await expect(updateShoutoutAction("s1", idle, form(validEdit))).rejects.toThrow(
        "NEXT_REDIRECT /?notice=updated",
      );
      expect(updateShoutout).toHaveBeenCalledWith({ db: true }, "u1", "s1", {
        cardId: "card",
        valueId: "value",
        message: "Thanks!",
        visibility: "PRIVATE",
      });
    });

    it("validates input, defaults visibility and reports domain errors", async () => {
      expect(await updateShoutoutAction("s1", idle, form({}))).toMatchObject({
        status: "error",
        fieldErrors: { cardId: "Pick a card" },
      });
      updateShoutout.mockRejectedValue(new DomainError("EDIT_WINDOW_CLOSED", "Too late"));
      const { visibility: _v, ...noVisibility } = validEdit;
      expect(await updateShoutoutAction("s1", idle, form(noVisibility))).toEqual({
        status: "error",
        message: "Too late",
        fieldErrors: {},
      });
      expect(updateShoutout.mock.calls[0][3].visibility).toBe("PUBLIC");
    });
  });

  describe("deleteShoutoutAction", () => {
    it("deletes and returns to the feed", async () => {
      await expect(deleteShoutoutAction("s1")).rejects.toThrow("NEXT_REDIRECT /?notice=deleted");
      expect(deleteShoutout).toHaveBeenCalledWith({ db: true }, "u1", "s1");
    });

    it("reports when it can no longer be deleted", async () => {
      deleteShoutout.mockRejectedValue(new DomainError("EDIT_WINDOW_CLOSED", "Too late"));
      await expect(deleteShoutoutAction("s1")).rejects.toThrow(
        "NEXT_REDIRECT /?notice=delete-failed",
      );
    });

    it("rethrows unexpected errors", async () => {
      deleteShoutout.mockRejectedValue(new Error("boom"));
      await expect(deleteShoutoutAction("s1")).rejects.toThrow("boom");
    });
  });
  describe("reportShoutoutAction", () => {
    it("reports and returns to the feed", async () => {
      await expect(
        reportShoutoutAction("s1", idle, form({ reason: "SPAM", note: " dup " })),
      ).rejects.toThrow("NEXT_REDIRECT /?notice=reported");
      expect(reportShoutout).toHaveBeenCalledWith({ db: true }, "u1", "s1", {
        reason: "SPAM",
        note: "dup",
      });
    });

    it("validates and reports business errors", async () => {
      expect(await reportShoutoutAction("s1", idle, form({}))).toMatchObject({
        status: "error",
        fieldErrors: { reason: "Pick a reason" },
      });
      reportShoutout.mockRejectedValueOnce(new DomainError("ALREADY_REPORTED", "Already"));
      expect(await reportShoutoutAction("s1", idle, form({ reason: "OTHER" }))).toEqual({
        status: "error",
        message: "Already",
        fieldErrors: {},
      });
    });
  });
});
