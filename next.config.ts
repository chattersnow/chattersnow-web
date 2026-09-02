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
    ];
  },
};

export default nextConfig;
