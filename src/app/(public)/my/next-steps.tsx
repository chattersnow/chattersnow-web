import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { applyLexicon, type Lexicon } from "@/lib/lexicon";
import { isHrefVisible } from "@/lib/public-nav";
import { cn } from "@/lib/utils";

/**
 * The public destinations that actually put something on a person's record.
 *
 * Labels are lexicon templates for the same reason the nav's are: the
 * collection is a gear library to one tenant and a food pantry to the next, and
 * "Gear" hardcoded here would be Chatter Snow's word published under everybody
 * else's name.
 */
const NEXT_STEPS: readonly { href: string; label: string }[] = [
  { href: "/events", label: "Find an event" },
  { href: "/get-involved/volunteer", label: "Volunteer with us" },
  { href: "/inventory/library", label: "Browse the {collection_public:lower}" },
  { href: "/support/donations", label: "Make a donation" },
] as const;

/**
 * What to do next, for a linked account with nothing on it yet (#1183).
 *
 * That state is the common one immediately after a claim is approved: the
 * person has done everything that was asked of them and the page answered with
 * "Nothing on it yet" and no way forward. These are the four things that
 * generate history, so this is the shortest honest route out of the dead end.
 *
 * Every link is filtered through `isHrefVisible`, because each of these
 * sections is individually hideable from Website > Page visibility and is
 * forced dark when its module is off. Sending somebody who has just been
 * welcomed into a 404 is worse than offering them nothing, so a tenant that has
 * hidden all four gets no list at all rather than an empty heading.
 */
export function MyNextSteps({
  hidden,
  lexicon,
}: {
  /** `hiddenSlots(getPageVisibility(...))`, as the public layout computes it. */
  hidden: readonly string[];
  lexicon: Lexicon;
}) {
  const steps = NEXT_STEPS.filter((step) =>
    isHrefVisible(hidden, step.href),
  ).map((step) => ({ ...step, label: applyLexicon(step.label, lexicon) }));

  if (steps.length === 0) return null;

  return (
    <div>
      <h3 className="app-muted mb-3 text-xs font-semibold uppercase tracking-[0.1em]">
        Where to start
      </h3>
      <ul className="flex flex-wrap gap-3">
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              // The same 44px touch minimum the rest of the area keeps
              // (docs/public-site-ux-audit.md finding 8).
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-h-11 px-4",
              )}
            >
              {step.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
