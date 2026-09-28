import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/app/actions/shoutouts";
import { findCardDesign } from "@/components/cards/designs";
import { EditShoutoutForm } from "./edit-form";

const cards = [
  { id: "c1", design: findCardDesign("thank-you")! },
  { id: "c2", design: findCardDesign("mentor")! },
];
const values = [
  { id: "v1", name: "Integrity" },
  { id: "v2", name: "Diversity" },
];
const initial = {
  cardId: "c1",
  valueIds: ["v1"],
  message: "Thanks",
  visibility: "PUBLIC" as const,
};

describe("EditShoutoutForm", () => {
  it("starts from the current shoutout and submits changes", async () => {
    const action = vi.fn(async (_s: FormState, _f: FormData): Promise<FormState> => ({
      status: "idle",
    }));
    render(
      <EditShoutoutForm
        action={action}
        cards={cards}
        values={values}
        initial={initial}
        maxMessageLength={280}
        maxValues={2}
      />,
    );
    expect(screen.getByRole("radio", { name: "Thank You" })).toBeChecked();
    expect(screen.getByLabelText("Say thanks")).toHaveValue("Thanks");

    await userEvent.click(screen.getByText("Mentor"));
    await userEvent.click(screen.getByText("Diversity"));
    await userEvent.type(screen.getByLabelText("Say thanks"), " so much");
    await userEvent.click(screen.getByText("Private"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const data = action.mock.calls[0][1];
    expect(data.getAll("valueIds")).toEqual(["v1", "v2"]);
    expect(Object.fromEntries([...data.entries()].filter(([key]) => key !== "valueIds"))).toEqual({
      cardId: "c2",
      message: "Thanks so much",
      visibility: "PRIVATE",
    });
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/");
  });

  it("shows errors from the action", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: "error",
      message: "Shoutouts can only be changed within 24 hours of sending",
      fieldErrors: { message: "Write a short message" },
    }));
    render(
      <EditShoutoutForm
        action={action}
        cards={cards}
        values={values}
        initial={initial}
        maxMessageLength={280}
        maxValues={2}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/within 24 hours/);
    expect(screen.getByText("Write a short message")).toBeInTheDocument();
  });
});
