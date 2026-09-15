import "server-only";
import { after } from "next/server";

/**
 * Work to do once the response is on its way: a notification email, mostly.
 *
 * `after()` is the right tool and throws when there is no request scope to be
 * after -- which is every context that is not a live Next request, including
 * the integration suite that calls these handlers as the plain functions they
 * are. Falling back to running the work detached keeps the meaning ("this does
 * not block the answer") in a context where "after the response" has no
 * meaning, rather than turning a successful write into a 500 because its
 * receipt could not be scheduled.
 *
 * A rejection is logged and swallowed either way. Nothing here is allowed to
 * fail a submission that the database has already committed: an applicant who
 * gets no confirmation email still applied.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  const guarded = async () => {
    try {
      await work();
    } catch (failure) {
      console.error("[api] after-response work failed", failure);
    }
  };

  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
