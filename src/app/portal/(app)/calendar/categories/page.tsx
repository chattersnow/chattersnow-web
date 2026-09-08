import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/portal/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewCalendarCategoryDialog } from "./new-calendar-category-dialog";
import {
  CalendarCategoryDetailsSheet,
  type CalendarCategoryRow,
} from "./calendar-category-details-sheet";

export const metadata: Metadata = {
  title: "Calendar Categories",
};

export default async function CalendarCategoriesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const [{ data: categoryRows, error }, { data: taggedRows }] =
    await Promise.all([
      supabase
        .from("calendar_categories")
        .select("id, key, label, sort_order, is_active")
        .order("sort_order", { ascending: true }),
      // How many items carry each category, so the sheet can say why a delete
      // will be refused before anyone tries it.
      supabase.from("calendar_item_categories").select("category"),
    ]);

  const itemCounts = new Map<string, number>();
  for (const row of (taggedRows ?? []) as { category: string }[]) {
    itemCounts.set(row.category, (itemCounts.get(row.category) ?? 0) + 1);
  }

  const categories = (categoryRows ?? []) as CalendarCategoryRow[];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Calendar categories
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        The vocabulary calendar items are tagged with, and the filter your
        visitors see on the public community calendar. These are yours to word:
        what you call your own events is your decision, not the platform&apos;s.
      </p>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Renaming a category changes the label everywhere without disturbing the
        items that carry it — the underlying key never changes. Deactivating one
        removes it from the pickers and the public filter while the items
        already tagged with it keep their label.
      </p>

      {canManage ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewCalendarCategoryDialog />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load calendar categories. Please try again.
            </p>
          ) : categories.length === 0 ? (
            <EmptyState
              title="No calendar categories"
              description="Add one to start tagging calendar items and to give the public calendar a filter."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      {category.label}
                    </TableCell>
                    <TableCell className="app-muted font-mono text-xs">
                      {category.key}
                    </TableCell>
                    <TableCell className="app-muted">
                      {itemCounts.get(category.key) ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={category.is_active ? "success" : "neutral"}
                      >
                        {category.is_active ? "Active" : "Retired"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <CalendarCategoryDetailsSheet
                        category={category}
                        itemCount={itemCounts.get(category.key) ?? 0}
                        canManage={canManage}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
