import { expect, test } from "@playwright/test";

test.describe("branding", () => {
  test("serves the favicon and app icons", async ({ request }) => {
    for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png", "/brand/logo.svg"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });

  test("style guide shows every card", async ({ page }) => {
    await page.goto("/brand");
    await expect(page).toHaveTitle("Brand · ShoutOut");
    await expect(page.locator("figure")).toHaveCount(10);
  });

  test("theme choice persists across reloads", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/brand");
    await page.getByRole("radio", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: "Dark theme" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(27, 26, 33)");

    await page.getByRole("radio", { name: "Match system theme" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  });

  test("the about page explains the idea without signing in", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveTitle("About · ShoutOut");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why ShoutOut?");
    await expect(
      page.getByRole("heading", { name: /why you only get \d+ a quarter/i }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign in to get started" }).click();
    await expect(page).toHaveURL(/\/signin/);
  });

  test("the user guide is readable without signing in, with its screenshots", async ({ page }) => {
    await page.goto("/guide");
    await expect(page).toHaveTitle("User guide · ShoutOut");
    await page.getByRole("link", { name: "Sending a shoutout" }).click();
    await expect(page).toHaveURL(/#sending-a-shoutout$/);
    const image = page.getByRole("img", { name: /Send a shoutout form/ });
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("no horizontal scrolling on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ["/signin", "/brand", "/about", "/guide"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
