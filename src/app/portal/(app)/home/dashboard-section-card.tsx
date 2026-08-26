import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
}: {
  label: string;
  value: string | number;
  caption?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {caption && <p className="app-muted mt-0.5 text-xs">{caption}</p>}
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

export function DashboardAttentionRow({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="app-muted mt-0.5 text-xs">Awaiting your review</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="brand-display text-xl font-semibold tracking-[-0.02em]">
          {count}
        </p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={href} />}
        >
          Review
        </Button>
      </div>
    </div>
  );
}

export function DashboardComingSoonRow({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="app-muted text-xs font-medium uppercase tracking-[0.08em]">
          Coming soon
        </p>
      </div>
      <p className="app-muted mt-1 text-xs">{description}</p>
    </div>
  );
}
