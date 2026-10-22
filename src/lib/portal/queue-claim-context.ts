import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Someone a queue item can be assigned to: the people with portal access,
 * shaped for PersonPicker. The database does not require the assignee to hold
 * the queue's permission (#1668); offering staff is the picker's job.
 */
export type ClaimStaffMember = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  auth_user_id: string | null;
  has_portal_access: boolean | null;
};

export type QueueClaimContext = {
  /** The caller's own person record, or null when they have none to claim as. */
  myPersonId: string | null;
  staff: ClaimStaffMember[];
};

/**
 * What a queue list page needs to offer claiming: who "Mine" is, and who can
 * be assigned or filtered by. The staff read rides the `people` select policy,
 * so a caller without people access gets an empty list rather than an error --
 * Claim and Unclaim still work, only the person picker and filter are empty.
 */
export async function getQueueClaimContext(
  supabase: SupabaseClient,
): Promise<QueueClaimContext> {
  const [{ data: myPersonId }, { data: staff }] = await Promise.all([
    supabase.rpc("my_person_id"),
    supabase
      .from("people")
      .select(
        "id, name, preferred_name, email, phone, auth_user_id, has_portal_access",
      )
      .eq("has_portal_access", true)
      .order("name", { ascending: true }),
  ]);

  return {
    myPersonId: (myPersonId as string | null) ?? null,
    staff: (staff ?? []) as ClaimStaffMember[],
  };
}
