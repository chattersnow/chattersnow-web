"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePersonForm } from "./person-form";
import type { PersonType } from "./people-shared";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";

/**
 * Replaces a person's manual role tags -- the half of the derived role model
 * that no source record backs (20260903030000). Returns an error result to
 * hand straight back to the caller, or null on success.
 */
async function setRoleTags(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  personId: string,
  roles: string[],
): Promise<{ error: string } | null> {
  const { error } = await supabase.rpc("set_person_role_tags", {
    p_person_id: personId,
    p_roles: roles,
  });
  if (error) {
    return { error: "Could not save this person's roles. Please try again." };
  }
  return null;
}

export type PersonActionResult =
  // `conflict` names the person who already holds the submitted email, so the
  // caller can link to them instead of leaving staff to search for a record
  // they cannot see. Only set when the save failed on the email uniqueness
  // index (20260904190000_enforce_unique_person_email.sql).
  | { error: string; conflict?: { id: string; name: string | null } }
  | {
      success: true;
      person?: {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        // Optional for the same reason as on PersonListItem/PickedPerson:
        // callers that build a person literal need not carry these.
        preferred_name?: string | null;
        auth_user_id?: string | null;
      };
    };

export type PersonListItem = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  // Optional: only selected where organization filtering is needed (e.g. the
  // People list, and PersonPicker's `onlyOrganizations` mode). The many other
  // callers across the app that select a narrower PersonListItem shape don't
  // carry this column and should treat it as unknown/false.
  person_type?: PersonType;
  // Optional for the same reason as person_type: the many narrower
  // PersonListItem selects across the app don't carry these columns.
  // personDisplayName() degrades to `name` when preferred_name is absent, and
  // a missing auth_user_id simply means no "Portal user" badge is shown.
  preferred_name?: string | null;
  auth_user_id?: string | null;
};

export type OrganizationMembershipActionResult =
  { error: string } | { success: true };

/**
 * Turns a failed people insert/update into a message that names whoever
 * already uses the address. A plain select is enough: the "people select"
 * policy admits people_intake:manage (20260823160000) and
 * reimbursement_approvals:manage (20260826000000) alongside people:view, so
 * every role that can write a person can also read the one it collided with.
 *
 * `excludeId` is the row being updated -- without it, saving a person without
 * changing their email would report them as their own conflict.
 */
async function emailConflictError(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  error: { code?: string },
  email: string | null,
  fallback: string,
  excludeId?: string,
): Promise<PersonActionResult> {
  const message = friendlyError(
    error,
    "That email address is already used by another person.",
    fallback,
  );
  if (error.code !== "23505" || !email) return { error: message };

  let query = supabase.from("people").select("id, name").eq("email", email);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  if (!data) return { error: message };

  const who = data.name ?? "Another record";
  return {
    error: `${who} already uses ${email}. Open their record to update it, or use a different address.`,
    conflict: { id: data.id, name: data.name },
  };
}

export async function createPersonAction(
  formData: FormData,
  primaryContactPersonId: string | null = null,
): Promise<PersonActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a person.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "people", level: "manage" },
    { resource: "people_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parsePersonForm(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase
    .from("people")
    .insert({
      ...parsed.data,
      is_anonymous: false,
      source_type: "other",
      primary_contact_person_id: primaryContactPersonId,
    })
    .select("id, name, preferred_name, email, phone, auth_user_id")
    .single();
  if (error) {
    return emailConflictError(
      supabase,
      error,
      parsed.data.email,
      "Could not save this person. Please try again.",
    );
  }

  // Roles are derived from source records unioned with these tags, so the
  // checkboxes write tags: there is no role column on `people` to set.
  const rolesError = await setRoleTags(supabase, data.id, parsed.roles);
  if (rolesError) return rolesError;

  revalidatePath("/portal/people");
  return { success: true, person: data };
}

export async function listPeopleAction(): Promise<
  { data: PersonListItem[] } | { error: string }
