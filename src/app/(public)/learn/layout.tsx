import { PageShell } from "@/components/page-shell";
import { EducationalDisclaimer } from "@/components/educational-disclaimer";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";

export default async function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);

  return (
    <PageShell>
      <div className="space-y-12">
        {children}
        <SiteImage
          url={siteImages.learn_photo ?? null}
          alt="Chatter Snow community members"
          className="aspect-[21/9] rounded-2xl"
        />
        <EducationalDisclaimer />
      </div>
    </PageShell>
  );
}
