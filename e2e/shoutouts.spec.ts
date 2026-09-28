import { expect, test } from "@playwright/test";
import { choose, e2eMessage, feedItem, remainingBudget, sendShoutout, signInAs } from "./helpers";

test.describe("sending shoutouts", () => {
  test("send to two people, see it in the feed, then delete for a refund", async ({ page }) => {
    await signInAs(page, "dave");
    const before = await remainingBudget(page);
    const message = e2eMessage("Thanks for pairing on the release!");

    await sendShoutout(page, { to: ["Carol Chen", "Erin Evans"], card: "Team Player", message });

    const item = feedItem(page, message);
    await expect(item).toBeVisible();
    await expect(item).toContainText("Carol Chen and Erin Evans");
    await expect(item).toContainText("#Collaboration");
    await expect(item).toContainText("Team Player");
    expect(await remainingBudget(page)).toBe(before - 2);

    page.once("dialog", (dialog) => dialog.accept());
    await item.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText(/deleted and your budget refunded/i);
    await expect(feedItem(page, message)).toHaveCount(0);
    expect(await remainingBudget(page)).toBe(before);
  });

  test("recipients and colleagues see public shoutouts; private ones stay private", async ({
    browser,
  }) => {
    const publicMessage = e2eMessage("Brilliant demo today");
    const privateMessage = e2eMessage("Thank you for the kind words");

    const frank = await browser.newPage();
    await signInAs(frank, "frank");
    await sendShoutout(frank, { to: ["Grace Gupta"], message: publicMessage, value: "Excellence" });
    await sendShoutout(frank, {
      to: ["Grace Gupta"],
      message: privateMessage,
      visibility: "Private",
      card: "Mentor",
    });
    await expect(feedItem(frank, privateMessage)).toContainText("Private");

    const grace = await browser.newPage();
    await signInAs(grace, "grace");
    await expect(feedItem(grace, publicMessage)).toBeVisible();
    await expect(feedItem(grace, privateMessage)).toBeVisible();
    // Recipients can't edit or delete.
    await expect(
      feedItem(grace, publicMessage).getByRole("button", { name: "Delete" }),
    ).toHaveCount(0);

    const henry = await browser.newPage();
    await signInAs(henry, "henry");
    await expect(feedItem(henry, publicMessage)).toBeVisible();
    await expect(feedItem(henry, privateMessage)).toHaveCount(0);

    for (const message of [publicMessage, privateMessage]) {
      frank.once("dialog", (dialog) => dialog.accept());
      await feedItem(frank, message).getByRole("button", { name: "Delete" }).click();
      await expect(frank.getByRole("status")).toHaveText(/deleted/i);
    }
  });

  test("a shoutout can celebrate several values", async ({ page }) => {
    await signInAs(page, "henry");
    const message = e2eMessage("Thanks for pairing on the migration");
    await sendShoutout(page, {
      to: ["Frank Fischer"],
      value: ["Collaboration", "Excellence"],
      message,
    });
    const item = feedItem(page, message);
    await expect(item).toContainText("#Collaboration");
    await expect(item).toContainText("#Excellence");

    page.once("dialog", (dialog) => dialog.accept());
    await item.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText(/deleted/i);
  });

  test("Recognise on a profile starts a shoutout to that person", async ({ page }) => {
    await signInAs(page, "grace");
    await page.goto("/people");
    await page.getByRole("searchbox").fill("Carol");
    await expect(page.getByText("1 person found")).toBeVisible();
    await page
      .getByRole("link", { name: /Carol Chen/ })
      .first()
      .click();
    await page.getByRole("link", { name: "Recognise Carol" }).click();
    await expect(page.getByRole("heading", { name: "Send a shoutout" })).toBeVisible();
    await expect(page.locator('input[name="recipientIds"]')).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("To Carol Chen");
  });

  test("the sender can edit a shoutout", async ({ page }) => {
    await signInAs(page, "erin");
    const message = e2eMessage("Great support call");
    await sendShoutout(page, { to: ["Henry Hughes"], message });

    await feedItem(page, message).getByRole("link", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit shoutout" })).toBeVisible();
    const edited = e2eMessage("Amazing support call, customer was delighted");
    await page.getByLabel("Say thanks").fill(edited);
    await choose(page, "Customer Hero");
    await choose(page, "Engagement");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("status")).toHaveText(/updated/i);
    const item = feedItem(page, edited);
    await expect(item).toContainText("Customer Hero");
    await expect(item).toContainText("#Engagement");
    await expect(item).toContainText("edited");

    page.once("dialog", (dialog) => dialog.accept());
    await item.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText(/deleted/i);
  });

  test("shows validation errors and can't pick yourself", async ({ page }) => {
    await signInAs(page, "carol");
    await page.goto("/shoutouts/new");
    await page.getByRole("button", { name: "Send shoutout" }).click();
    await expect(page.getByText(/check the highlighted fields/i)).toBeVisible();
    await expect(page.getByText("Pick at least one person")).toBeVisible();
    await expect(page.getByText("Pick a company value")).toBeVisible();
    await expect(page.getByText("Write a short message")).toBeVisible();

    await page.getByRole("combobox", { name: /who are you recognising/i }).fill("Carol");
    await expect(page.getByRole("option", { name: /Carol Chen/ })).toHaveCount(0);
  });
});
