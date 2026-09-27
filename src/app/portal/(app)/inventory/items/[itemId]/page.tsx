import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { detailTitle } from "@/lib/portal/detail-title";
import { toInventoryCategories } from "@/lib/inventory";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import {
  getCurrentDistributionDraft,
  scanWarning,
} from "@/lib/inventory-distribution-draft";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { withTagsAndHolds } from "../item-extras";
import { getMyActiveEvents } from "../../../home/queries";
import type { ItemDistribute } from "./item-actions";
import { ItemDetailView } from "./item-detail-view";
import { toHistoryEntries, type ItemHistoryRow } from "./item-history";

/**
 * What Distribute (#1443) needs: the distribution already in progress, which
 * the item joins rather than starting another, and the events a new one can
 * be at -- today's, the first of them the default.
 */
async function getItemDistribute(
  supabase: SupabaseClient<Database>,
  itemId: string,
  canManageEvents: boolean,
): Promise<ItemDistribute> {
  const [draft, personId] = await Promise.all([
    getCurrentDistributionDraft(supabase),
    resolveCurrentPersonId(supabase),
  ]);
  const activeEvents =
    personId || canManageEvents
      ? await getMyActiveEvents(
          supabase,
          personId,
          new Date().toISOString(),
          canManageEvents,
        )
      : [];
  const eventOptions = activeEvents.map(({ id, name }) => ({ id, name }));
  // A list in progress at an event that is no longer today's stays choosable.
  if (
    draft?.eventId &&
    draft.eventName &&
    !eventOptions.some((option) => option.id === draft.eventId)
  ) {
    eventOptions.unshift({ id: draft.eventId, name: draft.eventName });
  }

  const current =
    draft && draft.items.length > 0
      ? {
          eventId: draft.eventId,
          itemCount: draft.items.length,
          recipientName: draft.recipient?.name ?? null,
          includesItem: draft.items.some((listed) => listed.id === itemId),
        }
      : null;

  return {
    current,
    defaultEventId: eventOptions[0]?.id ?? null,
    eventOptions,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}): Promise<Metadata> {
  const { itemId } = await params;
  return {
    title: await detailTitle({
      table: "inventory_items",
      column: "description",
      id: itemId,
      fallback: "Inventory item",
    }),
  };
}

/**
 * An inventory item's own page (#1441), and where a scanned tag lands: the
 * /portal/t/<code> resolver redirects here, so an NFC tag tapped on an iPhone
 * opens a page that can be bookmarked and has a way back, rather than a
 * filtered list with a sheet on top.
 */
export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  // Anything but a uuid would fail Postgres's cast rather than find nothing.
  if (!UUID_PATTERN.test(itemId)) notFound();

  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  // The items layout already turns a reader without it away; this keeps the
  // page from rendering alongside it for one.
  if (!hasPermission(permissions, "inventory", "view")) notFound();
  const canManage = hasPermission(permissions, "inventory", "manage");

  const [{ data: item, error }, { data: categoryRows }, { data: historyRows }] =
    await Promise.all([
      supabase
        .from("inventory_items_with_category")
        .select(
          "id, description, type, size, gender, condition, face_value, status, intended_use, photo_url, notes, category_id, category_key, category_label, category_group_label",
        )
        .eq("id", itemId)
        .maybeSingle()
        // A view drops `not null`, so the generator reports these nullable
        // (#813 Phase 1). All five are `not null` on `inventory_items`.
        .overrideTypes<
          {
            id: string;
            description: string;
            condition: string;
            status: string;
            intended_use: string;
          },
          { merge: true }
        >(),
      supabase
        .from("inventory_categories")
        .select(
          "id, key, label, is_active, sort_order, inventory_category_groups(key, label, sort_order)",
        ),
      // One read under the reader's own RLS (#1442). A failure leaves the
      // History card empty rather than taking the item page down with it.
      supabase
        .rpc("inventory_item_history", { p_item_id: itemId })
        .overrideTypes<ItemHistoryRow[], { merge: false }>(),
    ]);

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this item. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!item) notFound();

  const [withExtras] = await withTagsAndHolds(supabase, [item]);
  const categories = toInventoryCategories(categoryRows).filter(
    (category) => category.isActive,
  );
  // Offered while the item can go out: in stock, or held -- whether for this
  // recipient is for the list to say once one is picked.
  const distribute =
    canManage &&
    !scanWarning({ status: item.status, intendedUse: item.intended_use })
      ? await getItemDistribute(
          supabase,
          item.id,
          hasPermission(permissions, "events", "manage"),
        )
      : null;

  return (
    <>
      <PortalBreadcrumbs current={withExtras.description} />
      <ItemDetailView
        item={withExtras}
        categories={categories}
        canManage={canManage}
        history={toHistoryEntries(historyRows)}
        distribute={distribute}
      />
    </>
  );
}
