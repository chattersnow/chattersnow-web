import {
  CARPOOL_COST_NOTICE_HEADING,
  writtenParagraphs,
} from "@/lib/event-carpools";
import { cn } from "@/lib/utils";

/**
 * How carpool costs are shared (#1650), told rather than asked: no box, and
 * nothing stored about having seen it (#1318, `docs/legal-basis.md`).
 *
 * One component for every surface that shows it -- the registration form's
 * "This event" and review steps, and the carpool card on `/my` and the
 * answers link (#1651) -- so the words and their heading cannot drift. The
 * caller decides whether the event organizes carpools and passes nothing
 * when it does not; a tenant that blanked the slot renders nothing either.
 */
export function CarpoolCostNotice({
  paragraphs,
  className,
}: {
  /** `events.carpool_cost_notice`, or empty where carpools are off. */
  paragraphs: readonly string[];
  className?: string;
}) {
  const written = writtenParagraphs(paragraphs);
  if (written.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-sm font-medium">{CARPOOL_COST_NOTICE_HEADING}</h3>
      {written.map((paragraph, index) => (
        <p key={index} className="app-muted text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
