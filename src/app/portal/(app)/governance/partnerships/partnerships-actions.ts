"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  parsePartnershipOpportunityForm,
  type PartnershipStage,
} from "./partnership-opportunity-form";

export type { PartnershipStage };

export type PartnershipOwner = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type PartnershipOpportunity = {
  id: string;
  organization_name: string;
  contact_name: string | null;
  contact_email: string | null;
  stage: PartnershipStage;
  next_step_date: string | null;
  notes: string | null;
  owner: PartnershipOwner | null;
};

export type PartnershipActionResult = { error: string } | { success: true };

export async function createPartnershipOpportunityAction(
  ownerPersonId: string | null,
  formData: FormData,
): Promise<PartnershipActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a partnership opportunity.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parsePartnershipOpportunityForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("partnership_opportunities").insert({
    owner_person_id: ownerPersonId,
    ...parsed.data,
  });

  if (error) {
    return {
      error: "Could not add this partnership opportunity. Please try again.",
    };
  }

  revalidatePath("/portal/governance/partnerships");
  revalidatePath("/portal/home");
  return { success: true };
}

export async function updatePartnershipOpportunityAction(
  id: string,
  ownerPersonId: string | null,
  formData: FormData,
): Promise<PartnershipActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this partnership opportunity.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parsePartnershipOpportunityForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("partnership_opportunities")
    .update({
      owner_person_id: ownerPersonId,
      ...parsed.data,
    })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update this partnership opportunity. Please try again.",
    };
  }

  revalidatePath("/portal/governance/partnerships");
  revalidatePath("/portal/home");
  return { success: true };
}
