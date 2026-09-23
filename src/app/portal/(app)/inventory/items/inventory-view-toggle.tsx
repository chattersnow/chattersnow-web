"use client";

import { LayoutGrid, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useInventoryView,
  type InventoryViewMode,
} from "./inventory-view-context";

export function InventoryViewToggle() {
  const { view, setView } = useInventoryView();

  return (
    <div className="flex flex-col gap-1">
      <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
        View
      </span>
      <ToggleGroup
        value={[view]}
        onValueChange={(value) => {
          if (value[0]) setView(value[0] as InventoryViewMode);
        }}
        variant="outline"
        className="h-8"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value="list"
                aria-label="List view"
                className="h-8 px-2.5"
              />
            }
          >
            <List className="size-4" />
          </TooltipTrigger>
          <TooltipContent>List view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value="gallery"
                aria-label="Gallery view"
                className="h-8 px-2.5"
              />
            }
          >
            <LayoutGrid className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Gallery view</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </div>
  );
}
