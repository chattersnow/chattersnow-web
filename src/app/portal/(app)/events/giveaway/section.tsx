"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * One collapsed-by-default block of giveaway setup.
 *
 * Tiers, packages and buckets are configured once before the event and then
 * left alone, so showing all three expanded buried the parts that actually
 * change during it -- tickets and prizes -- under a screen of static config.
 * The trigger carries a one-line `summary` of the block's state so it can be
 * read without opening it, and `defaultOpen` keeps a block that still needs
 * setting up in front of the person setting it up.
 */
export function GiveawaySection({
  title,
  description,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-[var(--line)]"
    >
      <h3>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 rounded-md p-4 text-left text-sm font-medium hover:bg-accent/50">
          <span>{title}</span>
          <span className="flex items-center gap-2">
            <span className="app-muted font-normal">{summary}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="flex flex-col gap-4 px-4 pb-4">
        <p className="app-muted text-sm">{description}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
