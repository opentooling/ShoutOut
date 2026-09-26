export type DomainErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SELF_RECIPIENT"
  | "RECIPIENT_NOT_FOUND"
  | "CARD_NOT_FOUND"
  | "VALUE_NOT_FOUND"
  | "BUDGET_EXCEEDED"
  | "POINTS_EXCEEDED"
  | "INVALID_POINTS"
  | "EDIT_WINDOW_CLOSED"
  | "ALREADY_REPORTED"
  | "DUPLICATE"
  | "LAST_ACTIVE"
  | "INVALID_STATE";

/** An expected business-rule failure whose message is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    /** Form field the error relates to, if any. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
