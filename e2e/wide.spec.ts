import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Very wide monitors: no sideways scrolling, and the header lines up with the page.
const PAGES = ["/", "/leaderboard", "/people", "/shoutouts/new", "/analytics", "/admin", "/guide"];

test.describe("very wide screens", () => {
  for (const width of [1920, 2560, 3440]) {
    test(`signed-in pages at ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 1300 });
      await signInAs(page, "alice");
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const layout = await page.evaluate(() => {
          const header = document.querySelector("header > div")!.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            headerLeft: header.left,
            headerWidth: header.width,
          };
        });
        expect(layout.overflow, path).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: testInfo.outputPath(`${width}${path.replace(/\//g, "_") || "_"}.png`),
        });
        // The header container is centred and doesn't stretch across the whole screen.
        expect(layout.headerWidth, path).toBeLessThan(width * 0.8);
      }
    });
  }
});
