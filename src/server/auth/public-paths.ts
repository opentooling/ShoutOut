// /api/internal routes authenticate with their own bearer token.
const PUBLIC_PREFIXES = [
  "/signin",
  "/api/auth",
  "/api/health",
  "/api/ready",
  "/api/internal",
  "/brand",
  "/about",
  // The user guide page and its screenshots (public/guide/*).
  "/guide",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
