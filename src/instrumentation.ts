import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook. Runs once per server runtime, before any
 * request is handled, which is the only place Sentry can be initialized early
 * enough to catch failures during module evaluation.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Catches unhandled errors thrown in Server Components, route handlers and
// `src/proxy.ts`. Without this export, a server render that throws produces a
// digest in the browser and nothing in Sentry.
export const onRequestError = Sentry.captureRequestError;
