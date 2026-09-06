import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { UsersTable } from "./users-table";
import { PendingAccessSection } from "./pending-access-section";
import { SupportAccessSection } from "./support-access-section";
import {
  canManageSupportAccessAction,
  listUsersAction,
  listRolesAction,
  listPendingGrantsAction,
  listSupportGrantsAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Administration",
};

export default async function UsersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [result, rolesResult, pendingResult, supportResult, canManageSupport] =
    await Promise.all([
      listUsersAction(),
      listRolesAction(),
      listPendingGrantsAction(),
      listSupportGrantsAction(),
      canManageSupportAccessAction(),
    ]);
  const availableRoles = "data" in rolesResult ? rolesResult.data : [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Users
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {"error" in result ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {result.error}
            </CardContent>
          </Card>
        ) : (
          <UsersTable
            users={result.data}
            currentUserId={user?.id ?? null}
            availableRoles={availableRoles}
          />
        )}

        {"error" in pendingResult ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {pendingResult.error}
            </CardContent>
          </Card>
        ) : (
          <PendingAccessSection
            grants={pendingResult.data}
            availableRoles={availableRoles}
          />
        )}

        {"error" in supportResult ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {supportResult.error}
            </CardContent>
          </Card>
        ) : (
          <SupportAccessSection
            grants={supportResult.data}
            availableRoles={availableRoles}
            canManage={canManageSupport}
          />
        )}
      </div>
    </>
  );
}
