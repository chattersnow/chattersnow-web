"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * The sheet an intercepted `/events/[id]` renders in (#847).
 *
 * Dismissing it is a step back through history rather than a state change,
 * which is the whole reason this is a route and not a `useState` sheet: the
 * browser's own Back button closes it, Forward reopens it, and the URL in the
 * bar is the one worth sharing. `open` still tracks locally so the exit
 * animation has something to run against while the route change lands.
 *
 * Only the wrapper is a client component. Its children are the server-rendered
 * detail content, passed through so the sheet and the page stay one query and
 * one component.
 */
export function EventDetailModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setOpen(false);
        router.back();
      }}
    >
      <SheetContent side="right">{children}</SheetContent>
    </Sheet>
  );
}
