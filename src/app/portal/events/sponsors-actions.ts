"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventSponsor = {
  id: string;
  event_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | string | null;
  is_public: boolean;
  notes: string | null;
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
      "id, event_id, name, contact_name, contact_email, contact_phone, support_type, in_kind_description, contribution_value, is_public, notes"
    )
    .eq("event_id", eventId)
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load sponsors. Please try again." };
  }
  return { data: data ?? [] };
}

type SponsorValues = {
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | null;
  is_public: boolean;
  notes: string | null;
};

function readSponsorForm(formData: FormData): { error: string } | { values: SponsorValues } {
  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const supportType = String(formData.get("supportType") ?? "in_kind");
  const inKindDescription = String(formData.get("inKindDescription") ?? "").trim();
  const contributionValueRaw = String(formData.get("contributionValue") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Sponsor name is required." } as const;
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
      name,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
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
  formData: FormData
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a sponsor." };
  }

  const parsed = readSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_sponsors")
    .insert({ event_id: eventId, ...parsed.values });

  if (error) {
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
