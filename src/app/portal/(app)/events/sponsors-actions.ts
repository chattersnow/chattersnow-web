"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSponsorForm } from "./sponsor-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type EventSponsorPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

/** One thing the sponsor gave. These are ordinary `inventory_items` rows under
 *  the sponsorship's donation (#1005), which is why each one can be picked as a
 *  giveaway prize source or released to the public gear catalog on its own. */
export type EventSponsorItem = {
  id: string;
  description: string;
  face_value: number | string | null;
  intended_use: string;
  status: string;
  /** Already claimed by a giveaway prize, so removing it would empty that prize
   *  and the RPC refuses. The form disables its remove button instead. */
  allocated: boolean;
};

export type EventSponsor = {
  id: string;
  event_id: string;
  person_id: string;
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | string | null;
  is_public: boolean;
  notes: string | null;
  follow_up_status: string;
  follow_up_notes: string | null;
  donation_id: string | null;
  monetary_donation_id: string | null;
  person: EventSponsorPerson;
  items: EventSponsorItem[];
};

export type SponsorActionResult = { error: string } | { success: true };

/** `delete_sponsor_inventory_items` refuses to remove an item a giveaway prize
 *  or a distribution already claims, and names it. That is the one sponsor
 *  error worth showing verbatim -- the generic "please try again" would send
 *  the staffer round the same loop. */
function allocationMessage(error: { message?: string }): string | null {
  const message = error.message ?? "";
  return message.includes("before removing the item") ? message : null;
}

export async function listEventSponsorsAction(
  eventId: string,
): Promise<{ data: EventSponsor[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  // The items live in `inventory_items`, which is gated on inventory:view --
  // event_coordinator holds events:manage and none of it -- so they come back
  // through a security definer RPC rather than an embed. Same boundary
  // `list_available_giveaway_sources` crosses for the prize picker.
  const [sponsors, items] = await Promise.all([
    supabase
      .from("event_sponsors")
      .select(
        "id, event_id, person_id, support_type, in_kind_description, contribution_value, is_public, notes, follow_up_status, follow_up_notes, donation_id, monetary_donation_id, person:people(id, name, email, phone)",
      )
      .eq("event_id", eventId),
    supabase.rpc("list_event_sponsor_items", { p_event_id: eventId }),
  ]);

  if (sponsors.error || items.error) {
    return { error: "Could not load sponsors. Please try again." };
  }

  const itemsBySponsor = (items.data ?? {}) as Record<
    string,
    EventSponsorItem[]
  >;

  return {
    data: ((sponsors.data ?? []) as unknown as EventSponsor[]).map(
      (sponsor) => ({
        ...sponsor,
        items: itemsBySponsor[sponsor.id] ?? [],
      }),
    ),
  };
}

export async function createEventSponsorAction(
  eventId: string,
  personId: string,
  formData: FormData,
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a sponsor.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = parseSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc("create_event_sponsor", {
    p_event_id: eventId,
    p_person_id: personId,
    p_support_type: parsed.data.support_type,
    p_contribution_value: parsed.data.contribution_value,
    p_is_public: parsed.data.is_public,
    p_notes: parsed.data.notes,
    p_follow_up_status: parsed.data.follow_up_status,
    p_follow_up_notes: parsed.data.follow_up_notes,
    p_items: parsed.data.items,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "This person is already linked to this event as a sponsor. Edit their existing entry instead.",
      };
    }
    return { error: "Could not save the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventSponsorAction(
  id: string,
  formData: FormData,
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a sponsor.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc("update_event_sponsor", {
    p_id: id,
    p_support_type: parsed.data.support_type,
    p_contribution_value: parsed.data.contribution_value,
    p_is_public: parsed.data.is_public,
    p_notes: parsed.data.notes,
    p_follow_up_status: parsed.data.follow_up_status,
    p_follow_up_notes: parsed.data.follow_up_notes,
    p_items: parsed.data.items,
  });

  if (error) {
    return {
      error:
        allocationMessage(error) ??
        "Could not update the sponsor. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventSponsorAction(
  id: string,
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a sponsor.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("delete_event_sponsor", { p_id: id });

  if (error) {
    return {
      error:
        allocationMessage(error) ??
        "Could not remove the sponsor. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
