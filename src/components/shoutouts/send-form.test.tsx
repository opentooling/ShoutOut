import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/app/actions/shoutouts";
import { findCardDesign } from "@/components/cards/designs";
import { SendShoutoutForm, type SendFormProps } from "./send-form";

const cards = [
  { id: "c1", design: findCardDesign("thank-you")! },
  { id: "c2", design: findCardDesign("crushed-it")! },
];
const values = [
  { id: "v1", name: "Integrity" },
  { id: "v2", name: "Excellence" },
];
const people = [
  { id: "u2", name: "Bob Baker", email: "bob@x.io" },
  { id: "u3", name: "Carol Chen", email: "carol@x.io" },
];

function setup(overrides: Partial<SendFormProps> = {}) {
  const action = vi.fn(async (_s: FormState, _f: FormData): Promise<FormState> => ({
    status: "idle",
  }));
  render(
    <SendShoutoutForm
      action={action}
      cards={cards}
      values={values}
      senderName="Alice Anders"
      remaining={5}
      maxRecipients={3}
      maxValues={2}
      maxMessageLength={280}
      search={async () => people}
      {...overrides}
    />,
  );
  return action;
}

async function pick(name: string) {
  await userEvent.click(screen.getByRole("combobox"));
  // The search is debounced; allow for slow CI runners.
  const option = await screen.findByRole("option", { name: new RegExp(name) }, { timeout: 3000 });
  fireEvent.mouseDown(option);
}

describe("SendShoutoutForm", () => {
  it("previews the shoutout as it is written and submits it", async () => {
    const action = setup();
    const preview = () => screen.getByRole("article");
    expect(preview()).toHaveTextContent("Your message will appear here.");
    expect(preview()).toHaveTextContent("To …");
    expect(screen.getByText("You have 5 shoutouts left this quarter.")).toBeInTheDocument();

    await pick("Bob Baker");
    await pick("Carol Chen");
    await userEvent.click(screen.getByText("Crushed It", { selector: "label span" }));
    await userEvent.click(screen.getByText("Excellence"));
    await userEvent.type(screen.getByLabelText("Say thanks"), "Nailed it");
    await userEvent.click(screen.getByText("Private"));

    expect(preview()).toHaveAccessibleName(
      "Crushed It from Alice Anders to Bob Baker and Carol Chen",
    );
    expect(preview()).toHaveTextContent("Nailed it");
    expect(preview()).toHaveTextContent("#Excellence");
    expect(screen.getByText("This uses 2 of your 5 remaining shoutouts.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Send shoutout" }));
    expect(action).toHaveBeenCalledOnce();
    const data = action.mock.calls[0][1];
    expect(data.getAll("recipientIds")).toEqual(["u2", "u3"]);
    expect(data.getAll("valueIds")).toEqual(["v2"]);
    const lists = ["recipientIds", "valueIds"];
    expect(Object.fromEntries([...data.entries()].filter(([k]) => !lists.includes(k)))).toEqual({
      cardId: "c2",
      message: "Nailed it",
      visibility: "PRIVATE",
    });
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/");
  });

  it("starts with someone already picked, and shows several values", async () => {
    setup({ initialRecipients: [people[1]] });
    expect(screen.getByRole("article")).toHaveTextContent("To Carol Chen");
    await userEvent.click(screen.getByText("Integrity"));
    await userEvent.click(screen.getByText("Excellence"));
    expect(screen.getByRole("article")).toHaveTextContent("#Integrity#Excellence");
  });

  it("shows errors returned by the action", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: { recipientIds: "Pick at least one person", valueIds: "Pick a company value" },
    }));
    setup({ action });
    await userEvent.click(screen.getByRole("button", { name: "Send shoutout" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please check the highlighted fields.",
    );
    expect(screen.getByText("Pick at least one person")).toBeInTheDocument();
    expect(screen.getByText("Pick a company value", { selector: "p" })).toBeInTheDocument();
  });

  it("limits recipients to the remaining budget", async () => {
    setup({ remaining: 1 });
    await pick("Bob Baker");
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("adds points, shows what they cost and blocks sending when there aren't enough", async () => {
    const action = setup({ points: { remaining: 30, choices: [5, 10, 25] } });
    expect(
      screen.getByText(
        "You have 5 shoutouts left this quarter. You have 30 points to give this quarter.",
      ),
    ).toBeInTheDocument();
    await pick("Bob Baker");
    await userEvent.click(screen.getByText("🎁 10"));
    expect(screen.getByRole("article")).toHaveTextContent("🎁 10 points");
    expect(screen.getByText(/It gives 10 of your 30 points\./)).toBeInTheDocument();

    await userEvent.click(screen.getByText("🎁 25"));
    await pick("Carol Chen");
    expect(screen.getByRole("article")).toHaveTextContent("🎁 25 points each");
    expect(screen.getByText(/Not enough points left for everyone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send shoutout" })).toBeDisabled();

    await userEvent.click(screen.getByText("🎁 10"));
    await userEvent.click(screen.getByText("Excellence"));
    await userEvent.type(screen.getByLabelText("Say thanks"), "Thanks");
    await userEvent.click(screen.getByRole("button", { name: "Send shoutout" }));
    expect(action.mock.calls[0][1].get("points")).toBe("10");
  });

  it("has no shoutout limit when the budget is off", async () => {
    setup({ remaining: null, maxRecipients: 2 });
    expect(screen.queryByText(/shoutouts left/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Add points/ })).not.toBeInTheDocument();
    await pick("Bob Baker");
    await pick("Carol Chen");
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send shoutout" })).toBeEnabled();
  });

  it("copes with no cards and disables sending over budget", async () => {
    setup({ cards: [], remaining: 0 });
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    await pick("Bob Baker");
    expect(screen.getByRole("button", { name: "Send shoutout" })).toBeDisabled();
  });
});
