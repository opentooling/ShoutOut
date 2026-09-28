import { z } from "zod";
import { MESSAGE_MAX_LENGTH } from "@/lib/config";

const message = z
  .string()
  .trim()
  .min(1, "Write a short message")
  .max(MESSAGE_MAX_LENGTH, `Keep it to ${MESSAGE_MAX_LENGTH} characters or fewer`);

const visibility = z.enum(["PUBLIC", "PRIVATE"]);

/** Company values, in the order picked, without repeats. */
function valueIds(maxValues: number) {
  return z
    .array(z.string().min(1))
    .transform((ids) => [...new Set(ids)])
    .pipe(
      z
        .array(z.string())
        .min(1, "Pick a company value")
        .max(
          maxValues,
          maxValues === 1 ? "Pick one company value" : `Pick up to ${maxValues} company values`,
        ),
    );
}

function details(maxValues: number) {
  return {
    cardId: z.string().min(1, "Pick a card"),
    valueIds: valueIds(maxValues),
    message,
    visibility,
  };
}

/** Points per recipient; empty means none. Which amounts are allowed is checked when sending. */
const points = z.coerce
  .number({ error: "Pick an amount of points" })
  .int("Pick an amount of points")
  .min(0, "Pick an amount of points")
  .default(0);

export function sendShoutoutSchema(maxRecipients: number, maxValues: number) {
  return z.object({
    points,
    recipientIds: z
      .array(z.string().min(1))
      .transform((ids) => [...new Set(ids)])
      .pipe(
        z
          .array(z.string())
          .min(1, "Pick at least one person")
          .max(maxRecipients, `You can recognise up to ${maxRecipients} people at once`),
      ),
    ...details(maxValues),
  });
}

export function editShoutoutSchema(maxValues: number) {
  return z.object(details(maxValues));
}

export type SendShoutoutInput = z.output<ReturnType<typeof sendShoutoutSchema>>;
export type EditShoutoutInput = z.output<ReturnType<typeof editShoutoutSchema>>;

/** First error message per field, for showing next to form inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    result[field] ??= issue.message;
  }
  return result;
}
