import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { BoardMembersTable } from "./board-members-table";
import { NewBoardMemberDialog } from "./new-board-member-dialog";
import type { BoardMemberRow } from "./board-members-shared";
import type { PersonListItem } from "../../people/actions";

export const metadata: Metadata = {
  title: "Governance",
};

export default async function BoardMembersPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: boardMembers }, { data: people }] = await Promise.all([
    supabase
      .from("board_members")
      .select(
        "id, role_title, term_start, term_end, is_active, notes, person:people(id, name, email, phone)",
      )
      .order("is_active", { ascending: false })
      .order("term_start", { ascending: false })
      .order("id", { ascending: true }),
    supabase
      .from("people")
      .select("id, name, preferred_name, email, phone, auth_user_id")
      .order("name", { ascending: true }),
  ]);

  const peopleOptions = (people ?? []) as PersonListItem[];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Board Members
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <BoardMembersTable
          boardMembers={(boardMembers ?? []) as unknown as BoardMemberRow[]}
          canManage={canManage}
          newAction={
            canManage ? (
              <NewBoardMemberDialog people={peopleOptions} />
            ) : undefined
          }
        />
      </div>
    </>
  );
}
