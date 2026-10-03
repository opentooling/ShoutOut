#!/usr/bin/env node
// npm audit with accepted findings, like .trivyignore for the images.
// Fails on any high or critical advisory that isn't listed in .npm-audit-ignore
// (one GHSA id per line, with a reason and a review date after a #), and on
// listed ids that no longer appear, so the list doesn't go stale.
//   node scripts/npm-audit.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoreFile = path.join(root, ".npm-audit-ignore");
const SEVERE = new Set(["high", "critical"]);

const accepted = new Set(
  existsSync(ignoreFile)
    ? readFileSync(ignoreFile, "utf8")
        .split("\n")
        .map((line) => line.replace(/#.*/, "").trim())
        .filter(Boolean)
    : [],
);

let report;
try {
  report = execFileSync("npm", ["audit", "--json"], { cwd: root, encoding: "utf8" });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  report = error.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);

const found = new Map();
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  for (const via of vulnerability.via) {
    if (typeof via !== "object" || !SEVERE.has(via.severity)) continue;
    const id = via.url.split("/").pop();
    found.set(id, { name, severity: via.severity, title: via.title, url: via.url });
  }
}

const blocking = [...found].filter(([id]) => !accepted.has(id));
const stale = [...accepted].filter((id) => !found.has(id));

for (const [id, v] of found) {
  const status = accepted.has(id) ? "accepted" : "BLOCKING";
  console.log(`${status.padEnd(8)}  ${v.severity.padEnd(8)}  ${v.name}  ${id}  ${v.title}`);
}
for (const id of stale) {
  console.log(`stale     ${id} is in .npm-audit-ignore but no longer reported: remove it`);
}
if (blocking.length > 0 || stale.length > 0) process.exit(1);
console.log(
  found.size === 0
    ? "No high or critical advisories."
    : "Only accepted advisories (see .npm-audit-ignore).",
);