> {
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
    .select("id, name, preferred_name, email, phone, person_type, auth_user_id")
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load people. Please try again." };
  }
  return { data: (data ?? []) as PersonListItem[] };
}

export async function updatePersonAction(
  id: string,
  formData: FormData,
  primaryContactPersonId: string | null = null,
): Promise<PersonActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this person.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const parsed = parsePersonForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("people")
    .update({
      ...parsed.data,
      primary_contact_person_id: primaryContactPersonId,
    })
    .eq("id", id);
  if (error) {
    return emailConflictError(
      supabase,
      error,
      parsed.data.email,
      "Could not update this person. Please try again.",
      id,
    );
  }

  const rolesError = await setRoleTags(supabase, id, parsed.roles);
  if (rolesError) return rolesError;

  revalidatePath("/portal/people");
  revalidatePath(`/portal/people/${id}`);
  return { success: true };
}

export async function addOrganizationMembershipAction(
  organizationId: string,
  personId: string,
  role: string | null = null,
): Promise<OrganizationMembershipActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to link an organization.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("person_organizations").insert({
    organization_id: organizationId,
    person_id: personId,
    role,
  });
  if (error) {
    return { error: "Could not link this organization. Please try again." };
  }

  revalidatePath(`/portal/people/${organizationId}`);
  revalidatePath(`/portal/people/${personId}`);
  return { success: true };
}

export async function removeOrganizationMembershipAction(
  membershipId: string,
): Promise<OrganizationMembershipActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove this link.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("person_organizations")
    .delete()
    .eq("id", membershipId);
  if (error) {
    return { error: "Could not remove this link. Please try again." };
  }

  revalidatePath("/portal/people");
  return { success: true };
}

/**
 * Links a directory record to an existing portal login. Gated on
 * administration:manage rather than people:manage: this grants an account
 * whatever the person record is entitled to across the portal, which is an
 * account-administration decision, not a contact-editing one. The RPC
 * re-checks is_admin() server-side regardless.
 */
export async function linkPersonToAuthUserAction(
  personId: string,
  userId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to link a portal account.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("link_person_to_auth_user", {
    p_person_id: personId,
    p_user_id: userId,
  });
  if (error) {
    // The RPC raises readable messages for the three conflict cases (already
    // linked elsewhere, account taken, no such record); pass them through
    // rather than flattening them into one generic failure.
    return { error: error.message || "Could not link this portal account." };
  }

  revalidatePath("/portal/people");
  revalidatePath(`/portal/people/${personId}`);
  revalidatePath("/portal/administration/users");
  return { success: true };
}

/**
 * Honours a request to delete a rider profile.
 *
 * /privacy keeps a rider profile "until you ask us to delete your profile, or
 * after 2 years of inactivity" (#602). The scheduled purge covers the second
 * half; this is the first, and it is the only retention action a person outside
 * Administration can take.
 *
 * Gated on events:manage as well as people:manage because that request reaches
 * whoever is running the event at least as often as it reaches the directory,
 * and a lead working the door holds events:manage without necessarily holding
 * people:view -- the same asymmetry set_registrant_rider_profile was written
 * around. The RPC re-checks both rather than trusting this call site.
 */
export async function deleteRiderProfileAction(
  personId: string,
  reason?: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete a rider profile.",
  );
  if ("error" in userResult) return userResult;

  const permissionError = await checkAnyPermission(supabase, [
    { resource: "people", level: "manage" },
    { resource: "events", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("delete_rider_profile", {
    p_person_id: personId,
    p_reason: reason?.trim() ? reason.trim() : null,
  });

  if (error) {
    return { error: "Could not delete this rider profile. Please try again." };
  }

  revalidatePath("/portal/people");
  revalidatePath(`/portal/people/${personId}`);
  revalidatePath("/portal/administration/data-retention");
  return { success: true };
}
