import * as Sentry from "@sentry/nextjs";

// Node.js runtime -- Server Components, route handlers and server actions.
// Loaded by `src/instrumentation.ts` when NEXT_RUNTIME is "nodejs".
// See `src/instrumentation-client.ts` for why the DSN has a committed
// fallback, why tracing is off, and why `dataCollection` is deliberately
// omitted.
Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://7e58098c646de634c9c1a1cb736bd1f3@o4512096441401344.ingest.us.sentry.io/4512096496910336",

  tracesSampleRate: 0,

  // Server-side, Vercel's system variables are available unprefixed.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Attaches the value of local variables to server stack frames, which is
  // usually the difference between "a query returned null" and knowing which
  // id was passed. Node only, and it does not apply to the edge runtime.
  includeLocalVariables: true,

  enableLogs: true,
});
