"use client";

import { usePathname } from "next/navigation";
import { toPortalPathname } from "@/lib/portal/paths";
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
  // Help keys are canonical `/portal/...` paths; the portal host serves
  // these routes prefix-free.
  const pathname = toPortalPathname(usePathname());
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
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
          {entry.body}
        </div>
      </SheetContent>
    </Sheet>
  );
}
