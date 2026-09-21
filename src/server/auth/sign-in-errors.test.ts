import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-errors";

describe("signInErrorMessage", () => {
  it("has nothing to say without an error", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
    expect(signInErrorMessage(["Configuration"])).toBeNull();
  });

  it("explains the Auth.js error types", () => {
    expect(signInErrorMessage("AccessDenied")).toMatch(/isn't allowed/);
    expect(signInErrorMessage("Configuration")).toMatch(/server logs \(scope "auth"\)/);
    expect(signInErrorMessage("OAuthCallbackError")).toBe(
      "Sign-in didn't complete. Please try again.",
    );
  });
});
