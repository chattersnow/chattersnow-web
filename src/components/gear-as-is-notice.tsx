import Link from "next/link";
import { gearAsIsSummary } from "@/lib/gear-as-is";
import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import { cn } from "@/lib/utils";

/**
 * What taking something from the collection means, where somebody asks for
 * it (#1367).
 *
 * The words are `GEAR_AS_IS_SUMMARY` in `@/lib/gear-as-is`, shared with the
 * `items-we-give-away` section of the platform's terms of use so that the
 * short form beside the button and the long form in the document cannot say
 * nearly-but-not-quite the same thing about liability.
 *
 * **This one is a box**, unlike `PrivacyNotice` beside it, and the difference
 * is the one `docs/legal-basis.md` draws: a privacy policy binds the
 * organization whether or not anybody ticked anything, whereas declining "I
 * understand this is given as-is" is declining the gear, in the way declining
 * a waiver is declining to register. The box itself lives on the form, next to
 * the submit button it gates; this renders the words above it.
 *
 * **The link is conditional, and has to be.** `/terms` 404s on a tenant that
 * has adopted no terms of use (#859), and `expectPrivacyNotice` in
 * `e2e/legal.spec.ts` exists because a notice may only link documents that are
 * served. A tenant with none still gets every word of the summary -- it is the
 * platform's own claim about what the software and the organization running it
 * do not do, true whatever that organization has published -- and simply no
 * "read more".
 *
 * A new tab, so that reading the terms does not discard a filled cart, with
 * the accessible name saying so.
 */
export function GearAsIsNotice({
  lexicon = DEFAULT_LEXICON,
  termsInForce = false,
  className,
}: {
  lexicon?: Lexicon;
  /** Whether this tenant serves `/terms`, from `getLegalPublication()`. */
  termsInForce?: boolean;
  className?: string;
}) {
  const paragraphs = gearAsIsSummary(lexicon);

  return (
    <div className={cn("space-y-2", className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="app-muted text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
      {termsInForce && (
        <p className="app-muted text-sm leading-relaxed">
          The full wording is in our{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Terms of Use (opens in new tab)"
            className="underline underline-offset-4"
          >
            Terms of Use
          </Link>
          .
        </p>
      )}
    </div>
  );
}
