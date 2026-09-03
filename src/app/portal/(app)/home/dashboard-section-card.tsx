import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LinkPendingPulse } from "@/components/link-pending";

export function DashboardSectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("mt-6", className)}>
      <CardHeader>
        <CardTitle className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-border divide-y">{children}</CardContent>
    </Card>
  );
}

/**
 * A dashboard figure, and where to go to see what's behind it.
 *
 * Only one of the dashboard's ~25 rows used to carry an href, so seeing
 * "$4,210 outstanding reimbursements" and wanting the list meant navigating
 * to Finance, then reconstructing the filter that produced the number. A
 * figure that can't be opened is a figure the operator has to re-derive.
 *
 * The whole row is the link when there's somewhere to go -- a link buried in
 * the caption is a small target and reads as an aside rather than as the
 * point of the row.
 */
export function DashboardStatRow({
  label,
  value,
  caption,
  href,
}: {
  label: string;
  value: string | number;
  caption?: string;
  /** Where this figure's underlying records live, filtered to match it. */
  href?: string;
}) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">
          {label}
          {href && (
            <ArrowRight
              aria-hidden
              className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/stat:opacity-70 group-focus-visible/stat:opacity-70"
            />
          )}
        </p>
        {caption && <p className="app-muted mt-0.5 text-xs">{caption}</p>}
      </div>
      <p className="brand-display shrink-0 text-xl font-semibold tracking-[-0.02em]">
        {value}
      </p>
    </>
  );

  if (!href) {
    return (
      <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group/stat -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors first:mt-0 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <LinkPendingPulse className="flex w-full items-center justify-between gap-4">
        {body}
      </LinkPendingPulse>
    </Link>
  );
}

export function DashboardEventRow({
  label,
  eventName,
  caption,
}: {
  label: string;
  eventName: string;
  caption?: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-medium">{label}</p>
      {caption && <p className="app-muted mt-0.5 text-xs">{caption}</p>}
      <p className="brand-display mt-2 break-words text-xl font-semibold leading-tight tracking-[-0.02em]">
        {eventName}
      </p>
    </div>
  );
}
