import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false,
  // Playwright's default baseURL is 127.0.0.1, which Next.js dev treats as a
  // different origin than localhost and blocks HMR/static chunk requests
  // from by default, silently breaking all client-side interactivity.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/thumbnail",
      },
      // Gear photos in Supabase Storage (#781). Written out statically rather
      // than derived from NEXT_PUBLIC_SUPABASE_URL: CI's `quality` job runs
      // `bun run build` with no Supabase env set, so parsing that variable here
      // would throw and take the deploy gate down. The `pathname` is what makes
      // the wildcard host safe -- it admits one bucket's public prefix, not
      // arbitrary content on any Supabase project. Both local hostnames are
      // listed because `supabase status` reports 127.0.0.1 while .env.local is
      // often written by hand as localhost.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/gear-photos/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/gear-photos/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/gear-photos/**",
      },
    ],
  },
  async redirects() {
    return [
      // `/about/volunteer` stays permanent: /get-involved is not behind a
      // visibility toggle in practice and the destination resolves today.
      {
        source: "/about/volunteer",
        destination: "/get-involved#volunteer",
        permanent: true,
      },
      // These two are deliberately NOT permanent. Their destinations sit behind
      // the page-visibility gate, so while the board has Programs or Support
      // hidden they resolve to a 404 -- and a 308 into a 404 is cached by the
      // browser indefinitely, so the visitor would keep landing there even
      // after the board turns the section back on. 307 keeps the redirect
      // working without burning it in. Restore `permanent: true` once both
      // sections are approved and permanently live.
      { source: "/about/programs", destination: "/programs", permanent: false },
      { source: "/about/donations", destination: "/support", permanent: false },
      // `/gears/*` -> `/inventory/*` (#897). One tenant's word for what it
      // lends is out of the URL; the label it renders under is the lexicon's
      // job (#896). `:path*` matches zero segments too, so this covers bare
      // `/gears`, which was itself a redirect to `/gears/library`.
      //
      // Permanent, unlike the two above, and for a reason that survives the
      // visibility gate: the destination is the same content at its new
      // address, not a different section. A 308 a browser caches forever
      // still resolves correctly whether or not the board has the section
      // shown -- a visitor lands on `/inventory/...`, which 404s exactly as
      // `/gears/...` did while the section is hidden, and works the moment it
      // is not.
      {
        source: "/gears/:path*",
        destination: "/inventory/:path*",
        permanent: true,
      },
      // `/events/<uuid>` -> `/events/e/<uuid>`. Events moved a segment down
      // because #847's intercepting sheet, `@modal/(.)[id]`, matched every
      // single segment under /events -- `/events/community` included -- and is
      // matched ahead of the static route that should have served it. See
      // (public)/events/event-path.ts for the full account.
      //
      // The id is constrained to a uuid rather than `:id`, which is the whole
      // point: a bare `:id` would swallow `/events/community` here exactly as
      // the sheet did, having fixed nothing.
      //
      // Permanent for the same reason `/gears/*` is, and not for the reason
      // the two 307s above are not: this is the same content at a new address,
      // and both URLs sit behind the same Events visibility gate, so a 308 a
      // browser caches forever still resolves correctly -- it lands on
      // `/events/e/...`, which 404s exactly as `/events/...` did while the
      // section is hidden, and works the moment it is not. Done here rather
      // than as a page that calls `permanentRedirect()`, because that renders
      // a 200 carrying a client-side redirect; this is a real 308, issued
      // before any rendering, which is what a crawler needs to move the link
      // equity over.
      {
        source: "/events/:id([0-9a-fA-F-]{36})",
        destination: "/events/e/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
