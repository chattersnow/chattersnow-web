import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
import { UsersTable } from "./users-table";
import { PendingAccessSection } from "./pending-access-section";
import {
  listUsersAction,
  listRolesAction,
  listPendingGrantsAction,
} from "./actions";

export default async function UsersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [result, rolesResult, pendingResult] = await Promise.all([
    listUsersAction(),
    listRolesAction(),
    listPendingGrantsAction(),
  ]);
  const availableRoles = "data" in rolesResult ? rolesResult.data : [];

  return (
    <>
      <div className="rainbow-accent w-16" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Users
        </h1>
        <HowToSheet title="How user access works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong className="text-foreground">Active users</strong> — an
                admin assigns or removes roles directly on an existing account,
                or deactivates it. Deactivating revokes portal access
                immediately but keeps their roles on file for reactivation.
              </li>
              <li>
                <strong className="text-foreground">Pending access</strong> —
                new access instead starts by staging an email and role below.
                That creates a grant with status <code>pending</code>.
              </li>
              <li>
                <strong className="text-foreground">Invite</strong> — clicking
                Invite generates a one-time link, valid for about an hour.
                Nothing is emailed automatically — you have to copy the link and
                share it yourself.
              </li>
              <li>
                <strong className="text-foreground">Claimed or revoked</strong>{" "}
                — the grant becomes <code>claimed</code> once the person signs
                up with that link, or an admin can <code>revoke</code> it
                beforehand. An unused link that passes its hour shows as Expired
                but stays revocable/re-inviteable.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Who can do this">
            <p>
              Only <strong className="text-foreground">admin</strong> can grant,
              edit, or revoke access.
            </p>
          </HowToSection>
          <HowToSection heading="What happens downstream">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Deactivating a user revokes portal access on their very next
                request — there&apos;s no session to clear or grace period.
              </li>
              <li>
                Role assignments, deactivations, and pending-grant changes are
                all written to the audit log.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="Common mistakes">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Forgetting to copy and send the invite link — nothing is emailed
                for you, so the pending grant just sits there until someone
                shares it.
              </li>
              <li>
                Revoking your own admin role removes your own access immediately
                — have another admin do it if you&apos;re stepping back.
              </li>
            </ul>
          </HowToSection>
        </HowToSheet>
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
      </div>
    </>
  );
}
