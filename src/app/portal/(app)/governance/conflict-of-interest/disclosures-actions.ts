"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { parseDisclosureForm } from "./disclosure-form";
import { parseContentForm } from "../meetings/content-form";

export type DisclosurePerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type Disclosure = {
  id: string;
  disclosure_year: number;
  on_file_date: string | null;
  notes: string | null;
  external_link: string | null;
  body_text: string | null;
  person: DisclosurePerson;
};

export type DisclosureActionResult = { error: string } | { success: true };

const DISCLOSURE_SELECT =
  "id, disclosure_year, on_file_date, notes, external_link, body_text, person:people!person_id(id, name, email, phone)";

const DUPLICATE_MESSAGE =
  "This person already has a disclosure recorded for this year. Edit their existing entry instead.";

export async function listDisclosuresAction(): Promise<
  { data: Disclosure[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("conflict_of_interest_disclosures")
    .select(DISCLOSURE_SELECT)
    .order("disclosure_year", { ascending: false });

  if (error) {
    return { error: "Could not load disclosures. Please try again." };
  }
  return { data: (data ?? []) as unknown as Disclosure[] };
}

export async function createDisclosureAction(
  personId: string,
  formData: FormData,
): Promise<DisclosureActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a disclosure.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person for this disclosure." };
  }

  const parsed = parseDisclosureForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase
    .from("conflict_of_interest_disclosures")
    .insert({
      person_id: personId,
      ...parsed.data,
      ...content.data,
    });

  if (error) {
    return {
      error: friendlyError(
        error,
        DUPLICATE_MESSAGE,
        "Could not add this disclosure. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/governance/conflict-of-interest");
  return { success: true };
}

export async function updateDisclosureAction(
  id: string,
  personId: string,
  formData: FormData,
): Promise<DisclosureActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this disclosure.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person for this disclosure." };
  }

  const parsed = parseDisclosureForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase
    .from("conflict_of_interest_disclosures")
    .update({
      person_id: personId,
      ...parsed.data,
      ...content.data,
    })
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        DUPLICATE_MESSAGE,
        "Could not update this disclosure. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/governance/conflict-of-interest");
  return { success: true };
}

export async function deleteDisclosureAction(
  id: string,
): Promise<DisclosureActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove this disclosure.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("conflict_of_interest_disclosures")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not remove this disclosure. Please try again." };
  }

  revalidatePath("/portal/governance/conflict-of-interest");
  return { success: true };
}
