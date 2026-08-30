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

export type PartnershipOrganization = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type PartnershipOpportunity = {
  id: string;
  stage: PartnershipStage;
  next_step_date: string | null;
  notes: string | null;
  organization: PartnershipOrganization;
  owner: PartnershipOwner | null;
};

export type PartnershipActionResult = { error: string } | { success: true };

export async function createPartnershipOpportunityAction(
  organizationPersonId: string | null,
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

  if (!organizationPersonId) {
    return { error: "Select or create the partner organization." };
  }

  const parsed = parsePartnershipOpportunityForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("partnership_opportunities").insert({
    organization_person_id: organizationPersonId,
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
  organizationPersonId: string | null,
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

  if (!organizationPersonId) {
    return { error: "Select or create the partner organization." };
  }

  const parsed = parsePartnershipOpportunityForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("partnership_opportunities")
    .update({
      organization_person_id: organizationPersonId,
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
