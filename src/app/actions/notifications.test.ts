import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
const setEmailPreferences = vi.fn();

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ db: true }) }));
vi.mock("@/server/notifications/preferences", () => ({ setEmailPreferences }));

const { updateEmailPreferencesAction } = await import("./notifications");

const idle = { status: "idle" } as const;

describe("updateEmailPreferencesAction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends anonymous visitors to sign in", async () => {
    auth.mockResolvedValue(null);
    await expect(updateEmailPreferencesAction(idle, new FormData())).rejects.toThrow(
      "NEXT_REDIRECT /signin",
    );
    expect(setEmailPreferences).not.toHaveBeenCalled();
  });

  it("saves the ticked boxes for the signed-in person", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const form = new FormData();
    form.set("onShoutout", "on");
    const state = await updateEmailPreferencesAction(idle, form);
    expect(state).toMatchObject({ status: "saved" });
    expect(setEmailPreferences).toHaveBeenCalledWith({ db: true }, "u1", {
      onShoutout: true,
      budgetReminder: false,
    });
  });
});
