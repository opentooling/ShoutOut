import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "./config";

describe("loadConfig", () => {
  it("uses defaults when unset or blank", () => {
    expect(loadConfig({})).toEqual(DEFAULT_CONFIG);
    expect(
      loadConfig({
        SHOUTOUT_QUARTERLY_BUDGET: " ",
        SHOUTOUT_MAX_RECIPIENTS: "",
        SHOUTOUT_ANALYTICS_VISIBILITY: " ",
      }),
    ).toEqual(DEFAULT_CONFIG);
  });

  it("reads values from the environment", () => {
    expect(
      loadConfig({
        SHOUTOUT_QUARTERLY_BUDGET: "12",
        SHOUTOUT_MAX_RECIPIENTS: "3",
        SHOUTOUT_ANALYTICS_VISIBILITY: "everyone",
      }),
    ).toMatchObject({ quarterlyBudget: 12, maxRecipients: 3, analyticsVisibility: "everyone" });
  });

  it("reads the budget and points flags", () => {
    expect(
      loadConfig({
        SHOUTOUT_BUDGET_ENABLED: " FALSE ",
        SHOUTOUT_POINTS_ENABLED: "true",
        SHOUTOUT_POINTS_QUARTERLY_BUDGET: "250",
        SHOUTOUT_POINTS_CHOICES: "25, 5,10 ,5",
      }),
    ).toMatchObject({
      budgetEnabled: false,
      points: { enabled: true, quarterlyBudget: 250, choices: [5, 10, 25] },
    });
    expect(loadConfig({ SHOUTOUT_BUDGET_ENABLED: "true" }).budgetEnabled).toBe(true);
    expect(DEFAULT_CONFIG).toMatchObject({
      budgetEnabled: true,
      points: { enabled: false, quarterlyBudget: 100, choices: [5, 10, 25, 50] },
    });
  });

  it("rejects invalid flags and point choices", () => {
    expect(() => loadConfig({ SHOUTOUT_POINTS_ENABLED: "yes" })).toThrow(
      'SHOUTOUT_POINTS_ENABLED must be true or false, got "yes"',
    );
    expect(() => loadConfig({ SHOUTOUT_POINTS_CHOICES: "5,0" })).toThrow(
      /SHOUTOUT_POINTS_CHOICES must be a comma-separated list of positive whole numbers/,
    );
    expect(() => loadConfig({ SHOUTOUT_POINTS_CHOICES: "5,,10" })).toThrow(
      /SHOUTOUT_POINTS_CHOICES/,
    );
  });

  it.each(["0", "-2", "2.5", "lots"])("rejects invalid budget %s", (raw) => {
    expect(() => loadConfig({ SHOUTOUT_QUARTERLY_BUDGET: raw })).toThrow(
      /SHOUTOUT_QUARTERLY_BUDGET must be a positive whole number/,
    );
  });

  it("rejects unknown analytics visibility", () => {
    expect(() => loadConfig({ SHOUTOUT_ANALYTICS_VISIBILITY: "managers" })).toThrow(
      'SHOUTOUT_ANALYTICS_VISIBILITY must be one of admins, everyone, got "managers"',
    );
  });

  it("uses process.env by default", () => {
    expect(loadConfig().quarterlyBudget).toBeGreaterThan(0);
  });
});
