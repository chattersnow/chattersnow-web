import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PendingApprovalItem } from "@/lib/portal/attention-items";

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

const TASK_LIST_DISPLAY_LIMIT = 5;

export function DashboardTaskListRow({
  label,
  items,
  emptyCaption,
}: {
  label: string;
  items: PendingApprovalItem[];
  emptyCaption: string;
}) {
  if (items.length === 0) {
    return <DashboardStatRow label={label} value={0} caption={emptyCaption} />;
  }

  const visible = items.slice(0, TASK_LIST_DISPLAY_LIMIT);
  const remaining = items.length - visible.length;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="brand-display shrink-0 text-xl font-semibold tracking-[-0.02em]">
          {items.length}
        </p>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {visible.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="text-primary text-sm hover:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="app-muted mt-1.5 text-xs">+{remaining} more</p>
      )}
    </div>
  );
}
