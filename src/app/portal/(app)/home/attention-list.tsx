"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/portal/status-badge";
import { useAttentionItems } from "../shell/attention-context";
import { SEVERITY_TONE } from "../attention-severity";

/**
 * What needs this reader now, as a list they can act on (#1079).
 *
 * The bell in the mobile header is the same data on every other page; here it
 * is the first thing on the screen, because "what needs me" is the question a
 * phone gets opened to answer. Reads the layout's already-computed items
 * through context rather than querying again -- see `attention-context.tsx`.
 */
export function AttentionList() {
  const items = useAttentionItems();

  if (items.length === 0) {
    return (
      <p className="app-muted mt-3 text-sm">
        You&apos;re all clear. Approvals, new messages and overdue work show up
        here.
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="flex min-h-12 items-center gap-3 px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-sm">{item.label}</span>
            <StatusBadge tone={SEVERITY_TONE[item.severity]}>
              {item.count}
            </StatusBadge>
            <ChevronRight className="app-muted size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
