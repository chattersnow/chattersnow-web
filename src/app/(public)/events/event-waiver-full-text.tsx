"use client";

import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * The participant agreement in full, one tap from the box that accepts it
 * (#1402).
 *
 * The words themselves are rendered on the server and arrive as `children`,
 * so this adds a trigger and a sheet to the browser bundle and nothing else --
 * `parseLegalBlocks` and the document stay out of it, as #686 arranged.
 *
 * Full width on a phone, where a three-quarter panel over an event sheet that
 * is already three quarters wide would leave the reader a column. The popup
 * itself scrolls rather than a frame inside it: the reason #1402 exists is
 * that a scroll box inside a scrolling surface takes over the finger, and the
 * Close button that takes focus on open is then inside the thing the arrow
 * keys scroll.
 */
export function EventWaiverFullText({
  title,
  version,
  lastUpdated,
  children,
}: {
  title: string;
  version: number;
  lastUpdated: string;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Sheet>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        Read the full agreement
      </SheetTrigger>
      <SheetContent
        side="right"
        size="xl"
        className="gap-0 overflow-y-auto data-[side=right]:w-full"
        // The title, not the first tabbable element. That is the "Back to
        // registration" button at the foot of the document, and focusing it
        // scrolls the reader straight past every word to the end.
        initialFocus={titleRef}
      >
        <SheetHeader className="pr-12">
          <SheetTitle
            ref={titleRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {title}
          </SheetTitle>
          <SheetDescription>
            Version {version} · last updated {lastUpdated}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-4 text-sm leading-relaxed">
          {children}
        </div>
        <div className="border-t p-4">
          <SheetClose render={<Button type="button" className="w-full" />}>
            Back to registration
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
