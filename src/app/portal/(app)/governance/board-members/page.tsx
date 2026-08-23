import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserPermissions, hasPermission } from "@/lib/auth/permissions";
import { BoardMembersTable } from "./board-members-table";
import type { BoardMemberRow } from "./board-members-shared";
import type { PersonListItem } from "../../people/actions";

export default async function BoardMembersPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: boardMembers }, { data: people }] = await Promise.all([
    supabase
      .from("board_members")
      .select(
        "id, role_title, term_start, term_end, is_active, notes, person:people(id, name, email, phone)"
      )
      .order("is_active", { ascending: false })
      .order("term_start", { ascending: false }),
    supabase.from("people").select("id, name, email, phone, is_sponsor").order("name", { ascending: true }),
  ]);

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Board Members
      </h1>

      <div className="mt-6">
        <BoardMembersTable
          boardMembers={(boardMembers ?? []) as unknown as BoardMemberRow[]}
          people={(people ?? []) as PersonListItem[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
