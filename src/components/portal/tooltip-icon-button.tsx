"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * An icon-only button with the tooltip every icon-only control carries, and
 * an accessible name that says the same thing (#1441). The button counterpart
 * of `IconLink`, so a toolbar of actions doesn't hand-wrap the Tooltip parts
 * around each one.
 */
export function TooltipIconButton({
  label,
  children,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label" | "children"> & {
  /** Accessible name and tooltip text, e.g. "Edit item". */
  label: string;
  /** The icon, e.g. `<Pencil />`. */
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
