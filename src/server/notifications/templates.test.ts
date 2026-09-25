import { describe, expect, it } from "vitest";
import {
  budgetReminderEmail,
  escapeHtml,
  shoutoutReceivedEmail,
  type ShoutoutEmail,
} from "./templates";

const APP = "https://shoutout.example.com";

const shoutout: ShoutoutEmail = {
  shoutoutId: "s1",
  recipientId: "u2",
  recipientName: "Carol Chen",
  senderName: "Alice Andrews",
  cardTitle: "Team Player",
  cardTagline: "A true helping hand",
  cardTone: "teal",
  valueName: "Collaboration",
  message: "Thanks for <b>everything</b> & more",
  visibility: "PUBLIC",
  otherRecipients: 0,
};

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("shoutoutReceivedEmail", () => {
  it("says who recognised you, for what, with a link", () => {
    const email = shoutoutReceivedEmail(shoutout, APP);
    expect(email.subject).toBe("Alice Andrews sent you a shoutout for Collaboration 🎉");
    expect(email.text).toContain("Hi Carol,");
    expect(email.text).toContain("Alice Andrews recognised you for Collaboration.");
    expect(email.text).toContain("Team Player: A true helping hand");
    expect(email.text).toContain('"Thanks for <b>everything</b> & more"');
    expect(email.text).toContain(`See it on ShoutOut: ${APP}/shoutouts/s1`);
    expect(email.text).toContain(`${APP}/people/u2#email-settings`);
    expect(email.text).not.toContain("private");
    expect(email.html).toContain("Thanks for &lt;b&gt;everything&lt;/b&gt; &amp; more");
    expect(email.html).not.toContain("<b>everything</b>");
    expect(email.html).toContain(`href="${APP}/shoutouts/s1"`);
    expect(email.html).toContain("#d3f0ed"); // the teal card colour
  });

  it("mentions the other people thanked and private shoutouts", () => {
    const one = shoutoutReceivedEmail({ ...shoutout, otherRecipients: 1 }, APP);
    expect(one.text).toContain("recognised you along with one other person for");
    const many = shoutoutReceivedEmail(
      { ...shoutout, otherRecipients: 3, visibility: "PRIVATE", recipientName: "  " },
      APP,
    );
    expect(many.text).toContain("along with 3 other people");
    expect(many.text).toContain("This shoutout is private");
    expect(many.html).toContain("🔒");
    expect(many.text).toContain("Hi there,");
  });
});

describe("budgetReminderEmail", () => {
  const reminder = {
    recipientId: "u3",
    recipientName: "Bob Baker",
    remaining: 12,
    allowance: 20,
    resetsAt: new Date("2026-10-01T00:00:00Z"),
    reminderDays: 14,
  };

  it("says how many are left and the last day to use them", () => {
    const email = budgetReminderEmail(reminder, APP);
    expect(email.subject).toBe("You have 12 shoutouts left this quarter");
    expect(email.text).toContain("Hi Bob,");
    expect(email.text).toContain("resets in about two weeks");
    expect(email.text).toContain("You still have 12 of your 20 shoutouts to give");
    expect(email.text).toContain("the last day to use them is 30 Sep");
    expect(email.text).toContain(`Send a shoutout: ${APP}/shoutouts/new`);
    expect(email.text).toContain("budget reminders are on");
    expect(email.html).toContain("<strong>12 of your 20 shoutouts</strong>");
  });

  it("uses the singular for one", () => {
    const email = budgetReminderEmail({ ...reminder, remaining: 1, reminderDays: 3 }, APP);
    expect(email.subject).toBe("You have 1 shoutout left this quarter");
    expect(email.text).toContain("resets in about 3 days");
  });
});
