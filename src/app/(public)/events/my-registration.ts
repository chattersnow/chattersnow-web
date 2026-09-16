import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MyContactDetails } from "@/lib/constituent/contact";

/** The caller's own registration for one event, from `my_event_registration()`. */
export type MyEventRegistration = {
  registration_id: string;
  party_size: number;
  notes: string | null;
  registered_at: string;
  checked_in_at: string | null;
};

/**
 * Who is looking at this event, where that changes what it offers (#1165).
 *
 * Null means "an ordinary visitor": signed out, signed in but not yet linked
 * to a record, or a tenant without the constituent area. All three get the
 * anonymous registration form exactly as they did before, which is why this
 * returns one nullable value rather than three states the caller has to tell
 * apart.
 */
export type EventViewer = {
  /** What the organization already has for them, to prefill with. */
  person: MyContactDetails;
  /** Their registration, if they already have one. */
  registration: MyEventRegistration | null;
};

/**
 * Loads the signed-in view of one event.
 *
 * The session is checked first so that a public page serving a visitor with no
 * cookie makes no further calls: both RPCs below are granted to
 * `authenticated` alone, so for anybody else they are a round trip that can
 * only come back empty.
 */
export async function loadEventViewer(
  eventId: string,
): Promise<EventViewer | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [details, registration] = await Promise.all([
    supabase.rpc("my_contact_details"),
    supabase.rpc("my_event_registration", { p_event_id: eventId }),
  ]);

  const person = ((details.data ?? []) as MyContactDetails[])[0];
  // No record is an account that has signed up but whose claim (#1162) has not
  // been approved, or a tenant with the area off. Either way there is no
  // `people` row to attach a registration to, so the anonymous form -- which
  // will match or mint one -- is the right offer.
  if (!person) return null;

  return {
    person,
    registration:
      ((registration.data ?? []) as MyEventRegistration[])[0] ?? null,
  };
}
