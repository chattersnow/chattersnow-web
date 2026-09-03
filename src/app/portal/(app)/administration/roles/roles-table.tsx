import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRoleLabel } from "@/lib/format";
import { RoleDetailsDialog, type RoleRow } from "./role-details-dialog";
import { EmptyState } from "@/components/portal/empty-state";

export function RolesTable({ roles }: { roles: RoleRow[] }) {
  if (roles.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No roles found"
            description="Add the first one with New role above."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={formatRoleLabel(role.name)}
                >
                  {formatRoleLabel(role.name)}
                </TableCell>
                <TableCell className="app-muted max-w-sm truncate">
                  {role.description || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <RoleDetailsDialog role={role} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
