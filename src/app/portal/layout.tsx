import type { Metadata } from "next";

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
  return children;
}
