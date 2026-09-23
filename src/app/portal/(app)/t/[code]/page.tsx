import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupInventoryTag, TAG_PATH_PREFIX } from "@/lib/inventory-tags";

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
 */
export default async function InventoryTagPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
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

  const item = matches[0]?.item;
  if (!item) notFound();

  redirect(`/portal/inventory/items?item=${encodeURIComponent(item.id)}`);
}
