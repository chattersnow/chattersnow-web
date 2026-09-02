import type { Metadata } from "next";
import { PortalUrlCanonicalizer } from "./portal-url-canonicalizer";

export const metadata: Metadata = {
  title: {
    default: "Chatter Snow Portal",
    template: "%s | Chatter Snow Portal",
  },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PortalUrlCanonicalizer />
      {children}
    </>
  );
}
