/**
 * Which of a tenant's call-to-action rows may actually go on the page (#1327).
 *
 * The home hero used to render three buttons whose labels were slots and whose
 * destinations were literals -- `/events`, `/get-involved`, `/support` -- with
 * the last one wrapped in a visibility check written into the page. Now all
 * three are rows a tenant writes, and the same three questions have to be
 * asked of every row instead of once, in one place: is it switched on, is the
 * destination one the site will publish at all, and does it still go
 * somewhere.
 *
 * Pure, and deliberately not a component: the home page and both audience
 * pages read their buttons through it, and the rules are worth a unit test
 * rather than an end-to-end one.
 */

import { isPublishableHref } from "@/lib/legal-markup";
import { isHrefVisible } from "@/lib/public-nav";

/** One row of a `CTA_FIELDS` list slot, as the content layer hands it over. */
export type ContentCta = {
  label: string;
  href: string;
  /**
   * Absent on a row stored before the field existed, which reads as shown --
   * the same allowance `links.items` makes, and for the same reason: a missing
   * switch must not send the whole slot back to its registry default.
   */
  shown?: boolean;
};

/**
 * The rows to render, in the tenant's order.
 *
 * `hidden` is `hiddenSlots()`'s answer for this request. An external
 * destination matches no section, so `isHrefVisible()` leaves it alone; an
 * internal one under a section the board has switched off is dropped, because
 * a hero button that 404s is worse than one button fewer (#586).
 *
 * `isPublishableHref` is asked again here even though the editor refuses
 * anything else on the way in. `site_content` is a table an operator can write
 * to directly and the output of these rows is an `href` on a public page, so a
 * row that would render `javascript:` is dropped rather than trusted -- the
 * same second check `/links` makes.
 */
export function liveCtas(
  ctas: readonly ContentCta[],
  hidden: readonly string[],
): ContentCta[] {
  return ctas.filter(
    (cta) =>
      cta.shown !== false &&
      Boolean(cta.label?.trim()) &&
      typeof cta.href === "string" &&
      isPublishableHref(cta.href) &&
      isHrefVisible(hidden, cta.href),
  );
}

/**
 * The same question asked of a single button that is not part of a list: the row
 * if it may be published, `null` if it may not.
 *
 * The price list's plan cards need this (#1330). A plan's button is two fields
 * on the plan's own row rather than an entry in a `ctas` list, and the rules it
 * has to pass are the same ones -- so it asks them here rather than repeating
 * a shortened version of them in a page, which is how the `javascript:` check
 * ends up missing from one of the three places that needed it.
 */
export function liveCta(
  cta: ContentCta | null | undefined,
  hidden: readonly string[],
): ContentCta | null {
  return cta ? (liveCtas([cta], hidden)[0] ?? null) : null;
}
