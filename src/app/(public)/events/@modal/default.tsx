/**
 * Nothing to overlay. The slot is only ever filled by the intercepted
 * `/events/e/[id]`, so on a hard load -- a shared link, a refresh, a new tab --
 * it renders nothing and `children` renders the event's own page (#847).
 */
export default function EventsModalDefault() {
  return null;
}
