"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "board-members", label: "Board Members", href: "/portal/governance/board-members" },
  { value: "meetings", label: "Meetings", href: "/portal/governance/meetings" },
  { value: "bylaws", label: "Bylaws", href: "/portal/governance/bylaws" },
  { value: "policies", label: "Policies", href: "/portal/governance/policies" },
  {
    value: "conflict-of-interest",
    label: "Conflict of Interest",
    href: "/portal/governance/conflict-of-interest",
  },
  {
    value: "annual-requirements",
    label: "Annual Requirements",
    href: "/portal/governance/annual-requirements",
  },
] as const;

function activeTabFor(pathname: string) {
  if (pathname.startsWith("/portal/governance/meetings")) return "meetings";
  if (pathname.startsWith("/portal/governance/bylaws")) return "bylaws";
  if (pathname.startsWith("/portal/governance/policies")) return "policies";
  if (pathname.startsWith("/portal/governance/conflict-of-interest")) return "conflict-of-interest";
  if (pathname.startsWith("/portal/governance/annual-requirements")) return "annual-requirements";
  return "board-members";
}

export function GovernanceTabs() {
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
