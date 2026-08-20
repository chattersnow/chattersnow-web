"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "home", label: "Home", href: "/home" },
  { value: "about", label: "About Us", href: "/about" },
  { value: "events", label: "Events", href: "/events" },
  { value: "gears", label: "Gears", href: "/gears" },
  { value: "contact", label: "Contact Us", href: "/contact" },
] as const;

function activeTabFor(pathname: string) {
  if (pathname.startsWith("/about")) return "about";
  if (pathname.startsWith("/events")) return "events";
  if (pathname.startsWith("/gears")) return "gears";
  if (pathname.startsWith("/contact")) return "contact";
  return "home";
}

export function PublicTabs() {
  const pathname = usePathname();
  const active = activeTabFor(pathname);

  return (
    <Tabs value={active}>
      <TabsList variant="line">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            nativeButton={false}
            render={<Link href={tab.href} />}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
