"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRoleLabel } from "@/lib/format";
import {
  assignRoleAction,
  deactivateUserAction,
  reactivateUserAction,
  revokeRoleAction,
  updateUserPreferredNameAction,
  type PortalUser,
  type PortalRoleOption,
} from "./actions";
import { portalUserDisplayName } from "./users-shared";
import { PreferredNameCell } from "./preferred-name-cell";
import { Spinner } from "@/components/ui/spinner";

function statusBadge(portalUser: PortalUser) {
  if (portalUser.deactivated_at) {
    return <Badge variant="destructive">Deactivated</Badge>;
  }
  return <Badge variant="secondary">Active</Badge>;
}

export function UsersTable({
  users,
  currentUserId,
  availableRoles,
}: {
  users: PortalUser[];
  currentUserId: string | null;
  availableRoles: PortalRoleOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");
  const [deactivateTarget, setDeactivateTarget] = useState<PortalUser | null>(
    null,
  );
  // Revoking a live role takes effect on the target's next request, so it
  // gets the same confirmation step deactivation and pending-grant revocation
  // already had -- it was the only one of the three that acted on one click.
  const [revokeTarget, setRevokeTarget] = useState<{
    user: PortalUser;
    role: string;
  } | null>(null);

  function runAction(promise: Promise<{ error: string } | { success: true }>) {
    setError(null);
    startTransition(async () => {
      const result = await promise;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAddingFor(null);
      setPendingRole("");
      router.refresh();
    });
  }

  function handleRevokeRole() {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    runAction(revokeRoleAction(target.user.user_id, target.role));
  }

  function handleDeactivate() {
    if (!deactivateTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await deactivateUserAction(deactivateTarget.user_id);
      if ("error" in result) {
        setDeactivateTarget(null);
        setError(result.error);
        return;
      }
      setDeactivateTarget(null);
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="app-muted px-4 py-6 text-sm">
          No users found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Preferred name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Add role</span>
                </TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Deactivate</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((portalUser) => {
                const assignableRoles = availableRoles.filter(
                  (role) => !portalUser.roles.includes(role.name),
                );
                const isSelf = portalUser.user_id === currentUserId;
                const isDeactivated = portalUser.deactivated_at !== null;

                return (
                  <TableRow key={portalUser.user_id}>
                    <TableCell
                      className="max-w-xs truncate font-medium"
                      title={portalUserDisplayName(portalUser)}
                    >
                      {portalUserDisplayName(portalUser)}
                    </TableCell>
                    <TableCell>
                      <PreferredNameCell
                        value={portalUser.preferred_name}
                        label={portalUserDisplayName(portalUser)}
                        disabled={isPending}
                        onSave={(preferredName) =>
                          runAction(
                            updateUserPreferredNameAction(
                              portalUser.user_id,
                              preferredName,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {portalUser.roles.length === 0 ? (
                          <span className="app-muted text-sm">No access</span>
                        ) : (
                          portalUser.roles.map((role) => {
                            const lockedSelfAdmin = isSelf && role === "admin";
                            return (
                              <Badge
                                key={role}
                                variant="secondary"
                                className="gap-1 pr-1"
                              >
                                {formatRoleLabel(role)}
                                <button
                                  type="button"
                                  disabled={isPending || lockedSelfAdmin}
                                  title={
                                    lockedSelfAdmin
                                      ? "You can't remove your own admin role."
                                      : undefined
                                  }
                                  onClick={() =>
                                    setRevokeTarget({
                                      user: portalUser,
                                      role,
                                    })
                                  }
                                  className="-mr-1 flex size-6 items-center justify-center rounded-full hover:bg-black/10 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/10"
                                >
                                  <X className="size-3.5" />
                                  <span className="sr-only">
                                    Remove {formatRoleLabel(role)}
                                  </span>
                                </button>
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(portalUser)}</TableCell>
                    <TableCell>
                      {addingFor === portalUser.user_id ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={pendingRole}
                            onValueChange={(value) =>
                              setPendingRole(value ?? "")
                            }
                          >
                            <SelectTrigger
                              className="h-8 w-40"
                              aria-label="Add role"
                            >
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoles.map((role) => (
                                <SelectItem key={role.id} value={role.name}>
                                  {formatRoleLabel(role.name)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!pendingRole || isPending}
                            onClick={() =>
                              runAction(
                                assignRoleAction(
                                  portalUser.user_id,
                                  pendingRole,
                                ),
                              )
                            }
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => {
                              setAddingFor(null);
                              setPendingRole("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={assignableRoles.length === 0}
                          onClick={() => {
                            setAddingFor(portalUser.user_id);
                            setPendingRole("");
                          }}
                        >
                          Add role
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {isDeactivated ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() =>
                            runAction(reactivateUserAction(portalUser.user_id))
                          }
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={isPending || isSelf}
                          title={
                            isSelf
                              ? "You can't deactivate your own account."
                              : undefined
                          }
                          onClick={() => setDeactivateTarget(portalUser)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => !next && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget
                ? `Remove the ${formatRoleLabel(revokeTarget.role)} role?`
                : "Remove role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  {portalUserDisplayName(revokeTarget.user)} loses everything
                  that role grants, from their next request onward.
                  {revokeTarget.user.roles.length === 1
                    ? " It's their only role, so they'll have no portal access at all."
                    : " Their other roles are unaffected."}{" "}
                  You can assign it again afterwards.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevokeRole}
              disabled={isPending}
            >
              Remove role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(next) => !next && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget && (
                <>
                  {portalUserDisplayName(deactivateTarget)} will lose all portal
                  access until reactivated. Their roles stay assigned and will
                  apply again immediately on reactivation.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeactivate}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deactivating...
                </>
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
