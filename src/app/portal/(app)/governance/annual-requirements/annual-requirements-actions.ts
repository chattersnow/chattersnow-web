"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  parseAnnualRequirementForm,
  type RequirementStatus,
} from "./annual-requirement-form";
import { parseContentForm } from "../meetings/content-form";

export type { RequirementStatus };

export type RequirementResponsiblePerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type AnnualRequirement = {
  id: string;
  name: string;
  due_date: string;
  status: RequirementStatus;
  completed_at: string | null;
  external_link: string | null;
  body_text: string | null;
  responsible: RequirementResponsiblePerson | null;
};

export type AnnualRequirementActionResult =
  { error: string } | { success: true };

// Derives completed_at from a status transition: entering "done" stamps the
// current time (unless it was already done, in which case the existing
// timestamp is kept so re-saving an already-done item doesn't bump it); any
// other status clears it. No DB trigger for this -- it's plain application
// logic, consistent with this table having no automation elsewhere (issue #39).
function resolveCompletedAt(
  previousStatus: string | null,
  previousCompletedAt: string | null,
  nextStatus: RequirementStatus,
): string | null {
  if (nextStatus !== "done") return null;
  if (previousStatus === "done" && previousCompletedAt) {
    return previousCompletedAt;
  }
  return new Date().toISOString();
}

export async function createAnnualRequirementAction(
  responsiblePersonId: string | null,
  formData: FormData,
): Promise<AnnualRequirementActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add an annual requirement.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseAnnualRequirementForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase.from("annual_requirements").insert({
    responsible_person_id: responsiblePersonId,
    ...parsed.data,
    ...content.data,
    completed_at: resolveCompletedAt(null, null, parsed.data.status),
  });

  if (error) {
    return {
      error: "Could not add this annual requirement. Please try again.",
    };
  }

  revalidatePath("/portal/governance/annual-requirements");
  return { success: true };
}

export async function updateAnnualRequirementAction(
  id: string,
  responsiblePersonId: string | null,
  formData: FormData,
): Promise<AnnualRequirementActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this annual requirement.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseAnnualRequirementForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { data: existing } = await supabase
    .from("annual_requirements")
    .select("status, completed_at")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("annual_requirements")
    .update({
      responsible_person_id: responsiblePersonId,
      ...parsed.data,
      ...content.data,
      completed_at: resolveCompletedAt(
        existing?.status ?? null,
        existing?.completed_at ?? null,
        parsed.data.status,
      ),
    })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update this annual requirement. Please try again.",
    };
  }

  revalidatePath("/portal/governance/annual-requirements");
  return { success: true };
}

export async function updateAnnualRequirementStatusAction(
  id: string,
  status: RequirementStatus,
): Promise<AnnualRequirementActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this annual requirement.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: existing } = await supabase
    .from("annual_requirements")
    .select("status, completed_at")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("annual_requirements")
    .update({
      status,
      completed_at: resolveCompletedAt(
        existing?.status ?? null,
        existing?.completed_at ?? null,
        status,
      ),
    })
    .eq("id", id);

  if (error) {
    return {
      error:
        "Could not update this annual requirement's status. Please try again.",
    };
  }

  revalidatePath("/portal/governance/annual-requirements");
  return { success: true };
}
