"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseProgramForm } from "./program-form";
import { checkPermission } from "@/lib/auth/permissions";

export type ProgramActionResult = { error: string } | { success: true };

function friendlyError(error: { code?: string }, fallback: string) {
  return error.code === "23505" ? "A program with this name already exists." : fallback;
}

export async function createProgramAction(formData: FormData): Promise<ProgramActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to create a program." };
  }
  const permissionError = await checkPermission(supabase, "programs", "manage");
  if (permissionError) return permissionError;

  const parsed = parseProgramForm(formData);
  if ("error" in parsed) return parsed;
  const { name, description, status } = parsed.data;

  const { error } = await supabase.from("programs").insert({ name, description, status });

  if (error) {
    return { error: friendlyError(error, "Could not create the program. Please try again.") };
  }

  revalidatePath("/portal/programs");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateProgramAction(
  id: string,
  formData: FormData
): Promise<ProgramActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update a program." };
  }
  const permissionError = await checkPermission(supabase, "programs", "manage");
  if (permissionError) return permissionError;

  const parsed = parseProgramForm(formData);
  if ("error" in parsed) return parsed;
  const { name, description, status } = parsed.data;

  const { error } = await supabase
    .from("programs")
    .update({ name, description, status })
    .eq("id", id);

  if (error) {
    return { error: friendlyError(error, "Could not update the program. Please try again.") };
  }

  revalidatePath("/portal/programs");
  revalidatePath("/portal/events");
  return { success: true };
}

export type Program = { id: string; name: string; status: string };

export async function listProgramsAction(): Promise<{ data: Program[] } | { error: string }> {
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
  programId: string
): Promise<{ data: ProgramEvent[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("events")
    .select("id, name, starts_at, status, visibility")
    .eq("program_id", programId)
    .order("starts_at", { ascending: false });

  if (error) {
    return { error: "Could not load this program's events. Please try again." };
  }
  return { data: (data ?? []) as ProgramEvent[] };
}
