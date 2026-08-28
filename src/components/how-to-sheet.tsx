"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type HowToSheetProps = {
  /** Sheet title — also used as the accessible name for the dialog. */
  title: string;
  /** Optional one-line summary shown under the title. */
  description?: string;
  /** Trigger button label. Defaults to "How this works". */
  triggerLabel?: string;
  children: ReactNode;
};

export function HowToSheet({
  title,
  description,
  triggerLabel = "How this works",
  children,
}: HowToSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <CircleHelp className="size-4" />
        {triggerLabel}
      </SheetTrigger>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type HowToSectionProps = {
  heading: string;
  children: ReactNode;
};

/** A single labeled block inside a HowToSheet (e.g. "Steps", "Who can do this"). */
export function HowToSection({ heading, children }: HowToSectionProps) {
  return (
    <section>
      <h3 className="text-foreground text-xs font-semibold uppercase tracking-[0.1em]">
        {heading}
      </h3>
      <div className="app-muted mt-2 leading-relaxed">{children}</div>
    </section>
  );
}
