import Link from "next/link";
import { applyLexicon, DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import { cn } from "@/lib/utils";

/**
 * The public forms that collect personal information (#684).
 *
 * One key per form rather than one shared sentence: the privacy policy says
 * why each form's fields are collected, and "we use this to hold your spot"
 * and "we use this to read your message and reply" are different promises.
 * Notice at the point of collection means the sentence beside the fields
 * matches the paragraph in the policy, not that it gestures at one.
 */
export type PrivacyNoticeSurface =
  | "eventRegistration"
  | "volunteerApplication"
  | "gearRequest"
  | "contact"
  | "artworkSubmission";

/**
 * What each form says, up to the link.
 *
 * `{item_plural:lower}` is the lexicon (#896): "gear" is one organization's
 * word for what these tables call inventory, and the sentence has to read as
 * that organization's. Nothing else here names an organization -- the copy is
 * first person throughout, so it is already whoever is serving it.
 */
const LEAD_IN: Record<PrivacyNoticeSurface, string> = {
  eventRegistration:
    "We use what you enter here to hold your spot, plan the day, and send you event details — see our",
  volunteerApplication:
    "We use what you enter here to review your application, follow up with you, and let you check your status with the reference code we send — see our",
  gearRequest:
    "We use what you enter here to match you with the {item_plural:lower} you asked for and arrange a handover. See our",
  contact: "We use what you enter here to read your message and reply. See our",
  artworkSubmission:
    "We use what you enter here to review your submission, get back to you about it, and credit you if it's shown — see our",
};

/**
 * Every surface, for the tests that have to cover all of them.
 *
 * Derived rather than written out a second time: a hand-kept list is how a
 * fifth form ends up with a sentence nothing asserts, which is the drift
 * #1344 existed to fix.
 */
export const PRIVACY_NOTICE_SURFACES = Object.keys(
  LEAD_IN,
) as PrivacyNoticeSurface[];

/**
 * Notice at the point of collection, above a public form's submit button.
 *
 * **Not a checkbox, and deliberately.** A privacy policy binds the
 * organization whether or not a visitor ticked anything, so a box here would
 * carry no choice -- and it would sit beside boxes that do, diluting them.
 * The artwork submission form is the live example (#1344): its box agrees to
 * that call's rights and credit terms, which an artist can decline by not
 * submitting. Reserve the ticking for what can genuinely be declined; photo
 * consent (#599) and the participant waiver (#686) are the same shape.
 *
 * `/privacy` is the one legal route served for every tenant whatever it has
 * adopted (#859), which is why this sentence is unconditional and safe on a
 * tenant that has adopted nothing. Terms of use and the code of conduct 404
 * there, so nothing here links them -- and nothing here ever will. #1318
 * decided that submitting a public form is not acceptance of any of the three
 * documents: these forms collect, they do not take agreement, and what
 * agreement the product does take is scoped to what is being submitted (the
 * artwork call's rights note, #877) rather than to the site's documents. The
 * decision and what would reopen it are in `docs/legal-basis.md`.
 *
 * A new tab, so that reading the policy does not discard a half-filled form --
 * hence the accessible name saying so, since a link that takes the tab without
 * warning is worse than one that admits it.
 */
export function PrivacyNotice({
  surface,
  lexicon = DEFAULT_LEXICON,
  className,
}: {
  surface: PrivacyNoticeSurface;
  lexicon?: Lexicon;
  className?: string;
}) {
  return (
    <p className={cn("app-muted text-sm", className)}>
      {applyLexicon(LEAD_IN[surface], lexicon)}{" "}
      <Link
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Privacy Policy (opens in new tab)"
        className="underline underline-offset-4"
      >
        Privacy Policy
      </Link>
      .
    </p>
  );
}
