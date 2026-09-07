"use client";

import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ServiceManageRow } from "@/lib/portal/access-management/types";
import { ServiceDetailsSheet } from "./service-details-sheet";
import { EmptyState } from "@/components/portal/empty-state";

export function ServicesTable({ services }: { services: ServiceManageRow[] }) {
  const columns = useMemo<PortalDataTableColumn<ServiceManageRow>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (service) => service.name,
        cellClassName: "font-medium",
        render: (service) => service.name,
      },
      {
        key: "website",
        label: "Website",
        sortValue: (service) => service.website,
        cellClassName: "app-muted",
        render: (service) => service.website || "—",
      },
      {
        key: "assetCount",
        label: "Assets",
        // Numeric, so 9 sorts below 10 rather than after it.
        sortValue: (service) => service.assetCount,
        render: (service) => (
          <Badge variant="outline">{service.assetCount}</Badge>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (service) => <ServiceDetailsSheet service={service} />,
      },
    ],
    [],
  );

  // Distinct from the table's own empty row: no service exists yet, which is
  // a different sentence and points at New service.
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
    <PortalDataTable
      columns={columns}
      rows={services}
      getRowKey={(service) => service.id}
      // Matches the query's own ordering.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No services to show."
    />
  );
}
