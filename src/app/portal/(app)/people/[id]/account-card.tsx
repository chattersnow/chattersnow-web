"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
import {
  linkPersonToAuthUserAction,
  updatePersonNotificationEmailAction,
} from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  formatInstantDate,
  formatRoleLabel,
  type RoleLabels,
} from "@/lib/format";
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
  roleLabels,
  notificationEmail,
  canManagePerson,
}: {
  personId: string;
  account: PersonAccount | null;
  linkable: LinkableAccount[];
  /** name -> the tenant's wording, for the role names on the account (#910). */
  roleLabels: RoleLabels;
  /** Their delivery override, null when mail goes to the sign-in address. */
  notificationEmail: string | null;
  /** people:manage, which the override is written under -- see the action. */
  canManagePerson: boolean;
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
                    {formatRoleLabel(role, roleLabels)}
                  </Badge>
                ))
              )}
            </div>
            <p>
              <span className="app-muted">Sign-in email:</span>{" "}
              {account.email ?? "—"}
            </p>
            <NotificationEmailRow
              personId={personId}
              signInEmail={account.email}
              value={notificationEmail}
              canManage={canManagePerson}
            />
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

/**
 * The address this person's portal email is delivered to (#1042), edited in
 * place beside the address they sign in with -- the one place the distinction
 * between the two is legible without explaining it.
 *
 * Read-only without people:manage, which is the level the action writes under.
 * The person can always set it for themselves at /portal/account, so an admin
 * who cannot edit it here is not a dead end for them.
 */
function NotificationEmailRow({
  personId,
  signInEmail,
  value,
  canManage,
}: {
  personId: string;
  /** Shown as the fallback, since an empty override delivers there. */
  signInEmail: string | null;
  value: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start() {
    setDraft(value ?? "");
    setError(null);
    setIsEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      await runAction(
        () => updatePersonNotificationEmailAction(personId, draft),
        {
          success: draft.trim()
            ? `Notifications will go to ${draft.trim()}.`
            : "Notifications will go to the sign-in address.",
          onError: setError,
          onSuccess: () => {
            setIsEditing(false);
            router.refresh();
          },
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="app-muted">Notifications to:</span>
        {isEditing ? (
          <>
            <Input
              autoFocus
              type="email"
              value={draft}
              disabled={isPending}
              aria-label="Notification email"
              placeholder={signInEmail ?? "name@example.org"}
              className="h-8 w-56"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsEditing(false);
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={isPending}
              onClick={save}
            >
              <Check className="size-3.5" />
              <span className="sr-only">Save notification email</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={isPending}
              onClick={() => setIsEditing(false)}
            >
              <X className="size-3.5" />
              <span className="sr-only">Cancel</span>
            </Button>
          </>
        ) : (
          <>
            <span className={value ? undefined : "app-muted"}>
              {value ?? `${signInEmail ?? "—"} (sign-in address)`}
            </span>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={isPending}
                onClick={start}
              >
                <Pencil className="size-3.5" />
                <span className="sr-only">Edit notification email</span>
              </Button>
            )}
          </>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
