"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRoleLabel } from "@/lib/format";
import { assignRoleAction, revokeRoleAction, type PortalUser, type PortalRoleOption } from "./actions";

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

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="app-muted px-4 py-6 text-sm">No users found.</CardContent>
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
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Add role</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((portalUser) => {
                const assignableRoles = availableRoles.filter(
                  (role) => !portalUser.roles.includes(role.name),
                );
                const isSelf = portalUser.user_id === currentUserId;

                return (
                  <TableRow key={portalUser.user_id}>
                    <TableCell className="font-medium">{portalUser.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {portalUser.roles.length === 0 ? (
                          <span className="app-muted text-sm">No access</span>
                        ) : (
                          portalUser.roles.map((role) => {
                            const lockedSelfAdmin = isSelf && role === "admin";
                            return (
                              <Badge key={role} variant="secondary" className="gap-1 pr-1">
                                {formatRoleLabel(role)}
                                <button
                                  type="button"
                                  disabled={isPending || lockedSelfAdmin}
                                  title={lockedSelfAdmin ? "You can't remove your own admin role." : undefined}
                                  onClick={() =>
                                    runAction(revokeRoleAction(portalUser.user_id, role))
                                  }
                                  className="rounded-full p-0.5 hover:bg-black/10 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/10"
                                >
                                  <X className="size-3" />
                                  <span className="sr-only">Remove {formatRoleLabel(role)}</span>
                                </button>
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {addingFor === portalUser.user_id ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={pendingRole}
                            onValueChange={(value) => setPendingRole(value ?? "")}
                          >
                            <SelectTrigger className="h-8 w-40">
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
                              runAction(assignRoleAction(portalUser.user_id, pendingRole))
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
                          variant="outline"
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
