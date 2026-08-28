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
      { source: "/about/programs", destination: "/programs", permanent: true },
      {
        source: "/about/volunteer",
        destination: "/get-involved#volunteer",
        permanent: true,
      },
      { source: "/about/donations", destination: "/support", permanent: true },
    ];
  },
};

export default nextConfig;
