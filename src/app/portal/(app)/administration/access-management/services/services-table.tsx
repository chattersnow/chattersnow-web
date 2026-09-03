import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ServiceManageRow } from "@/lib/portal/access-management/types";
import { ServiceDetailsSheet } from "./service-details-sheet";
import { EmptyState } from "@/components/portal/empty-state";

export function ServicesTable({ services }: { services: ServiceManageRow[] }) {
  if (services.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No services yet"
            description="Add one with New service above before creating assets that belong to it."
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
              <TableHead>Name</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Assets</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell className="app-muted">
                  {service.website || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{service.assetCount}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ServiceDetailsSheet service={service} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
