import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * What a list or tab shows when it has nothing in it.
 *
 * The portal had around forty-five bare "No X yet." paragraphs. For a
 * nonprofit standing the portal up nearly every page starts empty, so a
 * negative with no next step was the whole first-run experience. This gives
 * each one a place to say what to do about it: `description` names the next
 * step in words, `action` carries the control that does it, when the page
 * can offer one right there.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("px-4 py-8", className)}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
