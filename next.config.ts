import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false,
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
      { source: "/about/volunteer", destination: "/get-involved#volunteer", permanent: true },
      { source: "/about/donations", destination: "/support", permanent: true },
    ];
  },
};

export default nextConfig;
