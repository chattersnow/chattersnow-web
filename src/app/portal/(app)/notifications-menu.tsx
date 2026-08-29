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
import type { PendingApprovalItem } from "@/lib/portal/attention-items";

export function NotificationsMenu({ items }: { items: PendingApprovalItem[] }) {
  if (items.length === 0) return null;

  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-10 rounded-full bg-[var(--purple-soft)] text-[var(--purple-deep)] hover:bg-[var(--purple-soft)] hover:brightness-95"
            aria-label={`${totalCount} item${totalCount === 1 ? "" : "s"} needing attention`}
          />
        }
      >
        <Bell className="bell-ring size-5" />
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-xs font-bold ring-2 ring-[var(--background)]"
        >
          {totalCount}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Needs your attention</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem key={item.key} render={<Link href={item.href} />}>
              <span>{item.label}</span>
              <span className="app-muted ml-auto text-xs">{item.count}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
