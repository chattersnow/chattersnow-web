/**
 * Closes the sheet on any client-side navigation that leaves the intercepted
 * URL for somewhere else under /events -- the community calendar, say.
 *
 * A parallel slot keeps its last matched route until something else matches,
 * so without this the sheet would ride along over whichever page under /events
 * the visitor went to next. `default.tsx` does not cover that: it is only
 * consulted on a hard load.
 */
export default function EventsModalCatchAll() {
  return null;
}
