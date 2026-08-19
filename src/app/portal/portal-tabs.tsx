"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "overview", label: "Overview", href: "/portal/home" },
  { value: "events", label: "Events", href: "/portal/events" },
  { value: "inventory", label: "Inventory", href: "/portal/inventory" },
] as const;

function activeTabFor(pathname: string) {
  if (pathname.startsWith("/portal/events")) return "events";
  if (pathname.startsWith("/portal/inventory")) return "inventory";
  return "overview";
}

export function PortalTabs() {
  const pathname = usePathname();
  const active = activeTabFor(pathname);

  return (
    <Tabs value={active} className="mt-6">
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
