"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBoardMemberForm } from "./board-member-form";
import type { BoardMemberRow } from "./board-members-shared";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type BoardMemberActionResult = { error: string } | { success: true };

export async function createBoardMemberAction(
  personId: string,
  formData: FormData,
): Promise<BoardMemberActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a board member.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = parseBoardMemberForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("board_members")
    .insert({ person_id: personId, ...parsed.data });

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "This person already has an active board term. Edit their existing entry instead.",
      };
    }
    return { error: "Could not save this board member. Please try again." };
  }

  revalidatePath("/portal/governance/board-members");
  return { success: true };
}

export async function updateBoardMemberAction(
  id: string,
  formData: FormData,
): Promise<BoardMemberActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this board member.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseBoardMemberForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("board_members")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "This person already has an active board term. Deactivate it first.",
      };
    }
    return { error: "Could not update this board member. Please try again." };
  }

  revalidatePath("/portal/governance/board-members");
  return { success: true };
}

export async function listBoardMembersAction(): Promise<
  { data: BoardMemberRow[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("board_members")
    .select(
      "id, role_title, term_start, term_end, is_active, notes, person:people(id, name, email, phone)",
    )
    .order("is_active", { ascending: false })
    .order("term_start", { ascending: false });

  if (error) {
    return { error: "Could not load board members. Please try again." };
  }
  return { data: (data ?? []) as unknown as BoardMemberRow[] };
}
