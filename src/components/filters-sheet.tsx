"use client";

import type { ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function FiltersSheet({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <ListFilter className="size-4" />
        Filters
        {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
      </SheetTrigger>
      <SheetContent side="right" size="sm">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
