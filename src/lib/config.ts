export const MESSAGE_MAX_LENGTH = 280;

export const ANALYTICS_VISIBILITY = ["admins", "everyone"] as const;
export type AnalyticsVisibility = (typeof ANALYTICS_VISIBILITY)[number];

export interface PointsConfig {
  /** Points mode: people can add points to a shoutout, from a quarterly points budget. */
  enabled: boolean;
  /** Points each person can give per calendar quarter (each recipient gets the full amount). */
  quarterlyBudget: number;
  /** Amounts to choose from, per recipient, smallest first. */
  choices: number[];
}

export interface AppConfig {
  /** Whether shoutouts are limited per quarter; when off, people can send as many as they like. */
  budgetEnabled: boolean;
  /** Shoutouts each person can send per calendar quarter (each recipient uses one). */
  quarterlyBudget: number;
  points: PointsConfig;
  /** Maximum people in a single shoutout. */
  maxRecipients: number;
  /** Maximum company values on a single shoutout (1 means pick one). */
  maxValues: number;
  /** Who can open the analytics dashboard. */
  analyticsVisibility: AnalyticsVisibility;
}

export const DEFAULT_CONFIG: AppConfig = {
  budgetEnabled: true,
  quarterlyBudget: 20,
  points: { enabled: false, quarterlyBudget: 100, choices: [5, 10, 25, 50] },
  maxRecipients: 5,
  maxValues: 3,
  analyticsVisibility: "admins",
};

function oneOf<T extends string>(
  raw: string | undefined,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw?.trim();
  if (!value) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${raw}"`);
  }
  return value as T;
}

function positiveInt(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number, got "${raw}"`);
  }
  return value;
}

function flag(raw: string | undefined, name: string, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false, got "${raw}"`);
}

/** "5, 10,25" -> [5, 10, 25]: positive whole numbers, sorted, without duplicates. */
function pointChoices(raw: string | undefined, name: string, fallback: number[]): number[] {
  if (raw === undefined || raw.trim() === "") return fallback;
  const values = raw.split(",").map((part) => Number(part.trim()));
  if (values.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error(
      `${name} must be a comma-separated list of positive whole numbers, got "${raw}"`,
    );
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    budgetEnabled: flag(
      env.SHOUTOUT_BUDGET_ENABLED,
      "SHOUTOUT_BUDGET_ENABLED",
      DEFAULT_CONFIG.budgetEnabled,
    ),
    quarterlyBudget: positiveInt(
      env.SHOUTOUT_QUARTERLY_BUDGET,
      "SHOUTOUT_QUARTERLY_BUDGET",
      DEFAULT_CONFIG.quarterlyBudget,
    ),
    maxRecipients: positiveInt(
      env.SHOUTOUT_MAX_RECIPIENTS,
      "SHOUTOUT_MAX_RECIPIENTS",
      DEFAULT_CONFIG.maxRecipients,
    ),
    maxValues: positiveInt(
      env.SHOUTOUT_MAX_VALUES,
      "SHOUTOUT_MAX_VALUES",
      DEFAULT_CONFIG.maxValues,
    ),
    analyticsVisibility: oneOf(
      env.SHOUTOUT_ANALYTICS_VISIBILITY,
      "SHOUTOUT_ANALYTICS_VISIBILITY",
      ANALYTICS_VISIBILITY,
      DEFAULT_CONFIG.analyticsVisibility,
    ),
    points: {
      enabled: flag(
        env.SHOUTOUT_POINTS_ENABLED,
        "SHOUTOUT_POINTS_ENABLED",
        DEFAULT_CONFIG.points.enabled,
      ),
      quarterlyBudget: positiveInt(
        env.SHOUTOUT_POINTS_QUARTERLY_BUDGET,
        "SHOUTOUT_POINTS_QUARTERLY_BUDGET",
        DEFAULT_CONFIG.points.quarterlyBudget,
      ),
      choices: pointChoices(
        env.SHOUTOUT_POINTS_CHOICES,
        "SHOUTOUT_POINTS_CHOICES",
        DEFAULT_CONFIG.points.choices,
      ),
    },
  };
}
