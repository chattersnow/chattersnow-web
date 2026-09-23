import { Badge } from "@/components/ui/badge";
import { ADULTS_ONLY_BADGE, ADULTS_ONLY_DESCRIPTION } from "@/lib/adults-only";
import { cn } from "@/lib/utils";

/**
 * The 18+ badge on an adults-only event (#1417): the card, the detail page and
 * the sheet header. Renders nothing for any other event, so a caller passes
 * the flag rather than wrapping it in a condition of its own.
 */
export function AdultsOnlyBadge({
  adultsOnly,
  className,
}: {
  adultsOnly: boolean | null | undefined;
  className?: string;
}) {
  if (!adultsOnly) return null;
  return (
    <Badge
      variant="outline"
      className={cn("align-middle", className)}
      title={ADULTS_ONLY_DESCRIPTION}
    >
      <span aria-hidden="true">{ADULTS_ONLY_BADGE}</span>
      <span className="sr-only">{ADULTS_ONLY_DESCRIPTION}</span>
    </Badge>
  );
}
