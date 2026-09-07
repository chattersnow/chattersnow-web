"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import type {
  AttentionSeverity,
  PendingApprovalItem,
} from "@/lib/portal/attention-items";

const SEVERITY_TONE: Record<AttentionSeverity, StatusTone> = {
  urgent: "danger",
  attention: "warning",
  info: "progress",
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  urgent: 2,
  attention: 1,
  info: 0,
};

const BADGE_VARIANT: Record<
  AttentionSeverity,
  "destructive" | "warning" | "progress"
> = {
  urgent: "destructive",
  attention: "warning",
  info: "progress",
};

export function NotificationsMenu({ items }: { items: PendingApprovalItem[] }) {
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  // The count badge takes the loudest severity present, so red keeps meaning
  // "something is actually wrong" rather than "there is a number here".
  const worst = items.reduce<AttentionSeverity>(
    (acc, item) =>
      SEVERITY_RANK[item.severity] > SEVERITY_RANK[acc] ? item.severity : acc,
    "info",
  );
  const isClear = items.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={
              isClear
                ? "relative size-10 rounded-full"
                : "relative size-10 rounded-full bg-[var(--purple-soft)] text-[var(--purple-deep)] hover:bg-[var(--purple-soft)] hover:brightness-95"
            }
            // The control used to disappear entirely at zero. Users build
            // spatial memory for header controls, and a bell that is
            // sometimes absent can't answer "am I clear?", only "is
            // something wrong?".
            aria-label={
              isClear
                ? "Nothing needs your attention"
                : `${totalCount} item${totalCount === 1 ? "" : "s"} needing attention`
            }
          />
        }
      >
        <Bell className={isClear ? "size-5" : "bell-ring size-5"} />
        {!isClear && (
          <Badge
            variant={BADGE_VARIANT[worst]}
            className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-xs font-bold ring-2 ring-[var(--background)]"
          >
            {totalCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {isClear ? "Nothing needs your attention" : "Needs your attention"}
          </DropdownMenuLabel>
          {isClear ? (
            <p className="app-muted px-2 py-3 text-sm">
              You&apos;re all clear. Approvals, new messages and overdue work
              show up here.
            </p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.key}
                render={<Link href={item.href} />}
              >
                <span>{item.label}</span>
                <StatusBadge
                  tone={SEVERITY_TONE[item.severity]}
                  className="ml-auto"
                >
                  {item.count}
                </StatusBadge>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
