"use client";

import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { cn } from "@/lib/utils";
import type { EventMediaRow } from "./media-actions";

/** Whether one photo or video is in the event's public gallery (#1654). */
export function MediaVisibilityBadge({
  item,
  className,
}: {
  item: EventMediaRow;
  className?: string;
}) {
  return (
    <Badge
      variant={item.is_public ? "secondary" : "outline"}
      className={cn(!item.is_public && "bg-background", className)}
    >
      {item.is_public ? "Public" : "Not public"}
    </Badge>
  );
}

/**
 * events:manage's switch for one item: a photo is public on upload and can be
 * hidden, a video is not and can be made public.
 */
export function MediaVisibilityToggle({
  item,
  disabled,
  onSetPublic,
}: {
  item: EventMediaRow;
  disabled: boolean;
  onSetPublic: (items: EventMediaRow[], isPublic: boolean) => void;
}) {
  return (
    <TooltipIconButton
      label={
        item.is_public
          ? `Hide ${item.original_filename} from the public site`
          : `Make ${item.original_filename} public`
      }
      disabled={disabled}
      onClick={() => onSetPublic([item], !item.is_public)}
    >
      {item.is_public ? <EyeOff /> : <Eye />}
    </TooltipIconButton>
  );
}
