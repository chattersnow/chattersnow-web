"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusBadge } from "@/components/portal/status-badge";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { formatCurrency } from "@/lib/format";
import { ProductDetailsSheet } from "./product-details-sheet";
import { sortedVariants, totalStock, type ProductRow } from "./products-shared";

const FILTER_ALL = "all";
type ActiveFilter = "active" | "inactive";

/**
 * The variants under a product row, as a sub-list rather than their own rows.
 *
 * A tee in three sizes at one price is one thing to a person reading the
 * catalog, and giving each size a row of its own would treble the table and
 * repeat the product name three times. Everything that differs by size —
 * price, stock, whether it is still offered — is here.
 */
function VariantList({ product }: { product: ProductRow }) {
  const variants = sortedVariants(product);

  if (variants.length === 0) {
    return (
      <span className="app-muted text-sm">No variants — not yet sellable.</span>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {variants.map((variant) => (
        <li key={variant.id} className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{variant.label}</span>
          <span>{formatCurrency(variant.price)}</span>
          <span className="app-muted">{variant.stock_on_hand} in stock</span>
          {!variant.is_active && (
            <StatusBadge tone="neutral">Inactive</StatusBadge>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProductsTable({
  products,
  canManage,
  action,
}: {
  products: ProductRow[];
  canManage: boolean;
  action?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      if (activeFilter === "active" && !product.is_active) return false;
      if (activeFilter === "inactive" && product.is_active) return false;
      if (!query) return true;
      // Searches what a person would type: the product's name, and the SKU or
      // size they are holding in their hand.
      return (
        product.name.toLowerCase().includes(query) ||
        product.product_variants.some(
          (variant) =>
            variant.label.toLowerCase().includes(query) ||
            (variant.sku ?? "").toLowerCase().includes(query),
        )
      );
    });
  }, [products, search, activeFilter]);

  const columns = useMemo<PortalDataTableColumn<ProductRow>[]>(
    () => [
      {
        key: "name",
        label: "Product",
        sortValue: (row) => row.name,
        render: (row) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.name}</div>
            {row.description && (
              <div className="app-muted text-xs">{row.description}</div>
            )}
          </div>
        ),
      },
      {
        key: "variants",
        label: "Variants",
        render: (row) => <VariantList product={row} />,
      },
      {
        key: "stock",
        label: "Stock",
        sortValue: (row) => totalStock(row),
        render: (row) => totalStock(row),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (row) => (row.is_active ? "Active" : "Inactive"),
        render: (row) => (
          <StatusBadge tone={row.is_active ? "info" : "neutral"}>
            {row.is_active ? "Active" : "Inactive"}
          </StatusBadge>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (row) => (
          <ProductDetailsSheet product={row} canManage={canManage} />
        ),
      },
    ],
    [canManage],
  );

  const activeFilterCount = [
    search.trim() !== "",
    activeFilter !== null,
  ].filter(Boolean).length;

  if (products.length === 0) {
    return (
      <div className="space-y-4">
        {action && (
          <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
            {action}
          </div>
        )}
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No products yet"
              description={
                action
                  ? "Add the first one with New Product above — it needs a variant with a price before the register can sell it."
                  : "Products appear here once someone adds them."
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="products-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="products-search"
              placeholder="Search name, size or SKU..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={activeFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setActiveFilter(
                  value === FILTER_ALL ? null : (value as ActiveFilter),
                )
              }
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    value === "active"
                      ? "Active"
                      : value === "inactive"
                        ? "Inactive"
                        : "All products"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All products</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FiltersSheet>

        {action}
      </div>

      <PortalDataTable
        columns={columns}
        rows={visibleProducts}
        getRowKey={(row) => row.id}
        defaultSort={{ key: "name", dir: "asc" }}
        emptyMessage="No products match your filters."
      />
    </div>
  );
}
