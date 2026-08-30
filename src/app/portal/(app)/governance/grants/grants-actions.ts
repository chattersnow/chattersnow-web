"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseGrantForm, type GrantStatus } from "./grant-form";

export type { GrantStatus };

export type GrantOwner = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type Grant = {
  id: string;
  funder_name: string;
  amount: number | null;
  application_deadline: string;
  status: GrantStatus;
  notes: string | null;
  owner: GrantOwner | null;
};

export type GrantActionResult = { error: string } | { success: true };

export async function createGrantAction(
  ownerPersonId: string | null,
  formData: FormData,
): Promise<GrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a grant.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseGrantForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("grants").insert({
    owner_person_id: ownerPersonId,
    ...parsed.data,
  });

  if (error) {
    return { error: "Could not add this grant. Please try again." };
  }

  revalidatePath("/portal/governance/grants");
  revalidatePath("/portal/home");
  return { success: true };
}

export async function updateGrantAction(
  id: string,
  ownerPersonId: string | null,
  formData: FormData,
): Promise<GrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this grant.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseGrantForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("grants")
    .update({
      owner_person_id: ownerPersonId,
      ...parsed.data,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this grant. Please try again." };
  }

  revalidatePath("/portal/governance/grants");
  revalidatePath("/portal/home");
  return { success: true };
}
