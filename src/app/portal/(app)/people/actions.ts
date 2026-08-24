"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePersonForm } from "./person-form";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";

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

export async function createPersonAction(formData: FormData): Promise<PersonActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a person." };
  }
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "people", level: "manage" },
    { resource: "people_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parsePersonForm(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase
    .from("people")
    .insert({ ...parsed.data, is_anonymous: false, source_type: "other" })
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
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "people", level: "view" },
    { resource: "volunteers", level: "view" },
    { resource: "events", level: "view" },
    { resource: "governance", level: "manage" },
    { resource: "people_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

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
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const parsed = parsePersonForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("people").update(parsed.data).eq("id", id);
  if (error) {
    return { error: "Could not update this person. Please try again." };
  }

  revalidatePath("/portal/people");
  return { success: true };
}
