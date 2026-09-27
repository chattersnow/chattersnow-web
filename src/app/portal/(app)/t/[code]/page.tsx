import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { lookupInventoryTag, TAG_PATH_PREFIX } from "@/lib/inventory-tags";
import {
  distributionDraftHref,
  draftListName,
  getCurrentDistributionDraft,
  getItemHolders,
  scanWarning,
} from "@/lib/inventory-distribution-draft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addTagToCurrentDistributionAction } from "./actions";
import { AssignFreeCode } from "./assign-free-code";

/** What a URL can carry: a random code, or a reusable numbered one (#1444). */
const TAG_URL_KINDS = ["asset_tag", "numbered"] as const;

function receiveHref(code: string): string {
  return `/portal/inventory/donations?receive=${encodeURIComponent(code)}`;
}

/**
 * A reusable numbered code that is on no item now (#1444): its item was
 * distributed, retired or lost, or it has never been used. The tag is put on
 * the next item from here, with no rewrite -- either an item already in
 * stock, or one arriving as a donation.
 */
function FreeNumberedCode({
  code,
  canAssign,
  canReceive,
}: {
  code: string;
  canAssign: boolean;
  canReceive: boolean;
}) {
  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Tag {code}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4">
          <p>
            This code is free: it is on no item now. Stick the tag on the next
            item and assign the code to it.
          </p>
          {canAssign && <AssignFreeCode code={code} />}
          {canReceive && (
            <Button
              className="self-start"
              variant={canAssign ? "secondary" : "default"}
              nativeButton={false}
              render={<Link href={receiveHref(code)} />}
            >
              Receive a donation with this tag
            </Button>
          )}
          {!canAssign && !canReceive && (
            <p className="app-muted text-sm">
              Someone who can manage inventory can assign it.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export const metadata: Metadata = { title: "Scanned tag" };

function BlankTag({ code }: { code: string }) {
  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Label {code}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <Card className="mt-6 max-w-xl">
        <CardContent className="flex flex-col gap-4">
          <p>
            This label is not on an item yet. Receive the donation it is stuck
            to, and the item takes this code.
          </p>
          <Button
            className="self-start"
            nativeButton={false}
            render={<Link href={receiveHref(code)} />}
          >
            Receive a donation with this label
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

/**
 * The URL an asset-tag label carries (#1420), or a reusable numbered code's
 * (#1444): a QR code scanned with a phone's
 * own camera, or an NFC tag tapped on an iPhone, lands here in the browser
 * where the portal session already is.
 *
 * The tenant is the request host's, through current_tenant_id() in RLS, so a
 * label only ever resolves on its own organization's portal. An unknown code,
 * one the reader lacks `inventory:view` for, and a pre-printed blank not yet
 * bound to an item are all the same not-found: the page never says whether a
 * code exists. A free numbered code is the exception, for a reader who can
 * see the inventory: its tag is meant to be tapped between items, and the
 * page offers to put it on the next one.
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
    kinds: [...TAG_URL_KINDS],
  });
  if (error) throw new Error("Could not look up that tag.");

  const found = matches[0]?.item;
  if (!found && matches[0]?.kind === "numbered") {
    const permissions = await getCurrentUserPermissions(supabase);
    return (
      <FreeNumberedCode
        code={matches[0].value}
        canAssign={hasPermission(permissions, "inventory", "manage")}
        canReceive={
          hasPermission(permissions, "finance", "manage") ||
          hasPermission(permissions, "inventory_intake", "manage")
        }
      />
    );
  }
  if (!found) {
    // A pre-printed blank (#1420 part 4) is offered to whoever may receive a
    // donation with it -- and to nobody else, who gets the same not-found as
    // an unknown code. The lookup above cannot see it for an intake volunteer,
    // who reads no tags under RLS, so the intake function answers instead; it
    // refuses a caller without the grant, which lands here as not-found too.
    const { data: scan } = await supabase.rpc("inventory_intake_scan", {
      p_asset_tag: code,
      p_barcode: "",
    });
    const status = (Array.isArray(scan) ? scan[0] : scan)?.asset_tag_status;
    if (status !== "blank") notFound();
    return <BlankTag code={code.toUpperCase()} />;
  }

  const itemHref = `/portal/inventory/items/${found.id}`;
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
  const heldBy =
    item.status === "reserved"
      ? ((await getItemHolders(supabase, [found.id])).get(found.id) ?? null)
      : null;
  const warning = onList
    ? null
    : scanWarning(
        { status: item.status, intendedUse: item.intended_use, heldBy },
        draft.recipient?.id,
      );
  // Names the recipient once the list has one (#1443), so a tap in a new tab
  // says whose handout it is adding to.
  const listName = draftListName(draft);
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
