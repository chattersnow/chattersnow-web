import type { Metadata } from "next";
import Link from "next/link";
import { HandHeart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { ImagePlaceholder } from "@/components/image-placeholder";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { VolunteerApplicationSheet } from "../volunteer-application-sheet";

export const metadata: Metadata = {
  title: "Volunteer | Chatter Snow",
};

export default async function VolunteerPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: roleTypes }, siteImages] = await Promise.all([
    supabase
      .from("public_volunteer_role_types")
      .select("id, name, description")
      .order("name", { ascending: true }),
    getSiteImageUrls(supabase),
  ]);

  return (
    <div>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Volunteer
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Chatter runs on volunteers. Here are some of the ways you can get
          involved.
        </p>
        <SiteImage
          url={siteImages.get_involved_volunteer_photo ?? null}
          alt="Chatter Snow volunteers"
          className="mt-8 aspect-[21/9] rounded-2xl"
        />
        {roleTypes && roleTypes.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roleTypes.map((roleType) => (
              <Card key={roleType.id}>
                <CardHeader>
                  <ImagePlaceholder icon={HandHeart} />
                </CardHeader>
                <CardContent>
                  <CardTitle>{roleType.name}</CardTitle>
                  <p className="app-muted mt-2 text-sm leading-relaxed">
                    {roleType.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="app-muted mt-6 text-sm">
            Check back soon for open volunteer roles.
          </p>
        )}
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <VolunteerApplicationSheet />
          <Link
            href="/get-involved/volunteer/status"
            className="app-muted text-sm underline underline-offset-4"
          >
            Already applied? Check your status
          </Link>
        </div>
      </section>
    </div>
  );
}
