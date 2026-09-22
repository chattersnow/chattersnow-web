import { applyLexiconAll, type Lexicon } from "@/lib/lexicon";

/**
 * What the platform says about giving something away, written once (#1367).
 *
 * The gear library is the inverse of a loan. `inventory_movements` has
 * `received` and `distributed` and no `returned`, so there is no return date,
 * no deposit and no damage liability to capture -- and the exposure runs the
 * other way: **handing somebody a pair of skis reads as vouching for them.**
 * Nothing in the product said it does not.
 *
 * These are the words that say it, and they are one constant because two
 * places saying *nearly* the same thing about liability is the failure mode
 * worth spending a test on. They are read by:
 *
 *   * `GearAsIsNotice`, above the box somebody ticks when they ask for
 *     something (`src/components/gear-as-is-notice.tsx`);
 *   * the platform's terms of use, as the `items-we-give-away` section
 *     (`src/lib/legal-defaults.ts`), which is why they are written in that
 *     document's register rather than as interface copy; and
 *   * `gear_requests.as_is_text`, the snapshot stored on the request that
 *     took the acknowledgement.
 *
 * `legal-defaults.test.ts` holds the first two together: the terms section
 * opens with exactly these paragraphs, resolved against the same lexicon.
 *
 * Every claim here is about what the software and the organization running it
 * *do not do*, which is rule 1 of `docs/legal-basis.md`: an organization that
 * catalogs donated equipment and passes it on has not, by doing so, inspected
 * or certified anything, and saying so asserts nothing on its behalf. The
 * snow-sports specifics a first tenant needs -- binding mounting, DIN setting,
 * boot fitting -- are deliberately absent: they belong to that tenant's own
 * published text, not to a platform serving organizations that lend tools,
 * instruments or food.
 *
 * `{item_plural}` is the lexicon (#896). "Gear" is one organization's word for
 * what these tables call inventory, and a sentence about what an organization
 * gives away has to be in that organization's noun.
 */
export const GEAR_AS_IS_SUMMARY: readonly string[] = [
  "We give away {item_plural:lower} exactly as they reach us. We don't inspect, test, service, repair, certify or guarantee anything we pass on, and we can't promise that something fits you, suits you, or is fit for what you want to do with it.",
  "We don't do safety-critical work on any of it. Nothing is set up, adjusted, fitted or checked for you, and having an item looked at by somebody qualified before you use it is yours to arrange.",
  "Taking something from us is not us telling you it is safe.",
];

/**
 * The same paragraphs, in this organization's words.
 *
 * Shared by the notice and by the terms-of-use section so neither can resolve
 * the lexicon differently from the other.
 */
export function gearAsIsSummary(lexicon: Lexicon): string[] {
  return applyLexiconAll(GEAR_AS_IS_SUMMARY, lexicon);
}

/**
 * What gets snapshotted onto `gear_requests.as_is_text`.
 *
 * **Resolved on the server and never sent by the browser.** The summary lives
 * in a component constant with no version table and no permalink, so the only
 * place it is citable from is the row that holds it (#1319's argument, and the
 * opposite of #686's version pointer, which earned itself on a document that
 * has an address). A snapshot the client supplied would be a record of what
 * the client said it showed, which is not the same fact -- so
 * `requestGearItemsAction` and the `/gear-requests` route each build it from
 * here, against the tenant's own lexicon, and the RPC stores what it is given.
 */
export function gearAsIsText(lexicon: Lexicon): string {
  return gearAsIsSummary(lexicon).join("\n\n");
}

/** The label on the box, beside the submit button. */
export const GEAR_AS_IS_CONSENT_LABEL =
  "I understand the {item_plural:lower} are given as-is, and that nothing has been checked, serviced or certified";
