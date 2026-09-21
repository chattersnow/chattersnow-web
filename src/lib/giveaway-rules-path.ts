/**
 * Where a promotion's official rules live on the public site (#1322).
 *
 * Its own route rather than a section of the event page, because the rules
 * have to outlive the thing they govern: an entrant asking what they agreed to
 * may be asking months after the event came down, and #666 requires the rules
 * to be reachable for the life of the promotion. It is keyed by the giveaway
 * rather than the event for the same reason the rules are versioned -- what is
 * served is a frozen document belonging to one promotion, not a view of an
 * event's current state.
 *
 * Under /giveaways rather than /events/e/<id>/rules so that no static page
 * added under /events can collide with an event id, which is the trap
 * `publicEventPath` is written out at length about.
 *
 * Use this rather than writing the path out, so the event page's link, the
 * revalidation call and the route itself cannot drift apart.
 */
export function publicGiveawayRulesPath(giveawayId: string): string {
  return `/giveaways/${giveawayId}/rules`;
}
