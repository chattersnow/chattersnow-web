import * as Sentry from "@sentry/nextjs";

// Browser runtime. Next.js loads this file itself -- it is not imported from
// `src/instrumentation.ts`, which only covers the server and edge runtimes.
//
// The DSN comes from NEXT_PUBLIC_SENTRY_DSN when it is set, and falls back to
// the literal below -- which is safe to commit, being a public, write-only
// ingest key that ships inside the client bundle either way. The fallback is
// what matters: an unset variable degrades to reporting into the project we
// already use, so Preview deploys and every future tenant host keep reporting
// without anyone remembering to set a variable in Vercel first, while setting
// it is how a deployment is pointed at a different Sentry project.
Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://7e58098c646de634c9c1a1cb736bd1f3@o4512096441401344.ingest.us.sentry.io/4512096496910336",

  // `dataCollection` is deliberately absent. Omitting it leaves the SDK on its
  // conservative defaults (it falls back to `sendDefaultPii`, which is false),
  // so user identity, cookies, headers, request bodies and query strings are
  // not attached to events. Passing the option -- *even as `{}`* -- flips
  // every category it does not name to its permissive default, which on a
  // platform holding constituent and donor records is the wrong way to fail.
  // Opt in one category at a time if an issue genuinely can't be diagnosed
  // without it.

  // Off everywhere. The free plan's 5k/month is an *error* quota; spans draw on
  // a separate, smaller one, and nothing here reads the trace view today. This
  // is not what ties an error to its request: trace ids are propagated whatever
  // this is set to, so an event still carries one -- raising this is how a
  // trace gets spans in it, not how it gets correlated.
  tracesSampleRate: 0,

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
