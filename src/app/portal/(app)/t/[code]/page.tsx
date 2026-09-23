import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupInventoryTag, TAG_PATH_PREFIX } from "@/lib/inventory-tags";
import {
  distributionDraftHref,
  getCurrentDistributionDraft,
  scanWarning,
} from "@/lib/inventory-distribution-draft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addTagToCurrentDistributionAction } from "./actions";

export const metadata: Metadata = { title: "Scanned tag" };

/**
 * The URL an asset-tag label carries (#1420): a QR code scanned with a phone's
 * own camera, or an NFC tag tapped on an iPhone, lands here in the browser
 * where the portal session already is.
 *
 * The tenant is the request host's, through current_tenant_id() in RLS, so a
 * label only ever resolves on its own organization's portal. An unknown code,
 * one the reader lacks `inventory:view` for, and a pre-printed blank not yet
 * bound to an item are all the same not-found: the page never says whether a
 * code exists.
 *
 * Found, it redirects to the item -- unless the reader has a scanned
 * distribution in progress (#1420 part 3). An iPhone opens the tag in a new
 * tab that knows nothing of the list open in the first one, so this page
 * offers to add the item to that list instead. Nothing here renders before the
 * lookup has found the item under the reader's own RLS.
 */
export default async function InventoryTagPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The layout redirects a signed-out reader too, but a page renders alongside
  // its layout rather than after it, and a lookup with no session finds
  // nothing -- this keeps that from ever answering with a 404 instead of the
  // login screen.
  if (!user) {
    redirect(
      `/portal/login?next=${encodeURIComponent(`${TAG_PATH_PREFIX}${code}`)}`,
    );
  }

  const { matches, error } = await lookupInventoryTag(supabase, code, {
    kinds: ["asset_tag"],
  });
  if (error) throw new Error("Could not look up that tag.");

  const found = matches[0]?.item;
  if (!found) notFound();

  const itemHref = `/portal/inventory/items?item=${encodeURIComponent(found.id)}`;
  // RLS returns no draft to a reader who may not record a distribution.
  const draft = await getCurrentDistributionDraft(supabase);
  if (!draft) redirect(itemHref);

  const { data: item } = await supabase
    .from("inventory_items")
    .select("description, size, status, intended_use")
    .eq("id", found.id)
    .maybeSingle();
  if (!item) redirect(itemHref);

  const added = typeof query.added === "string" ? query.added : null;
  const onList = draft.items.some((listed) => listed.id === found.id);
  const warning = onList
    ? null
    : scanWarning({ status: item.status, intendedUse: item.intended_use });
  const listName = draft.eventName
    ? `the ${draft.eventName} distribution`
    : "your distribution";
  const itemName = item.size
    ? `${item.description} (${item.size})`
    : item.description;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {itemName}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4">
          {added === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>
                Could not add this item to {listName}. Open the list and scan it
                there.
              </AlertDescription>
            </Alert>
          ) : onList ? (
            <p role="status">
              {added === "1" ? "Added to " : "Already on "}
              {listName}. {draft.items.length}{" "}
              {draft.items.length === 1 ? "item is" : "items are"} on the list.
            </p>
          ) : warning ? (
            <Alert variant="destructive">
              <AlertDescription>
                {warning} It can&rsquo;t be added to {listName}.
              </AlertDescription>
            </Alert>
          ) : (
            <p>
              You have {listName} in progress, with {draft.items.length}{" "}
              {draft.items.length === 1 ? "item" : "items"} scanned.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!onList && !warning && added !== "error" && (
              <form action={addTagToCurrentDistributionAction}>
                <input type="hidden" name="code" value={code} />
                <Button type="submit">Add to {listName}</Button>
              </form>
            )}
            <Button
              variant={onList ? "default" : "secondary"}
              nativeButton={false}
              render={<Link href={distributionDraftHref(draft.eventId)} />}
            >
              Go to the distribution
            </Button>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={itemHref} />}
            >
              Open item
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
