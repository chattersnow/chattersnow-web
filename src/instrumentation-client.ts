import * as Sentry from "@sentry/nextjs";

// Browser runtime. Next.js loads this file itself -- it is not imported from
// `src/instrumentation.ts`, which only covers the server and edge runtimes.
//
// The DSN is written out rather than read from an environment variable on
// purpose: it is a public, write-only ingest key (the same value ships inside
// the client bundle either way), and hardcoding it means Preview deploys and
// every future tenant host report to Sentry without anyone remembering to set
// a variable in Vercel first.
Sentry.init({
  dsn: "https://7e58098c646de634c9c1a1cb736bd1f3@o4512096441401344.ingest.us.sentry.io/4512096496910336",

  // `dataCollection` is deliberately absent. Omitting it leaves the SDK on its
  // conservative defaults (it falls back to `sendDefaultPii`, which is false),
  // so user identity, cookies, headers, request bodies and query strings are
  // not attached to events. Passing the option -- *even as `{}`* -- flips
  // every category it does not name to its permissive default, which on a
  // platform holding constituent and donor records is the wrong way to fail.
  // Opt in one category at a time if an issue genuinely can't be diagnosed
  // without it.

  // 100% locally so a change can be verified immediately; 10% in production,
  // which is what the free plan's span quota can carry. Raise it if traces
  // turn out to be too sparse to be useful.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Tags every event with the deploy that produced it. Vercel exposes its
  // system variables to the browser bundle under the NEXT_PUBLIC_ prefix, so
  // this resolves to "production" on chattersnow.org, "preview" on
  // uat.chattersnow.org, and NODE_ENV locally. Without it, regression
  // detection and "resolve in next release" have nothing to work with.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Turns on the Logs product. Nothing is sent until something calls
  // `Sentry.logger.*` -- console output is not forwarded unless
  // `consoleLoggingIntegration` is added -- so this costs no quota today.
  enableLogs: true,

  // Session Replay is intentionally not enabled: the free Developer plan
  // includes 50 replays a month, which one afternoon of real traffic would
  // exhaust. Add `Sentry.replayIntegration()` plus `replaysOnErrorSampleRate`
  // if the plan ever changes.
});

// Records App Router client-side navigations as spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
