"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseProgramForm, type ProgramFormData } from "./program-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type ProgramActionResult = { error: string } | { success: true };

function friendlyError(error: { code?: string }, fallback: string) {
  return error.code === "23505"
    ? "A program with this name already exists."
    : fallback;
}

/** The column names, once, so create and update cannot drift apart. */
function programRow(data: ProgramFormData) {
  return {
    name: data.name,
    description: data.description,
    status: data.status,
    is_public: data.isPublic,
    pillar: data.pillar,
    emoji: data.emoji,
    sort_order: data.sortOrder,
  };
}

/**
 * The public Programs page renders these rows when the tenant has pointed it
 * at the module (#898), so a save has to reach it as well as the portal. It is
 * revalidated unconditionally: reading `layout.programs_source` first to find
 * out whether it matters would cost a query on every save to save nothing.
 */
function revalidateProgramSurfaces() {
  revalidatePath("/portal/programs");
  revalidatePath("/portal/events");
  revalidatePath("/programs");
}

export async function createProgramAction(
  formData: FormData,
): Promise<ProgramActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create a program.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "programs", "manage");
  if (permissionError) return permissionError;

  const parsed = parseProgramForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("programs")
    .insert(programRow(parsed.data));

  if (error) {
    return {
      error: friendlyError(
        error,
        "Could not create the program. Please try again.",
      ),
    };
  }

  revalidateProgramSurfaces();
  return { success: true };
}

export async function updateProgramAction(
  id: string,
  formData: FormData,
): Promise<ProgramActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a program.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "programs", "manage");
  if (permissionError) return permissionError;

  const parsed = parseProgramForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("programs")
    .update(programRow(parsed.data))
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "Could not update the program. Please try again.",
      ),
    };
  }

  revalidateProgramSurfaces();
  return { success: true };
}

/**
 * The pillar labels the public Programs page groups by, for the form's picker.
 *
 * Through an RPC rather than reading `site_content` directly: that table's
 * select policy requires `site_content:view`, which only `admin` holds, while
 * an `event_coordinator` manages programs. A free-text pillar field instead
 * would mean a typo silently ungroups a program on the live site.
 */
export async function listProgramPillarsAction(): Promise<
  { data: string[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "programs", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("list_program_pillars");

  if (error) {
    return { error: "Could not load the pillars. Please try again." };
  }
  return { data: (data ?? []) as string[] };
}

export type Program = { id: string; name: string; status: string };

export async function listProgramsAction(): Promise<
  { data: Program[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "programs", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("programs")
    .select("id, name, status")
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load programs. Please try again." };
  }
  return { data: (data ?? []) as Program[] };
}

export type ProgramEvent = {
  id: string;
  name: string;
  starts_at: string;
  status: string;
  visibility: string;
};

export async function listProgramEventsAction(
  programId: string,
): Promise<{ data: ProgramEvent[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  // Filtered through the join table with an inner join rather than ordering a
  // query rooted at event_programs: PostgREST's `order` on an embedded table
  // sorts within the embed, not the parent rows, so events has to stay the top
  // level for `starts_at` ordering to mean anything.
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, name, starts_at, status, visibility, event_programs!inner(program_id)",
    )
    .eq("event_programs.program_id", programId)
    .order("starts_at", { ascending: false });

  if (error) {
    return { error: "Could not load this program's events. Please try again." };
  }
  return {
    data: (data ?? []).map(({ event_programs: _links, ...event }) => event),
  };
}
