import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import screenshots from "./guide-screenshots.json";
import { GUIDE_SECTIONS, guideToMarkdown } from "./user-guide";

const root = process.cwd();

describe("user guide", () => {
  it("has unique section ids and a screenshot captured for every section that names one", () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { screenshot } of GUIDE_SECTIONS) {
      expect(screenshots, screenshot.file).toHaveProperty(screenshot.file);
      expect(existsSync(path.join(root, "public/guide", screenshot.file)), screenshot.file).toBe(
        true,
      );
    }
  });

  it("docs/USER-GUIDE.md is up to date (run `npm run guide:docs`)", () => {
    expect(readFileSync(path.join(root, "docs/USER-GUIDE.md"), "utf8")).toBe(
      guideToMarkdown("../public/guide"),
    );
  });

  it("renders steps, tips, images and the admin part as Markdown", () => {
    const markdown = guideToMarkdown("/img");
    expect(markdown).toMatch(/^# ShoutOut user guide\n/);
    expect(markdown).toContain("- [Moderation](#admin-moderation) (admins)");
    expect(markdown).toContain('<a id="sending-a-shoutout"></a>\n\n### Sending a shoutout');
    expect(markdown).toContain("1. Choose **Send a shoutout** on the feed.");
    expect(markdown).toContain("- You can't send a shoutout to yourself.");
    expect(markdown).toContain("](/img/send.jpg)");
    expect(markdown.indexOf("## For admins")).toBeGreaterThan(markdown.indexOf("### Reporting"));
  });
});
