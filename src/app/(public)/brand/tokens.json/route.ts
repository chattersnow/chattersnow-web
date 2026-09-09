import { NextResponse } from "next/server";
import { accentStops, brandColorPairs } from "@/lib/branding";
import { isPageVisible } from "@/lib/page-visibility";
import { getPublicSite } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The tenant's palette as machine-readable JSON, for importing into Figma,
 * Canva or anything else a designer already works in.
 *
 * Derived from the same `brandColorPairs()` and `accentStops()` the page
 * renders, so the file and the page cannot disagree. Gated on the same slot:
 * this is the brand guide in another format, and a board that has not
 * published the guide has not published its tokens either.
 *
 * The dark values are omitted deliberately. They are relative-colour CSS the
 * browser resolves (`oklch(from ...)`), not hex, and a design tool handed that
 * string would either ignore it or import something wrong. The page shows them
 * as chips for the same reason.
 */
export async function GET() {
  if (!(await isPageVisible("brand"))) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { name, branding } = await getPublicSite(supabase);

  return NextResponse.json({
    organization: name,
    colors: brandColorPairs(branding).map(({ token, value }) => ({
      key: token.key,
      name: token.label,
      usage: token.description,
      value,
    })),
    accent: {
      type: "linear-gradient",
      angle: 90,
      stops: accentStops(branding),
    },
  });
}
