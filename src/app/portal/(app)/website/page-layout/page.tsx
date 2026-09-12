import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LAYOUT_SLOTS, getTenantLayoutValues } from "@/lib/site-layout";
import { LayoutPanel } from "../layout-panel";

export const metadata: Metadata = {
  title: "Layout",
};

/**
 * Was System Settings' `?tab=layout` until #990.
 *
 * Every slot in `src/lib/site-layout.ts` is a public page's presentation --
 * how many upcoming events the home page shows, whether they render as flier
 * cards or a compact list, where the Programs page reads its programs from --
 * and none of it touches the portal. It also already leaked across the old
 * boundary in the direction that proved the point: the Website content
 * editor's programs notice linked *into* System Settings to change where that
 * page reads from. The setting and the content it governs were one job done in
 * two places.
 */
export default async function WebsiteLayoutSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const layoutValues = await getTenantLayoutValues(supabase);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Layout
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          How the public site is arranged, for the parts that aren&rsquo;t copy
          or colour.{" "}
          <Link
            href="/portal/website/page-visibility"
            className="underline underline-offset-4"
          >
            Page visibility
          </Link>{" "}
          decides whether a section exists at all; these settings decide how
          much of it a page shows. Every change here is recorded in the audit
          log.
        </p>
        <LayoutPanel slots={LAYOUT_SLOTS} values={layoutValues} />
      </div>
    </>
  );
}
