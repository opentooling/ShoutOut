// Writes docs/USER-GUIDE.md from src/content/user-guide.ts (npm run guide:docs).
import { writeFileSync } from "node:fs";
import { guideToMarkdown } from "../src/content/user-guide.ts";

writeFileSync("docs/USER-GUIDE.md", guideToMarkdown("../public/guide"));
console.log("Wrote docs/USER-GUIDE.md");
