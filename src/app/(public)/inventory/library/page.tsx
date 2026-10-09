import { permanentRedirect } from "next/navigation";
import { GEAR_ITEM_PARAM } from "../gear-item-path";

/**
 * The catalog's old address. It moved up to `/inventory` when it stopped
 * calling itself a library -- the items are given away to keep, not lent.
 *
 * A page rather than a `next.config.ts` redirect: those run on every host
 * before the proxy, and `inventory` is a portal segment too, so a config rule
 * here would also answer the portal's bare paths on a `portal.` host
 * (`src/next-config-redirects.test.ts`, #1145). A shared item link keeps its
 * `?item=` through the hop.
 */
export default async function InventoryLibraryRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = (await searchParams)[GEAR_ITEM_PARAM];
  permanentRedirect(
    typeof item === "string"
      ? `/inventory?${GEAR_ITEM_PARAM}=${encodeURIComponent(item)}`
      : "/inventory",
  );
}
