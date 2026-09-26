import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import screenshots from "./guide-screenshots.json";
import { GUIDE_SECTIONS, guideSections, guideToMarkdown } from "./user-guide";

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

  it("labels the parts that depend on a feature in the Markdown copy", () => {
    const markdown = guideToMarkdown("/img");
    expect(markdown).toContain("### Adding points\n\n*If your company uses points.* You can add");
    expect(markdown).toContain(
      "- *If your company limits shoutouts per quarter:* Deleting gives back the shoutouts",
    );
  });

  it("leaves out sections and lines for features that are off", () => {
    const titles = (sections: { title: string }[]) => sections.map((s) => s.title);
    const none = guideSections({ points: false, budget: false });
    expect(titles(none)).not.toContain("Adding points");
    expect(titles(none)).not.toContain("Your quarterly budget");
    expect(JSON.stringify(none)).not.toMatch(/points/i);
    const editing = none.find((s) => s.id === "editing-and-deleting")!;
    expect(editing.tips).toEqual(["After 24 hours the Edit and Delete buttons disappear."]);

    const all = guideSections({ points: true, budget: true });
    expect(all).toHaveLength(GUIDE_SECTIONS.length);
    expect(all.find((s) => s.id === "editing-and-deleting")!.tips).toHaveLength(3);
    expect(all.every((s) => (s.tips ?? []).every((tip) => typeof tip === "string"))).toBe(true);
  });
});
