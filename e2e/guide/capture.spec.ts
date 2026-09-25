/**
 * Captures the user guide screenshots into public/guide/ and records their
 * sizes in src/content/guide-screenshots.json. Run against a deployment with
 * demo data (deploy/local/seed-demo.sh) and email turned on:
 *
 *   npm run guide:screenshots
 *   npx playwright test -c playwright.guide.config.ts --grep "email settings" && npm run guide:docs
 *
 * It sends, reports and removes a couple of shoutouts to show those screens,
 * and cleans up after itself (deleting within 24 hours refunds the budget).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { choose, signInAs } from "../helpers";

const OUT_DIR = path.join(process.cwd(), "public/guide");
const MANIFEST = path.join(process.cwd(), "src/content/guide-screenshots.json");
const SCALE = 1.5;
const sizes: Record<string, { width: number; height: number }> = {};

test.use({
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: SCALE,
  colorScheme: "light",
});
test.describe.configure({ mode: "serial", timeout: 180_000 });

/**
 * Demo and test data carry markers ("[demo]", "[e2e] abc123") that mean nothing
 * to readers. Remove them from the rendered text before a screenshot; the data
 * itself is untouched.
 */
async function tidyText(page: Page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const tidy = text.replace(/\s*\[(demo|e2e)\](\s+[a-z0-9]{6,})?/g, "");
      if (tidy !== text) node.textContent = tidy;
    }
  });
}

/** Screenshot of an element (or the viewport), with a little padding and a height cap. */
async function shot(page: Page, file: string, target?: Locator, maxHeight = 1100) {
  await page.waitForLoadState("networkidle");
  // Fonts and images settle before capturing.
  await page.evaluate(() => document.fonts.ready);
  await tidyText(page);
  // The sticky header would cover the top of cropped, scrolled captures.
  if (target)
    await page.addStyleTag({
      content: "body > header, header.sticky { position: static !important; }",
    });
  let clip = { x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height };
  if (target) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const scrollY = await page.evaluate(() => window.scrollY);
    const pad = 12;
    clip = {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y + scrollY - pad),
      width: box.width + pad * 2,
      height: Math.min(box.height + pad * 2, maxHeight),
    };
  }
  await page.screenshot({
    path: path.join(OUT_DIR, file),
    type: "jpeg",
    quality: 78,
    fullPage: Boolean(target),
    clip,
  });
  sizes[file] = { width: Math.round(clip.width * SCALE), height: Math.round(clip.height * SCALE) };
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page
    .context()
    .addCookies([
      { name: "shoutout-theme", value: theme, url: page.url() || "http://shoutout.localtest.me" },
    ]);
}

async function fillShoutout(page: Page, message: string) {
  await page.goto("/shoutouts/new");
  await page.getByRole("combobox", { name: /who are you recognising/i }).fill("Carol");
  await page.getByRole("option", { name: /Carol Chen/ }).click();
  await choose(page, "Team Player");
  await choose(page, "Collaboration");
  await page.getByLabel("Say thanks").fill(message);
}

test.afterAll(() => {
  // Merge, so capturing some screens (--grep) keeps the others' sizes.
  const existing = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  const merged = { ...existing, ...sizes };
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
});

test("signed-out pages", async ({ page }) => {
  await page.goto("/signin");
  await shot(page, "signin.jpg");
});

