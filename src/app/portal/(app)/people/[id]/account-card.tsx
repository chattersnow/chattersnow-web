"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { linkPersonToAuthUserAction } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { formatInstantDate, formatRoleLabel } from "@/lib/format";
import type { PersonAccount, LinkableAccount } from "./person-account";

/**
 * The portal login behind a directory record. Admin-only: everything here
 * comes from `list_portal_users()`, which is gated on `is_admin()`. A
 * non-admin with people:view sees the "Portal user" badge on the profile card
 * and nothing else -- knowing an account exists is not the same as being
 * shown its email, roles, and status.
 */
export function AccountCard({
  personId,
  account,
  linkable,
}: {
  personId: string;
  account: PersonAccount | null;
  linkable: LinkableAccount[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function link(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkPersonToAuthUserAction(personId, userId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Portal account
        </CardTitle>
      </CardHeader>
      <CardContent>
        {account ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {account.deactivated_at ? (
                <Badge variant="destructive">Deactivated</Badge>
              ) : (
                <Badge variant="secondary">Active</Badge>
              )}
              {account.roles.length === 0 ? (
                <Badge variant="outline">No access</Badge>
              ) : (
                account.roles.map((role) => (
                  <Badge key={role} variant="outline">
                    {formatRoleLabel(role)}
                  </Badge>
                ))
              )}
            </div>
            <p>
              <span className="app-muted">Sign-in email:</span>{" "}
              {account.email ?? "—"}
            </p>
            <p>
              <span className="app-muted">Account created:</span>{" "}
              {formatInstantDate(account.created_at)}
            </p>
            {account.deactivated_at && (
              <p>
                <span className="app-muted">Deactivated:</span>{" "}
                {formatInstantDate(account.deactivated_at)}
              </p>
            )}
            <p>
              <Link
                href="/portal/administration/users"
                className="underline underline-offset-2"
              >
                Manage in Administration › Users
              </Link>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <EmptyState
              className="py-4"
              title="No portal account linked"
              description={
                linkable.length > 0
                  ? "An account signs in with a matching email but has never been linked to this record."
                  : "This person has no portal login. One is linked automatically the first time they sign in with a matching email."
              }
            />
            {linkable.map((candidate) => (
              <div
                key={candidate.user_id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="app-muted">{candidate.email}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => link(candidate.user_id)}
                >
                  {isPending ? (
                    <>
                      <Spinner /> Linking...
                    </>
                  ) : (
                    "Link portal account"
                  )}
                </Button>
              </div>
            ))}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
