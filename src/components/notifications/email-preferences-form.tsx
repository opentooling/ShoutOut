"use client";

import { useActionState } from "react";
import type { EmailPreferencesState } from "@/app/actions/notifications";
import { buttonClasses } from "@/components/ui/button";
import { formatDayCount } from "@/lib/format";
import type { EmailPreferences } from "@/server/notifications/preferences";

type Action = (prev: EmailPreferencesState, formData: FormData) => Promise<EmailPreferencesState>;

export function EmailPreferencesForm({
  initial,
  reminderDays,
  action,
}: {
  initial: EmailPreferences;
  /** 0 when reminders are turned off for everyone; the option is then hidden. */
  reminderDays: number;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const checkbox = "mt-1 size-4 shrink-0 accent-[var(--teal-strong)]";

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex gap-3">
        <input
          type="checkbox"
          name="onShoutout"
          defaultChecked={initial.onShoutout}
          className={checkbox}
        />
        <span>
          <span className="font-bold">When someone sends me a shoutout</span>
          <span className="block text-sm text-muted">
            An email with the card and message, a couple of minutes after it&apos;s sent.
          </span>
        </span>
      </label>
      {reminderDays > 0 && (
        <label className="flex gap-3">
          <input
            type="checkbox"
            name="budgetReminder"
            defaultChecked={initial.budgetReminder}
            className={checkbox}
          />
          <span>
            <span className="font-bold">Remind me before my shoutouts expire</span>
            <span className="block text-sm text-muted">
              One email {formatDayCount(reminderDays)} before the quarter ends, if I still have
              shoutouts left.
            </span>
          </span>
        </label>
      )}
      {/* Keep the hidden option's current value when it isn't shown. */}
      {reminderDays === 0 && initial.budgetReminder && (
        <input type="hidden" name="budgetReminder" value="on" />
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          {pending ? "Saving…" : "Save email settings"}
        </button>
        <p role="status" className="text-sm font-bold text-teal-strong">
          {state.status === "saved" && !pending ? "Saved" : ""}
        </p>
      </div>
    </form>
  );
}