test("everyday screens", async ({ page }) => {
  await signInAs(page, "bob");
  await setTheme(page, "light");
  await page.goto("/");

  await shot(page, "feed.jpg");
  await shot(
    page,
    "budget.jpg",
    page.locator("section", { has: page.getByRole("heading", { level: 1 }) }),
  );

  await page.getByText("Search & filter").click();
  await shot(page, "filters.jpg", page.locator("details"));

  // A shoutout with a conversation going on.
  await page.goto("/");
  await page
    .getByRole("link", { name: /^💬 \d+ comments?$/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /comments/i })).toBeVisible();
  await shot(page, "detail.jpg", page.locator("main"));

  // The form, filled in but not sent.
  const message =
    "Thanks for walking me through the new deploy pipeline. You saved me a whole afternoon of guesswork.";
  await fillShoutout(page, message);
  await shot(page, "send.jpg", page.locator("main"), 1400);

  // Send it to show the Edit and Delete buttons, then delete it (refunds the budget).
  await page.getByRole("button", { name: "Send shoutout" }).click();
  await expect(page.getByRole("status")).toHaveText(/shoutout sent/i);
  const mine = page.getByRole("article").filter({ hasText: message });
  await shot(page, "edit-delete.jpg", mine);
  page.once("dialog", (dialog) => void dialog.accept());
  await mine.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText(/deleted/i);

  // Report form, without sending a report.
  await page.getByRole("article").first().getByRole("link", { name: "Report" }).click();
  await expect(page.getByRole("heading", { name: "Report shoutout" })).toBeVisible();
  await shot(page, "report.jpg", page.locator("main"));

  await page.goto("/people");
  await page.getByRole("searchbox").fill("Carol");
  await page
    .getByRole("link", { name: /Carol Chen/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: /Carol Chen/ })).toBeVisible();
  await shot(page, "profile.jpg");

  await page.goto("/leaderboard?period=quarter");
  await shot(page, "leaderboard.jpg", page.locator("main"));

  await setTheme(page, "dark");
  await page.goto("/");
  await shot(page, "dark.jpg");
  await setTheme(page, "light");
});

test("email settings", async ({ page }) => {
  // Needs email turned on (deploy/local/values-local.yaml does).
  await signInAs(page, "bob");
  await setTheme(page, "light");
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page.getByRole("heading", { name: "Email me" })).toBeVisible();
  await shot(
    page,
    "email-settings.jpg",
    page.locator("section", { has: page.locator("#email-settings") }),
  );
});

test("admin screens", async ({ browser }) => {
  // Something to moderate: frank thanks henry, grace reports it.
  const message =
    "Thanks for covering the support rota over the holidays. The team really noticed.";
  const frank = await browser.newPage();
  await signInAs(frank, "frank");
  await frank.goto("/shoutouts/new");
  await frank.getByRole("combobox", { name: /who are you recognising/i }).fill("Henry");
  await frank.getByRole("option", { name: /Henry Hughes/ }).click();
  await choose(frank, "Thank You");
  await choose(frank, "Engagement");
  await frank.getByLabel("Say thanks").fill(message);
  await frank.getByRole("button", { name: "Send shoutout" }).click();
  await expect(frank.getByRole("status")).toHaveText(/shoutout sent/i);

  const grace = await browser.newPage();
  await signInAs(grace, "grace");
  await grace
    .getByRole("article")
    .filter({ hasText: message })
    .getByRole("link", { name: "Report" })
    .click();
  await grace.getByLabel("Spam or gaming the system").check();
  await grace.getByLabel(/Anything else/).fill("Looks like a duplicate of yesterday's post");
  await grace.getByRole("button", { name: "Report shoutout" }).click();
  await expect(grace.getByRole("status")).toHaveText(/hidden while an admin reviews/);

  const alice = await browser.newPage();
  await signInAs(alice, "alice");
  await setTheme(alice, "light");
  await alice.goto("/admin");
  await shot(alice, "admin-moderation.jpg", alice.locator("main"));
  // Clean up: remove it for good (it stays hidden, and the audit log records it).
  await alice
    .getByRole("list", { name: "Reported shoutouts" })
    .getByRole("listitem")
    .filter({ hasText: message })
    .getByRole("button", { name: "Remove" })
    .click();

  await alice.goto("/admin/cards");
  await shot(alice, "admin-cards.jpg", alice.locator("main"));
  await alice.goto("/admin/export");
  await shot(alice, "admin-export.jpg", alice.locator("main"));
  await alice.goto("/analytics");
  await shot(alice, "analytics.jpg", alice.locator("main"));
});
