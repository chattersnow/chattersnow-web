import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PersonListItem } from "../actions";

/**
 * Every person in the directory except this one, for the pickers on their
 * record: Profile chooses a primary contact, Organizations adds a membership,
 * and the merge dialog picks the duplicate.
 *
 * Cached per request because those three no longer share a parent. Until #1108
 * one component fetched this once and handed it to all of them; splitting them
 * into their own Suspense boundaries -- so the Profile card stops waiting on
 * the portal-users RPC to render -- would otherwise have run a whole-table
 * select once per card.
 */
export const listOtherPeople = cache(
  async (personId: string): Promise<PersonListItem[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("people")
      .select(
        "id, name, preferred_name, email, phone, person_type, auth_user_id, has_portal_access",
      )
      .neq("id", personId)
      .order("name", { ascending: true });
    return (data ?? []) as unknown as PersonListItem[];
  },
);
