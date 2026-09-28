import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findCardDesign } from "@/components/cards/designs";
import {
  CardPicker,
  FieldError,
  MessageField,
  PointsPicker,
  ValuePicker,
  VisibilityPicker,
} from "./pickers";

const cards = [
  { id: "c1", design: findCardDesign("thank-you")! },
  { id: "c2", design: findCardDesign("mentor")! },
];
const values = [
  { id: "v1", name: "Integrity" },
  { id: "v2", name: "Diversity" },
];

describe("FieldError", () => {
  it("renders only with a message", () => {
    const { container, rerender } = render(<FieldError id="e" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FieldError id="e" message="Required" />);
    expect(screen.getByText("Required")).toHaveAttribute("id", "e");
  });
});

describe("CardPicker", () => {
  it("selects cards and shows errors", async () => {
    const onChange = vi.fn();
    render(<CardPicker cards={cards} value="c1" onChange={onChange} error="Pick a card" />);
    expect(screen.getByRole("radio", { name: "Thank You" })).toBeChecked();
    await userEvent.click(screen.getByText("Mentor"));
    expect(onChange).toHaveBeenCalledWith("c2");
    expect(screen.getByRole("group", { name: "Pick a card" })).toHaveAttribute(
      "aria-describedby",
      "cardId-error",
    );
    expect(screen.getByText("Pick a card", { selector: "p" })).toBeInTheDocument();
  });

  it("has no error description when valid", () => {
    render(<CardPicker cards={cards} value="" onChange={() => {}} />);
    expect(screen.getByRole("group")).not.toHaveAttribute("aria-describedby");
  });
});

describe("ValuePicker", () => {
  const three = [...values, { id: "v3", name: "Excellence" }];

  it("works as a single choice when only one value is allowed", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ValuePicker values={values} value={["v1"]} onChange={onChange} max={1} />,
    );
    expect(screen.getByRole("group", { name: "Which value did they show?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Integrity" })).toBeChecked();
    expect(screen.getByRole("group")).not.toHaveAttribute("aria-describedby");
    await userEvent.click(screen.getByText("Diversity"));
    expect(onChange).toHaveBeenCalledWith(["v2"]);
    rerender(
      <ValuePicker values={values} value={[]} onChange={onChange} max={1} error="Pick one" />,
    );
    expect(screen.getByRole("group")).toHaveAttribute("aria-describedby", "valueIds-error");
  });

  it("picks several up to the limit, and unpicks", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ValuePicker values={three} value={["v1"]} onChange={onChange} max={2} />,
    );
    expect(screen.getByRole("group", { name: "Which values did they show?" })).toHaveAttribute(
      "aria-describedby",
      "valueIds-hint",
    );
    expect(screen.getByText("Pick up to 2.")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Diversity"));
    expect(onChange).toHaveBeenLastCalledWith(["v1", "v2"]);
    await userEvent.click(screen.getByText("Integrity"));
    expect(onChange).toHaveBeenLastCalledWith([]);

    rerender(<ValuePicker values={three} value={["v1", "v2"]} onChange={onChange} max={2} />);
    const excellence = screen.getByRole("checkbox", { name: "Excellence" });
    expect(excellence).toBeDisabled();
    onChange.mockClear();
    await userEvent.click(screen.getByText("Excellence"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("VisibilityPicker", () => {
  it("switches between public and private", async () => {
    const onChange = vi.fn();
    render(<VisibilityPicker value="PUBLIC" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: /public/i })).toBeChecked();
    await userEvent.click(screen.getByText("Private"));
    expect(onChange).toHaveBeenCalledWith("PRIVATE");
  });
});

describe("PointsPicker", () => {
  it("offers no points plus the choices, greying out what can't be afforded", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PointsPicker
        choices={[5, 10, 25]}
        value={0}
        onChange={onChange}
        recipients={0}
        remaining={20}
      />,
    );
    expect(screen.getByRole("radio", { name: "No points" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "🎁 25" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "🎁 10" })).toBeEnabled();
    await userEvent.click(screen.getByText("🎁 10"));
    expect(onChange).toHaveBeenCalledWith(10);

    // With two people, 10 each costs 20: still affordable; the chosen amount stays selectable.
    rerender(
      <PointsPicker
        choices={[5, 10, 25]}
        value={25}
        onChange={onChange}
        recipients={2}
        remaining={20}
        error="Too many"
      />,
    );
    expect(screen.getByRole("radio", { name: "🎁 10" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "🎁 25" })).toBeEnabled();
    expect(screen.getByText("Too many")).toBeInTheDocument();
  });
});

describe("MessageField", () => {
  it("counts characters and warns near the limit", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<MessageField value="Hello" onChange={onChange} maxLength={20} />);
    const textarea = screen.getByLabelText("Say thanks");
    expect(textarea).toHaveAttribute("aria-describedby", "message-count");
    expect(textarea).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("15 characters left")).toHaveClass("text-coral-strong");
    await userEvent.type(textarea, "!");
    expect(onChange).toHaveBeenCalledWith("Hello!");

    rerender(<MessageField value="Hi" onChange={onChange} maxLength={280} error="Too short" />);
    expect(screen.getByText("278 characters left")).toHaveClass("text-muted");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-describedby", "message-count message-error");
  });
});
