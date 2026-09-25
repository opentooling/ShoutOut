import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EmailPreferencesState } from "@/app/actions/notifications";
import { EmailPreferencesForm } from "./email-preferences-form";

describe("EmailPreferencesForm", () => {
  it("shows both options and saves them", async () => {
    const action = vi.fn().mockResolvedValue({ status: "saved", savedAt: 1 });
    render(
      <EmailPreferencesForm
        initial={{ onShoutout: true, budgetReminder: true }}
        reminderDays={14}
        action={action}
      />,
    );
    expect(screen.getByText(/One email two weeks before the quarter ends/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /someone sends me a shoutout/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save email settings" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    const data: FormData = action.mock.calls[0][1];
    expect(data.get("onShoutout")).toBeNull();
    expect(data.get("budgetReminder")).toBe("on");
  });

  it("hides the reminder when reminders are off, keeping its saved value", async () => {
    const action = vi.fn().mockResolvedValue({ status: "saved", savedAt: 1 });
    const { rerender } = render(
      <EmailPreferencesForm
        initial={{ onShoutout: true, budgetReminder: true }}
        reminderDays={0}
        action={action}
      />,
    );
    expect(screen.queryByRole("checkbox", { name: /expire/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save email settings" }));
    expect((action.mock.calls[0][1] as FormData).get("budgetReminder")).toBe("on");

    rerender(
      <EmailPreferencesForm
        key="off"
        initial={{ onShoutout: true, budgetReminder: false }}
        reminderDays={0}
        action={action}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save email settings" }));
    expect((action.mock.calls[1][1] as FormData).get("budgetReminder")).toBeNull();
  });

  it("shows progress while saving", async () => {
    let finish: (value: EmailPreferencesState) => void = () => {};
    const action = vi.fn(() => new Promise<EmailPreferencesState>((resolve) => (finish = resolve)));
    render(
      <EmailPreferencesForm
        initial={{ onShoutout: false, budgetReminder: false }}
        reminderDays={7}
        action={action}
      />,
    );
    expect(screen.getByText(/One email a week before/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save email settings" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    finish({ status: "saved", savedAt: 2 });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
