import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetMeter } from "./budget-meter";

const resetsAt = new Date("2026-10-01T00:00:00Z");

describe("BudgetMeter", () => {
  it("shows what's left and when it resets", () => {
    render(<BudgetMeter allowance={20} remaining={15} resetsAt={resetsAt} className="mt-4" />);
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText(/of 20 shoutouts left/)).toBeInTheDocument();
    expect(screen.getByText("Resets 1 Oct")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Shoutouts left this quarter" });
    expect(bar).toHaveAttribute("aria-valuenow", "15");
    expect(bar.firstElementChild).toHaveStyle({ width: "75%" });
    expect(bar.firstElementChild).toHaveClass("bg-sunny");
  });

  it("can show points left to give", () => {
    render(<BudgetMeter unit="points" allowance={100} remaining={40} resetsAt={resetsAt} />);
    expect(screen.getByText(/of 100 points left to give/)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Points left to give this quarter" }),
    ).toHaveAttribute("aria-valuenow", "40");
  });

  it("turns coral when empty and copes with a zero allowance", () => {
    const { rerender } = render(<BudgetMeter allowance={20} remaining={0} resetsAt={resetsAt} />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-coral");
    rerender(<BudgetMeter allowance={0} remaining={0} resetsAt={resetsAt} />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "0%" });
  });
});
