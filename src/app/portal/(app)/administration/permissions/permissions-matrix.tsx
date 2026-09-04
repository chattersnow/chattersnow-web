"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  PERMISSION_LEVELS,
  type PermissionLevel,
} from "@/lib/auth/permissions";
import { formatRoleLabel } from "@/lib/format";
import { updateRolePermissionsAction } from "./actions";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

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

type ChangedCell = {
  roleId: string;
  resourceId: string;
  roleName: string;
  resourceLabel: string;
  from: PermissionLevel;
  to: PermissionLevel;
};

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

function toPermissionLevel(value: string | undefined): PermissionLevel {
  return (value as PermissionLevel | undefined) ?? "none";
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
  const [isSaving, startSaveTransition] = useTransition();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    roles[0]?.id ?? null,
  );
  const [pendingEdits, setPendingEdits] = useState<
    Map<string, PermissionLevel>
  >(new Map());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(resources.map((resource) => resource.section)),
  );

  const levelByCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const rp of rolePermissions) {
      map.set(`${rp.role_id}:${rp.resource_id}`, rp.level);
    }
    return map;
  }, [rolePermissions]);

  const roleById = useMemo(
    () => new Map(roles.map((role) => [role.id, role])),
    [roles],
  );
  const resourceById = useMemo(
    () => new Map(resources.map((res) => [res.id, res])),
    [resources],
  );

  const sections = useMemo(() => groupBySection(resources), [resources]);

  const changedCells = useMemo(() => {
    const rows: ChangedCell[] = [];
    for (const [cellKey, to] of pendingEdits) {
      const from = toPermissionLevel(levelByCell.get(cellKey));
      if (from === to) continue;
      const [roleId, resourceId] = cellKey.split(":");
      const role = roleById.get(roleId);
      const resource = resourceById.get(resourceId);
      if (!role || !resource) continue;
      rows.push({
        roleId,
        resourceId,
        roleName: role.name,
        resourceLabel: resource.label,
        from,
        to,
      });
    }
    return rows;
  }, [pendingEdits, levelByCell, roleById, resourceById]);

  function handleLevelChange(
    roleId: string,
    resourceId: string,
    level: PermissionLevel,
  ) {
    const cellKey = `${roleId}:${resourceId}`;
    setPendingEdits((prev) => new Map(prev).set(cellKey, level));
  }

  function toggleSection(section: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  const allCollapsed = sections.every(([section]) =>
    collapsedSections.has(section),
  );

  function toggleAllSections() {
    setCollapsedSections(
      allCollapsed ? new Set() : new Set(sections.map(([section]) => section)),
    );
  }

  function handleDiscard() {
    setPendingEdits(new Map());
    setError(null);
  }

  function handleConfirmSave() {
    setError(null);
    const count = changedCells.length;
    startSaveTransition(async () => {
      await runAction(
        () =>
          updateRolePermissionsAction(
            changedCells.map((c) => ({
              role_id: c.roleId,
              resource_id: c.resourceId,
              level: c.to,
            })),
          ),
        {
          success: `${count} permission change${count === 1 ? "" : "s"} saved.`,
          onError: setError,
          onSuccess: () => {
            setPendingEdits(new Map());
            setSaveDialogOpen(false);
            router.refresh();
          },
        },
      );
    });
  }

  const selectedRole = selectedRoleId ? roleById.get(selectedRoleId) : null;

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

      <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedRoleId ?? undefined}
            onValueChange={(value) => value && setSelectedRoleId(value)}
          >
            <SelectTrigger className="w-56" aria-label="Role">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {formatRoleLabel(role.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={toggleAllSections}
          >
            {allCollapsed ? (
              <>
                <ChevronsUpDown /> Expand all
              </>
            ) : (
              <>
                <ChevronsDownUp /> Collapse all
              </>
            )}
          </Button>
          {changedCells.length > 0 && (
            <p className="app-muted text-sm">
              {changedCells.length} unsaved change
              {changedCells.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={changedCells.length === 0 || isSaving}
            onClick={handleDiscard}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={changedCells.length === 0 || isSaving}
            onClick={() => setSaveDialogOpen(true)}
          >
            Save changes
          </Button>
        </div>
      </div>

      {selectedRole && (
        <Card>
          {selectedRole.description && (
            <CardContent className="app-muted border-b pb-4 text-sm">
              {selectedRole.description}
            </CardContent>
          )}
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead className="w-40">Permission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map(([section, sectionResources]) => {
                  const collapsed = collapsedSections.has(section);
                  return (
                    <Fragment key={section}>
                      <TableRow className="bg-[var(--muted)]/40 hover:bg-[var(--muted)]/40">
                        <TableCell colSpan={2}>
                          <button
                            type="button"
                            onClick={() => toggleSection(section)}
                            aria-expanded={!collapsed}
                            className="flex items-center gap-1.5 app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                          >
                            {collapsed ? (
                              <ChevronRight className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                            {section}
                          </button>
                        </TableCell>
                      </TableRow>
                      {!collapsed &&
                        sectionResources.map((resource) => {
                          const cellKey = `${selectedRole.id}:${resource.id}`;
                          const level =
                            pendingEdits.get(cellKey) ??
                            toPermissionLevel(levelByCell.get(cellKey));
                          return (
                            <TableRow key={resource.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {resource.label}
                                </div>
                                {resource.description && (
                                  <div className="app-muted text-xs">
                                    {resource.description}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={level}
                                  onValueChange={(value) =>
                                    value &&
                                    handleLevelChange(
                                      selectedRole.id,
                                      resource.id,
                                      value as PermissionLevel,
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    className="h-8 w-28"
                                    disabled={isSaving}
                                    aria-label={`Permission for ${formatRoleLabel(selectedRole.name)} on ${resource.label}`}
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
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save permission changes</DialogTitle>
            <DialogDescription>
              Review the {changedCells.length} change
              {changedCells.length === 1 ? "" : "s"} below before applying them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {changedCells.map((c) => (
              <div
                key={`${c.roleId}:${c.resourceId}`}
                className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0"
              >
                <span>
                  {formatRoleLabel(c.roleName)} · {c.resourceLabel}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="secondary">{LEVEL_LABELS[c.from]}</Badge>
                  &rarr;
                  <Badge>{LEVEL_LABELS[c.to]}</Badge>
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSaveDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Confirm & save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
