"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { listEventPeople } from "@/lib/events/event-people";
import { listPeopleAction, type PersonListItem } from "../people/actions";

/**
 * The people an event's person pickers offer (#1693).
 *
 * Whoever `people select` admits picks from the directory, as before. Anyone
 * else -- a per-event guest, or a role that reaches the event but not People
 * -- picks from the people already on the event's rows they can read
 * (`event_people()`): moving a volunteer onto staff, naming a staff member as
 * a checklist owner. They cannot create a person either: that is a directory
 * write, `people: manage` or `people_intake: manage`. `listPeopleAction` is
 * not widened.
 */
export async function listEventPeopleAction(
  eventId: string,
): Promise<{ data: PersonListItem[]; canCreate: boolean } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const permissions = await getCurrentUserPermissions(supabase);

  // The arms of the `people select` policy.
  const readsDirectory = hasAnyPermission(permissions, [
    { resource: "people", level: "view" },
    { resource: "people_intake", level: "manage" },
    { resource: "reimbursement_approvals", level: "manage" },
  ]);
  if (readsDirectory) {
    const result = await listPeopleAction();
    if ("error" in result) return result;
    return {
      data: result.data,
      canCreate: hasAnyPermission(permissions, [
        { resource: "people", level: "manage" },
        { resource: "people_intake", level: "manage" },
      ]),
    };
  }

  const people = await listEventPeople(supabase, eventId);
  if (!people) return { error: "Could not load people. Please try again." };
  return { data: people, canCreate: false };
}
