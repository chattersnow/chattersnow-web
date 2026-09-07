import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * What a status *means*, rather than what colour it is.
 *
 * Fifteen modules each defined a private `Pill` and none used the shared
 * `Badge`, so pills and badges in the same row didn't line up -- `Badge` is
 * `h-5 rounded-4xl`, the copies were `rounded-full` with no fixed height.
 * Worse, they worked from four tints, three of them purple: "approved" and
 * "paid", the two states a finance reviewer most needs to tell apart, were
 * adjacent purples.
 *
 * Modules keep their own status maps -- which state is which is domain
 * knowledge -- but express them as tones and render through one component.
 */
export type StatusTone =
  /** Nothing has happened yet, or the record is inactive. */
  | "neutral"
  /** A category or a terminal state that isn't an outcome (public, card). */
  | "info"
  /** Underway: submitted, in review, scheduled. */
  | "progress"
  /** Finished well: paid, published, completed, awarded. */
  | "success"
  /** Needs attention before it becomes a failure: overdue, expiring. */
  | "warning"
  /** Failed or refused: rejected, cancelled, declined. */
  | "danger";

const TONE_VARIANTS = {
  neutral: "muted",
  info: "secondary",
  progress: "progress",
  success: "success",
  warning: "warning",
  danger: "destructive",
} as const;

export function StatusBadge({
  tone = "neutral",
  className,
  children,
  ...props
}: {
  tone?: StatusTone;
  children: ReactNode;
} & Omit<ComponentProps<"span">, "children">) {
  return (
    <Badge variant={TONE_VARIANTS[tone]} className={cn(className)} {...props}>
      {children}
    </Badge>
  );
}

/**
 * Renders a raw enum value as a label.
 *
 * The old `Pill` printed `{status}` under `capitalize`, so any multi-word
 * value surfaced as "Not_started". Modules with a real label map should pass
 * the label; this is the fallback for the ones that don't.
 */
export function humanizeStatus(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
