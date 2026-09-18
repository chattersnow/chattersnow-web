import * as Sentry from "@sentry/nextjs";

// Edge runtime -- `src/proxy.ts` and any edge route handler. Loaded by
// `src/instrumentation.ts` when NEXT_RUNTIME is "edge". This is a separate
// init because the edge runtime is a separate JavaScript environment with no
// access to the Node APIs the server config relies on.
Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://7e58098c646de634c9c1a1cb736bd1f3@o4512096441401344.ingest.us.sentry.io/4512096496910336",

  tracesSampleRate: 0,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  enableLogs: true,
});
