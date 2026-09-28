import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditFormProps } from "@/components/shoutouts/edit-form";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const getVisibleShoutout = vi.fn();
const updateShoutoutAction = vi.fn();
const EditShoutoutForm = vi.fn((_props: EditFormProps) => <div>edit form</div>);

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/app/actions/shoutouts", () => ({ updateShoutoutAction }));
vi.mock("@/server/shoutouts/feed", () => ({ getVisibleShoutout }));
vi.mock("@/server/shoutouts/catalog", () => ({
  listActiveCards: async () => [
    {
      id: "c1",
      slug: "thank-you",
      title: "Thank You",
      tagline: "t",
      illustration: "heart",
      tone: "coral",
    },
  ],
  listActiveValues: async () => [{ id: "v1", name: "Integrity" }],
}));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
vi.mock("@/components/shoutouts/edit-form", () => ({ EditShoutoutForm }));

const { default: EditShoutoutPage, metadata } = await import("./page");

const props = { params: Promise.resolve({ id: "s1" }) } as PageProps<"/shoutouts/[id]/edit">;
const shoutout = {
  id: "s1",
  message: "Thanks",
  visibility: "PRIVATE",
  card: {
    id: "c1",
    slug: "thank-you",
    title: "Thank You",
    tagline: "t",
    illustration: "heart",
    tone: "coral",
  },
  values: [{ id: "v1", name: "Integrity" }],
  recipients: [
    { id: "u2", name: "Bob" },
    { id: "u3", name: "Carol" },
  ],
  canModify: true,
};

describe("EditShoutoutPage", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    getVisibleShoutout.mockResolvedValue(shoutout);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous visitors", async () => {
    auth.mockResolvedValue(null);
    await expect(EditShoutoutPage(props)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("404s when the shoutout is missing or can't be changed", async () => {
    getVisibleShoutout.mockResolvedValue(null);
    await expect(EditShoutoutPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
    getVisibleShoutout.mockResolvedValue({ ...shoutout, canModify: false });
    await expect(EditShoutoutPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the edit form with the current details", async () => {
    render(await EditShoutoutPage(props));
    expect(metadata.title).toBe("Edit shoutout");
    expect(getVisibleShoutout).toHaveBeenCalledWith({}, "u1", "s1");
    expect(screen.getByText(/To Bob, Carol/)).toBeInTheDocument();
    const formProps = EditShoutoutForm.mock.calls[0][0];
    expect(formProps.initial).toEqual({
      cardId: "c1",
      valueIds: ["v1"],
      message: "Thanks",
      visibility: "PRIVATE",
    });
    expect(formProps.cards).toHaveLength(1);
    expect(formProps.values).toHaveLength(1);
  });

  it("keeps a retired card and value selectable", async () => {
    getVisibleShoutout.mockResolvedValue({
      ...shoutout,
      card: { ...shoutout.card, id: "old-card", slug: "old" },
      values: [{ id: "old-value", name: "Old value" }],
    });
    render(await EditShoutoutPage(props));
    const formProps = EditShoutoutForm.mock.calls[0][0];
    expect(formProps.cards.map((c) => c.id)).toEqual(["old-card", "c1"]);
    expect(formProps.values.map((v) => v.id)).toEqual(["old-value", "v1"]);
  });
});
