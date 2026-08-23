"use client";

import { Fragment, FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/auth/permissions";
import { updateRolePermissionAction } from "./actions";
import { createRoleAction } from "../users/actions";

type Role = { id: string; name: string; description: string | null };
type Resource = {
  id: string;
  key: string;
  section: string;
  label: string;
  description: string | null;
  sort_order: number;
};
type RolePermission = { role_id: string; resource_id: string; level: string };

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "None",
  view: "View",
  manage: "Manage",
};

function formatRoleLabel(name: string): string {
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function groupBySection(resources: Resource[]): [string, Resource[]][] {
  const sections = new Map<string, Resource[]>();
  for (const resource of resources) {
    const bucket = sections.get(resource.section) ?? [];
    bucket.push(resource);
    sections.set(resource.section, bucket);
  }
  return Array.from(sections.entries());
}

export function PermissionsMatrix({
  roles,
  resources,
  rolePermissions,
}: {
  roles: Role[];
  resources: Resource[];
  rolePermissions: RolePermission[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const levelByCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const rp of rolePermissions) {
      map.set(`${rp.role_id}:${rp.resource_id}`, rp.level);
    }
    return map;
  }, [rolePermissions]);

  const sections = useMemo(() => groupBySection(resources), [resources]);

  function handleLevelChange(roleId: string, resourceId: string, level: string) {
    setError(null);
    const cellKey = `${roleId}:${resourceId}`;
    setPendingCell(cellKey);
    startTransition(async () => {
      const result = await updateRolePermissionAction(roleId, resourceId, level);
      setPendingCell(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCreateRole(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRoleAction(newRoleName, newRoleDescription);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setNewRoleOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      router.refresh();
    });
  }

  if (roles.length === 0 || resources.length === 0) {
    return (
      <Card>
        <CardContent className="app-muted px-4 py-6 text-sm">
          No roles or resources found.
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

      <div className="flex justify-end">
        <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
            New role
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New role</DialogTitle>
              <DialogDescription>
                New roles start with no permissions on any resource. Grant access in the matrix
                below once it&apos;s created.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateRole}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="role-name">Name</FieldLabel>
                  <Input
                    id="role-name"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. program_manager"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="role-description">Description</FieldLabel>
                  <Textarea
                    id="role-description"
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    rows={2}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={isPending || !newRoleName.trim()}>
                  Create role
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id} className="min-w-36">
                    {formatRoleLabel(role.name)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map(([section, sectionResources]) => (
                <Fragment key={section}>
                  <TableRow className="bg-[var(--muted)]/40 hover:bg-[var(--muted)]/40">
                    <TableCell colSpan={roles.length + 1} className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {section}
                    </TableCell>
                  </TableRow>
                  {sectionResources.map((resource) => (
                    <TableRow key={resource.id}>
                      <TableCell>
                        <div className="font-medium">{resource.label}</div>
                        {resource.description && (
                          <div className="app-muted text-xs">{resource.description}</div>
                        )}
                      </TableCell>
                      {roles.map((role) => {
                        const cellKey = `${role.id}:${resource.id}`;
                        const level = levelByCell.get(cellKey) ?? "none";
                        return (
                          <TableCell key={role.id}>
                            <Select
                              value={level}
                              onValueChange={(value) => value && handleLevelChange(role.id, resource.id, value)}
                            >
                              <SelectTrigger
                                className="h-8 w-28"
                                disabled={isPending && pendingCell === cellKey}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PERMISSION_LEVELS.map((l) => (
                                  <SelectItem key={l} value={l}>
                                    {LEVEL_LABELS[l]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
