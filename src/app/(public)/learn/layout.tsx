import { PageShell } from "@/components/page-shell";
import { EducationalDisclaimer } from "@/components/educational-disclaimer";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { requireVisiblePage } from "@/lib/page-visibility";
import { getPublicSite } from "@/lib/public-site";

export default async function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("learn");

  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);

  return (
    <PageShell>
      <div className="space-y-12">
        {children}
        <SiteImage
          url={siteImages.learn_photo ?? null}
          alt={content.text("org.image_alt")}
          className="aspect-[21/9] rounded-2xl"
        />
        <EducationalDisclaimer />
      </div>
    </PageShell>
  );
}
