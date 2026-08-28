import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";

export const metadata: Metadata = {
  title: "Meet the Team | Chatter Snow",
};

const TEAM = [
  { name: "Sofie Chavez" },
  { name: "Cass Lainez" },
  { name: "Rickie Cruz" },
];

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);

  return (
    <div>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Meet the team
      </h1>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        Full bios are on their way.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM.map((member) => (
          <Card key={member.name}>
            <CardHeader>
              <SiteImage
                url={siteImages.about_team_photo ?? null}
                alt={member.name}
                icon={UserRound}
              />
            </CardHeader>
            <CardContent>
              <CardTitle>{member.name}</CardTitle>
              <p className="app-muted mt-2 text-sm leading-relaxed">
                Bio coming soon.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
