"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/auth/permissions";
import { formatRoleLabel } from "@/lib/format";
import { updateRolePermissionAction } from "./actions";

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
