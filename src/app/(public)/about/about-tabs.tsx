"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "mission", label: "Our Mission", href: "/about" },
  { value: "team", label: "Meet the Team", href: "/about/team" },
  { value: "programs", label: "Programs", href: "/about/programs" },
  { value: "volunteer", label: "Volunteer", href: "/about/volunteer" },
  { value: "donate", label: "Donate", href: "/about/donations" },
] as const;

function activeTabFor(pathname: string) {
  if (pathname.startsWith("/about/team")) return "team";
  if (pathname.startsWith("/about/programs")) return "programs";
  if (pathname.startsWith("/about/volunteer")) return "volunteer";
  if (pathname.startsWith("/about/donations")) return "donate";
  return "mission";
}

export function AboutTabs() {
  const pathname = usePathname();
  const active = activeTabFor(pathname);

  return (
    <Tabs value={active} className="mt-4">
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
