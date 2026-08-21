"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventSponsorPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
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
  person: EventSponsorPerson;
};

export type SponsorActionResult = { error: string } | { success: true };

const SUPPORT_TYPES = ["cash", "in_kind", "both", "other"] as const;

export async function listEventSponsorsAction(
  eventId: string
): Promise<{ data: EventSponsor[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_sponsors")
    .select(
      "id, event_id, person_id, support_type, in_kind_description, contribution_value, is_public, notes, person:people(id, name, email, phone)"
    )
    .eq("event_id", eventId);

  if (error) {
    return { error: "Could not load sponsors. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventSponsor[] };
}

type SponsorValues = {
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | null;
  is_public: boolean;
  notes: string | null;
};

function readSponsorForm(formData: FormData): { error: string } | { values: SponsorValues } {
  const supportType = String(formData.get("supportType") ?? "in_kind");
  const inKindDescription = String(formData.get("inKindDescription") ?? "").trim();
  const contributionValueRaw = String(formData.get("contributionValue") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!SUPPORT_TYPES.includes(supportType as (typeof SUPPORT_TYPES)[number])) {
    return { error: "Select a valid support type." } as const;
  }

  let contributionValue: number | null = null;
  if (contributionValueRaw) {
    const parsed = Number(contributionValueRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Contribution value must be a positive number." } as const;
    }
    contributionValue = parsed;
  }

  return {
    values: {
      support_type: supportType,
      in_kind_description: inKindDescription || null,
      contribution_value: contributionValue,
      is_public: isPublic,
      notes: notes || null,
    },
  } as const;
}

export async function createEventSponsorAction(
  eventId: string,
  personId: string,
  formData: FormData
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a sponsor." };
  }

  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = readSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_sponsors")
    .insert({ event_id: eventId, person_id: personId, ...parsed.values });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "This person is already linked to this event as a sponsor. Edit their existing entry instead.",
      };
    }
    return { error: "Could not save the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventSponsorAction(
  id: string,
  formData: FormData
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update a sponsor." };
  }

  const parsed = readSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_sponsors").update(parsed.values).eq("id", id);

  if (error) {
    return { error: "Could not update the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventSponsorAction(id: string): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove a sponsor." };
  }

  const { error } = await supabase.from("event_sponsors").delete().eq("id", id);

  if (error) {
    return { error: "Could not remove the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
