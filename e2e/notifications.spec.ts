import { expect, test, type Page } from "@playwright/test";
import { e2eMessage, sendShoutout, signInAs } from "./helpers";

/** Mailpit catches the app's emails in the local cluster (deploy/local/values-local.yaml). */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://mail.localtest.me";

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function findEmail(text: string): Promise<MailpitSummary | undefined> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`"${text}"`)}`);
  const { messages } = (await response.json()) as { messages: MailpitSummary[] };
  return messages[0];
}

async function mailpitAvailable() {
  try {
    return (await fetch(`${MAILPIT}/api/v1/info`)).ok;
  } catch {
    return false;
  }
}

async function openEmailSettings(page: Page) {
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page.getByRole("heading", { name: "Email me" })).toBeVisible();
  return page.getByRole("checkbox", { name: /someone sends me a shoutout/ });
}

test.describe("email notifications", () => {
  test.beforeAll(async () => {
    test.skip(!(await mailpitAvailable()), `Mailpit isn't reachable at ${MAILPIT}`);
  });

  test("recipients get an email about their shoutout", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, "erin");
    const message = e2eMessage("Thanks for the thorough code review");
    await sendShoutout(page, {
      to: ["Henry Hughes"],
      card: "Mentor",
      value: "Excellence",
      message,
    });

    // Sent after the short local delay, on the sender's next run.
    let email: MailpitSummary | undefined;
    await expect
      .poll(async () => (email = await findEmail(message)), { timeout: 90_000, intervals: [2000] })
      .toBeDefined();
    expect(email!.Subject).toBe("Erin Evans sent you a shoutout for Excellence 🎉");
    expect(email!.To.map((to) => to.Address)).toEqual(["henry@shoutout.local"]);

    const body = (await (await fetch(`${MAILPIT}/api/v1/message/${email!.ID}`)).json()) as {
      Text: string;
    };
    expect(body.Text).toContain("Hi Henry,");
    expect(body.Text).toMatch(/See it on ShoutOut: http:\/\/shoutout\.localtest\.me\/shoutouts\//);
  });

  test("people can turn shoutout emails off on their profile", async ({ page }) => {
    await signInAs(page, "henry");
    let checkbox = await openEmailSettings(page);
    await expect(checkbox).toBeChecked();

    await checkbox.uncheck();
    await page.getByRole("button", { name: "Save email settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.reload();
    checkbox = page.getByRole("checkbox", { name: /someone sends me a shoutout/ });
    await expect(checkbox).not.toBeChecked();

    // Back on, as the demo data expects.
    await checkbox.check();
    await page.getByRole("button", { name: "Save email settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  });
});
