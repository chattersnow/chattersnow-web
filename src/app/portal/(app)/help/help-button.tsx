"use client";

import { usePathname } from "next/navigation";
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
import { helpContent } from "./help-content";
import { usePortalHelp } from "./help-context";
import { resolveHelpKey } from "./help-matcher";

const helpKeys = Object.keys(helpContent);

/**
 * The persistent help icon in the portal header. Shows the help entry for
 * the current route (longest-prefix match against the registry, falling
 * back to "/portal"), unless the page registered dynamic content via
 * <PageHelpContent>.
 */
export function HelpButton() {
  const pathname = usePathname();
  const { override } = usePortalHelp();
  const key = resolveHelpKey(pathname, helpKeys) ?? "/portal";
  const entry = override ?? helpContent[key];

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full"
            aria-label="Help for this page"
          />
        }
      >
        <CircleHelp className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{entry.title}</SheetTitle>
          {entry.description && (
            <SheetDescription>{entry.description}</SheetDescription>
          )}
        </SheetHeader>
        {/* Help content is prose, so there is nothing inside the scroll area
            to tab towards -- without a tab stop of its own a keyboard user
            reads the first screenful and can go no further. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Help content"
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {entry.body}
        </div>
      </SheetContent>
    </Sheet>
  );
}
