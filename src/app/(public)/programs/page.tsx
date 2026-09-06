import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Programs") };
}

type Pillar = { label: string; description: string };
type Program = {
  pillar: string;
  emoji?: string;
  name: string;
  description: string;
};

export default async function ProgramsPage() {
  const supabase = await createSupabaseServerClient();
  const { content } = await getPublicSite(supabase);
  const pillars = content.list<Pillar>("programs.pillars");
  const programs = content.list<Program>("programs.items");

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("programs.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("programs.intro")}
        </p>
      </section>

      {pillars.map((pillar) => (
        <section key={pillar.label}>
          <h2 className="app-eyebrow">{pillar.label}</h2>
          <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed sm:text-base">
            {pillar.description}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {programs
              .filter((program) => program.pillar === pillar.label)
              .map((program) => (
                <Card key={program.name}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {program.emoji && (
                        <span aria-hidden>{program.emoji}</span>
                      )}
                      {program.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="app-muted text-sm leading-relaxed">
                      {program.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
