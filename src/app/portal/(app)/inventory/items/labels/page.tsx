import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getRequestOrigin } from "@/lib/request-origin";
import { tagUrl } from "@/lib/inventory-tags";
import { parseLabelOptions } from "@/lib/inventory-labels";
import { code128DataUri, qrCodeDataUri } from "@/lib/inventory-label-codes";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { EmptyState } from "@/components/portal/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LabelSheets, type PrintableLabel } from "./label-sheets";
import { CreateCodesButton, LabelToolbar } from "./label-toolbar";

export const metadata: Metadata = { title: "Print labels" };

/**
 * Asset-tag labels for a set of items (#1420 part 2): a QR of each item's tag
 * URL, its name and its code, laid out for a sheet of labels or a label
 * printer, and printed through the browser's own dialog -- the same approach
 * as sale receipts and the agenda export, scoped by `.print-area`.
 *
 * Under `inventory/items/layout.tsx`, so the gate is `inventory:view`: printing
 * a label that already exists is reading the item. Giving an item its first
 * code is a write, and is offered only with `inventory:manage`. Nothing is
 * created by opening this page.
 *
 * The item list is in the URL (`?items=<id>,<id>`), so it is reached from the
 * items table's selection or an item's sheet and never needs a navigation
 * entry of its own; the breadcrumb leads back to Items.
 */
export default async function InventoryLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const options = parseLabelOptions({
    items: raw("items"),
    layout: raw("layout"),
    skip: raw("skip"),
    barcode: raw("barcode"),
  });

  const supabase = await createSupabaseServerClient();
  const [permissions, origin, itemsResult, tagsResult] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getRequestOrigin(),
    options.itemIds.length > 0
      ? supabase
          .from("inventory_items")
          .select("id, description, size")
          .in("id", options.itemIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            description: string;
            size: string | null;
          }[],
        }),
    options.itemIds.length > 0
      ? supabase
          .from("inventory_item_tags")
          .select("item_id, value")
          .eq("kind", "asset_tag")
          .in("item_id", options.itemIds)
      : Promise.resolve({
          data: [] as { item_id: string | null; value: string }[],
        }),
  ]);
  const canManage = hasPermission(permissions, "inventory", "manage");

  // In the order they were chosen, which is the order they were on screen.
  const itemById = new Map(
    (itemsResult.data ?? []).map((item) => [item.id, item]),
  );
  const items = options.itemIds.flatMap((id) => itemById.get(id) ?? []);
  const codeByItemId = new Map(
    (tagsResult.data ?? []).map((tag) => [tag.item_id, tag.value]),
  );

  const labels: PrintableLabel[] = [];
  const uncoded: string[] = [];
  for (const item of items) {
    const code = codeByItemId.get(item.id);
    if (!code) {
      uncoded.push(item.id);
      continue;
    }
    labels.push({
      itemId: item.id,
      code,
      description: item.description,
      size: item.size,
      qrSrc: qrCodeDataUri(tagUrl(origin, code)),
      barcodeSrc: options.barcode ? code128DataUri(code) : null,
    });
  }

  return (
    <>
      <div className="print:hidden">
        <PortalBreadcrumbs current="Print labels" />
        <div className="mt-4 w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            Print labels
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            <EmptyState
              title="No items to label"
              description="Select items in the list, or open an item, and choose Print labels."
              action={
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/portal/inventory/items" />}
                >
                  Go to items
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <LabelToolbar
            layout={options.layout.key}
            skip={options.skip}
            barcode={options.barcode}
            printable={labels.length > 0}
          />

          {uncoded.length > 0 && (
            <Alert className="print:hidden">
              <AlertTitle>
                {uncoded.length === 1
                  ? "1 item has no code yet"
                  : `${uncoded.length} items have no code yet`}
              </AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                {canManage ? (
                  <>
                    <span>
                      Each item needs a code before its label can print. A code
                      is permanent: reprinting a label later prints the same
                      one.
                    </span>
                    <CreateCodesButton itemIds={uncoded} />
                  </>
                ) : (
                  <span>
                    Someone who can manage inventory has to create their codes
                    before these labels can print.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {labels.length > 0 && (
            <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
              <LabelSheets
                labels={labels}
                layout={options.layout}
                skip={options.skip}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
