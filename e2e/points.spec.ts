import { expect, test } from "@playwright/test";
import { choose, e2eMessage, feedItem, signInAs } from "./helpers";

// Points mode is on in the local deployment (deploy/local/values-local.yaml).
test.describe("points", () => {
  test("only the sender, the recipient and admins see a shoutout's points", async ({ browser }) => {
    test.setTimeout(120_000);
    const message = e2eMessage("Thanks for jumping on the incident at 2am");

    const erin = await browser.newPage();
    await signInAs(erin, "erin");
    const pointsMeter = erin.getByRole("progressbar", { name: "Points left to give this quarter" });
    const before = Number(await pointsMeter.getAttribute("aria-valuenow"));
    await erin.goto("/shoutouts/new");
    await erin.getByRole("combobox", { name: /who are you recognising/i }).fill("Grace");
    await erin.getByRole("option", { name: /Grace Gupta/ }).click();
    await choose(erin, "Customer Hero");
    await choose(erin, "Engagement");
    await erin.getByLabel("Say thanks").fill(message);
    await choose(erin, "🎁 5");
    await expect(erin.getByText(/It gives 5 of your \d+ points\./)).toBeVisible();
    await erin.getByRole("button", { name: "Send shoutout" }).click();
    await expect(erin.getByRole("status")).toHaveText(/shoutout sent/i);
    await expect(feedItem(erin, message)).toContainText("🎁 5 points");
    expect(Number(await pointsMeter.getAttribute("aria-valuenow"))).toBe(before - 5);

    const grace = await browser.newPage();
    await signInAs(grace, "grace");
    await expect(feedItem(grace, message)).toContainText("🎁 5 points");

    const bob = await browser.newPage();
    await signInAs(bob, "bob");
    await expect(feedItem(bob, message)).toBeVisible();
    await expect(feedItem(bob, message)).not.toContainText("points");

    // Everyone sees the points ranking, but only in order: no totals.
    await bob.goto("/leaderboard?period=all");
    const pointsBoard = bob.getByRole("region", { name: "Most points received" });
    await expect(pointsBoard.getByRole("listitem").first()).toHaveAccessibleName(/^Rank 1: [^,]+$/);

    const alice = await browser.newPage();
    await signInAs(alice, "alice");
    await expect(feedItem(alice, message)).toContainText("🎁 5 points");
    await alice.goto("/leaderboard?period=all");
    await expect(
      alice.getByRole("region", { name: "Most points received" }).getByRole("listitem").first(),
    ).toHaveAccessibleName(/^Rank 1: .+, \d+ points received$/);
    await alice.goto("/admin/points");
    await expect(alice.getByRole("row", { name: /Grace Gupta/ })).toBeVisible();
    await expect(alice.getByRole("link", { name: "Download points.csv" })).toBeVisible();

    // Clean up: deleting within 24 hours refunds Erin's points.
    await erin.goto("/");
    erin.once("dialog", (dialog) => void dialog.accept());
    await feedItem(erin, message).getByRole("button", { name: "Delete" }).click();
    await expect(erin.getByRole("status")).toHaveText(/deleted/i);
    expect(Number(await pointsMeter.getAttribute("aria-valuenow"))).toBe(before);
  });
});
