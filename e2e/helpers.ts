import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "shoutout";

/** Signs in through the real Keycloak login page. */
export async function signInAs(page: Page, username: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByRole("button", { name: /sign in with your work account/i }).click();
  // Keycloak's login form: stable element ids across themes.
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.locator("#kc-login").click();
  // Wait for the Keycloak callback to finish (session cookie set) before the
  // test navigates elsewhere, otherwise the sign-in is cancelled.
  await page.waitForURL(
    (url) => url.hostname !== "auth.localtest.me" && !url.pathname.startsWith("/api/auth"),
  );
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
}

/** Picks a card/value/visibility option by clicking its visible label, like a user would. */
export async function choose(page: Page, name: string | RegExp) {
  const radio = page.getByRole("radio", { name, exact: typeof name === "string" });
  await page.locator("label", { has: radio }).click();
  await expect(radio).toBeChecked();
}

/** Unique, cleanup-friendly message text. */
export function e2eMessage(text: string) {
  return `${text} [e2e] ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function remainingBudget(page: Page): Promise<number> {
  const meter = page.getByRole("progressbar", { name: "Shoutouts left this quarter" });
  return Number(await meter.getAttribute("aria-valuenow"));
}

export async function sendShoutout(
  page: Page,
  {
    to,
    card = "Thank You",
    value = "Collaboration",
    message,
    visibility = "Public",
  }: {
    to: string[];
    card?: string;
    value?: string;
    message: string;
    visibility?: "Public" | "Private";
  },
) {
  await page.goto("/shoutouts/new");
  const search = page.getByRole("combobox", { name: /who are you recognising/i });
  for (const name of to) {
    await search.fill(name.split(" ")[0]);
    await page.getByRole("option", { name: new RegExp(name) }).click();
  }
  await choose(page, card);
  await choose(page, value);
  await page.getByLabel("Say thanks").fill(message);
  await choose(page, new RegExp(`^${visibility}`));
  await page.getByRole("button", { name: "Send shoutout" }).click();
  await expect(page.getByRole("status")).toHaveText(/shoutout sent/i);
}

export function feedItem(page: Page, message: string) {
  return page.getByRole("article").filter({ hasText: message });
}
