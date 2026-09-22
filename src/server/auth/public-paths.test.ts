import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each([
    "/signin",
    "/api/auth/callback/keycloak",
    "/api/health",
    "/api/ready",
    "/brand/logo.svg",
    "/about",
    "/guide",
    "/guide/feed.jpg",
  ])("allows %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/", "/admin", "/signinx", "/api/kudos"])("protects %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
