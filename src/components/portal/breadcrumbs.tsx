"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  activeSectionFor,
  activeSubItemFor,
  NAV_ITEMS,
} from "@/lib/portal/nav";
import { LinkPendingPulse } from "@/components/link-pending";

type Crumb = { label: string; href?: string };

/**
 * The trail to the current record.
 *
 * Detail pages used an ad-hoc single-level back link, so a three-level route
 * like /portal/administration/access-management/assets/[assetId] gave one hop
 * back and no trail. It also left two pairs of pages indistinguishable:
 * "Roles" is both a volunteer and an administration page, and "Donations"
 * both a finance and an inventory one, with the same h1 in each pair.
 *
 * The trail is derived from the shared nav tree rather than from the URL
 * segments, so the labels here are the same ones the sidebar shows.
 */
function trailFor(pathname: string, current: string): Crumb[] {
  const sectionValue = activeSectionFor(pathname);
  const section = NAV_ITEMS.find((item) => item.value === sectionValue);
  if (!section) return [{ label: current }];

  const crumbs: Crumb[] = [{ label: section.label, href: section.href }];

  const subValue = activeSubItemFor(pathname, section);
  const sub = section.subItems?.find((item) => item.value === subValue);
  // A section whose first sub-item repeats its own name (Calendar > Calendar)
  // would just add a step that says nothing.
  if (sub && sub.label !== section.label) {
    crumbs.push({ label: sub.label, href: sub.href });
  }

  // Same rule at the leaf: on a list page the record label is the page's own
  // name, and "Finance > Donations > Donations" is noise.
  if (crumbs[crumbs.length - 1].label !== current) {
    crumbs.push({ label: current });
  }
  return crumbs;
}

export function PortalBreadcrumbs({
  /** The record this page is about, as the page's own heading names it. */
  current,
}: {
  current: string;
}) {
  const pathname = usePathname();
  const crumbs = trailFor(pathname, current);

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="app-muted flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className="flex items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="rounded-sm hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <LinkPendingPulse>{crumb.label}</LinkPendingPulse>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="max-w-[16rem] truncate text-foreground"
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
