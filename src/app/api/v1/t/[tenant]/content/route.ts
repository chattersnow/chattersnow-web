import { publicRead, unwrap } from "@/lib/api/handler";
import { getPublicLexicon } from "@/lib/lexicon";
import { getSiteImageUrls } from "@/lib/site-images";
import {
  SITE_CONTENT_SLOTS,
  readSlot,
  resolveSiteContent,
} from "@/lib/site-content";

/**
 * Every copy slot the public site renders, resolved the way the site resolves
 * it: the tenant's row where it has one, the registry default where it has
 * not, with the tenant's own lexicon substituted into both (#896).
 *
 * **Registered slots only** (#888). `public_site_content` has no prefix filter
 * -- the table is the public site's copy -- so what decides which keys exist is
 * the registry in `src/lib/site-content.ts`. Serving the rows as they come
 * would publish anything a future migration happened to insert; iterating the
 * registry instead means a key nobody registered is simply not part of the
 * contract. This is why the OpenAPI document generates this object's shape
 * from the same registry.
 *
 * Images are served resolved (`getSiteImageUrls`), because the stored value can
 * be a Google Drive share link that a consumer would have to know how to
 * rewrite.
 */
const route = publicRead(async ({ supabase }) => {
  const [rows, lexicon, images] = await Promise.all([
    supabase.from("public_site_content").select("key, value"),
    getPublicLexicon(supabase),
    getSiteImageUrls(supabase),
  ]);

  const content = resolveSiteContent(
    (unwrap(rows) ?? []).map((row) => ({
      key: row.key ?? "",
      value: row.value,
    })),
    lexicon,
  );

  const slots: Record<string, unknown> = {};
  for (const slot of SITE_CONTENT_SLOTS) {
    slots[slot.key] = readSlot(slot, content);
  }

  return { content: slots, images, lexicon };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
