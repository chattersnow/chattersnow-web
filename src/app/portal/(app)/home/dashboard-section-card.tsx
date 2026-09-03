import Link from "next/link";
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

export function DashboardStatRow({
  label,
  value,
  caption,
  href,
  linkLabel = "View all",
}: {
  label: string;
  value: string | number;
  caption?: string;
  /** When set, the caption line gains a link to this destination. */
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {(caption || href) && (
          <p className="app-muted mt-0.5 text-xs">
            {caption}
            {href && (
              <>
                {caption ? " · " : null}
                <Link href={href} className="text-primary hover:underline">
                  <LinkPendingPulse>{linkLabel} →</LinkPendingPulse>
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      <p className="brand-display shrink-0 text-xl font-semibold tracking-[-0.02em]">
        {value}
      </p>
    </div>
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
