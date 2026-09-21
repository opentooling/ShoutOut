import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkAuthSetup } = await import("./server/auth/diagnostics");
    const { startupSync } = await import("./server/users/startup-sync");
    void checkAuthSetup();
    void startupSync();
  }
}

/** Logs unhandled errors from pages, routes and server actions with full detail. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { createLogger } = await import("./lib/logger");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  createLogger("request").error("Unhandled error", {
    method: request.method,
    path: request.path,
    route: context.routePath,
    routeType: context.routeType,
    digest,
    error,
  });
};
