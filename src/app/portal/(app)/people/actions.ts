"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PersonActionResult =
  | { error: string }
  | { success: true; person?: { id: string; name: string | null; email: string | null; phone: string | null } };

export type PersonListItem = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_sponsor: boolean;
};

type PersonValues = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_donor: boolean;
  is_sponsor: boolean;
  is_volunteer: boolean;
};

function readPersonForm(formData: FormData): { error: string } | { values: PersonValues } {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const is_donor = formData.get("isDonor") === "true";
  const is_sponsor = formData.get("isSponsor") === "true";
  const is_volunteer = formData.get("isVolunteer") === "true";

  if (!name) return { error: "Name is required." } as const;
  if (!is_donor && !is_sponsor && !is_volunteer) {
    return { error: "Select at least one role." } as const;
  }

  return {
    values: {
      name,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      is_donor,
      is_sponsor,
      is_volunteer,
    },
  } as const;
}

export async function createPersonAction(formData: FormData): Promise<PersonActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a person." };
  }

  const parsed = readPersonForm(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase
    .from("people")
    .insert({ ...parsed.values, is_anonymous: false, source_type: "other" })
    .select("id, name, email, phone")
    .single();
  if (error) {
    return { error: "Could not save this person. Please try again." };
  }

  revalidatePath("/portal/people");
  return { success: true, person: data };
}

export async function listPeopleAction(): Promise<{ data: PersonListItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, name, email, phone, is_sponsor")
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load people. Please try again." };
  }
  return { data: (data ?? []) as PersonListItem[] };
}

export async function updatePersonAction(
  id: string,
  formData: FormData
): Promise<PersonActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update this person." };
  }

  const parsed = readPersonForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("people").update(parsed.values).eq("id", id);
  if (error) {
    return { error: "Could not update this person. Please try again." };
  }

  revalidatePath("/portal/people");
  return { success: true };
}
