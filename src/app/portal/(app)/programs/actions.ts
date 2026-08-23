"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseProgramForm } from "./program-form";

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
  const { data, error } = await supabase
    .from("programs")
    .select("id, name, status")
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load programs. Please try again." };
  }
  return { data: (data ?? []) as Program[] };
}
