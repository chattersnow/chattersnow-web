/**
 * Where an event lives on the public site.
 *
 * The extra `e` segment is load-bearing, and the reason is #847's intercepting
 * sheet. While the detail page sat at `/events/[id]`, the slot that intercepts
 * it -- `@modal/(.)[id]` -- matched *every* single segment under /events, and
 * it is matched ahead of both `[...catchAll]` and the children slot's own
 * static routes. So a client-side navigation from the listing to
 * `/events/community` ran the sheet with id="community", found no such event
 * and `notFound()`, which bubbles to the /events layout and buries both slots
 * under the not-found page. It only bit on a soft navigation that started
 * inside /events, so a hard load, a crawler and a link from anywhere else all
 * looked fine -- which is how it reached production.
 *
 * Neither a uuid guard in the slot nor a static `@modal/community` stub fixes
 * that: the guard leaves the interception matched, so the listing stays on
 * screen under the calendar's URL, and the stub loses to the interception
 * route outright. Moving the events themselves one segment down is what
 * actually separates them, and it settles the whole class -- no static page
 * added under /events can collide with an event id again.
 *
 * The URL events used to live at, `/events/<uuid>`, is kept alive by a 308 in
 * next.config.ts -- it went out in confirmation emails and was pasted into
 * bios, so it has to keep working.
 *
 * Use this rather than writing the path out, so the listing, the home page and
 * the revalidation call cannot drift apart.
 */
export function publicEventPath(id: string): string {
  return `/events/e/${id}`;
}
