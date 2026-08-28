"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  createInviteLinkAction,
  createPendingGrantAction,
  revokePendingGrantAction,
  type PendingGrant,
  type PortalRoleOption,
} from "./actions";

function statusBadge(grant: PendingGrant) {
  if (
    grant.status === "pending" &&
    grant.expires_at &&
    new Date(grant.expires_at) <= new Date()
  ) {
    return <Badge variant="outline">Expired</Badge>;
  }
  if (grant.status === "pending") {
    return <Badge variant="secondary">Pending</Badge>;
  }
  if (grant.status === "claimed") {
    return <Badge variant="default">Claimed</Badge>;
  }
  return <Badge variant="outline">Revoked</Badge>;
}

export function PendingAccessSection({
  grants,
  availableRoles,
}: {
  grants: PendingGrant[];
  availableRoles: PortalRoleOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<PendingGrant | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    grant: PendingGrant;
    link: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPendingGrantAction(email, role, name);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEmail("");
      setName("");
      setRole("");
      router.refresh();
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await revokePendingGrantAction(revokeTarget.id);
      if ("error" in result) {
        setRevokeTarget(null);
        setError(result.error);
        return;
      }
      setRevokeTarget(null);
      router.refresh();
    });
  }

  function handleInvite(grant: PendingGrant) {
    setError(null);
    startTransition(async () => {
      const result = await createInviteLinkAction(grant.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInviteResult({ grant, link: result.link });
      router.refresh();
    });
  }

  async function handleCopyLink() {
    if (!inviteResult) return;
    await navigator.clipboard.writeText(inviteResult.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pending access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex-1 min-w-48">
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex-1 min-w-40">
              <Input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Select
              value={role}
              onValueChange={(value) => setRole(value ?? "")}
            >
              <SelectTrigger className="h-9 w-40" aria-label="Grant role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {formatRoleLabel(option.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              disabled={!email.trim() || !role || isPending}
            >
              Stage access
            </Button>
          </form>

          {grants.length === 0 ? (
            <p className="app-muted text-sm">No pending access staged.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Revoke</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell
                      className="max-w-xs truncate font-medium"
                      title={grant.name ?? grant.email}
                    >
                      {grant.name ?? grant.email}
                    </TableCell>
                    <TableCell>{formatRoleLabel(grant.roles.name)}</TableCell>
                    <TableCell>{statusBadge(grant)}</TableCell>
                    <TableCell>
                      {grant.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleInvite(grant)}
                          >
                            {grant.invited_at ? "Resend link" : "Invite"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => setRevokeTarget(grant)}
                          >
                            Revoke
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => !next && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke pending access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  {revokeTarget.name ?? revokeTarget.email} will no longer
                  receive the {formatRoleLabel(revokeTarget.roles.name)} role
                  when they sign in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevoke}
              disabled={isPending}
            >
              {isPending ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={inviteResult !== null}
        onOpenChange={(next) => {
          if (!next) {
            setInviteResult(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Invite link for{" "}
              {inviteResult?.grant.name ?? inviteResult?.grant.email}
            </DialogTitle>
            <DialogDescription>
              No email is sent automatically — copy this link and share it with
              them directly. It expires in about an hour.
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={inviteResult?.link ?? ""} />
          <DialogFooter>
            <Button type="button" onClick={handleCopyLink}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
