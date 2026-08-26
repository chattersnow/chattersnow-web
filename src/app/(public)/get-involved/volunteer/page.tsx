import type { Metadata } from "next";
import { HandHeart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePlaceholder } from "@/components/image-placeholder";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VolunteerApplicationSheet } from "../volunteer-application-sheet";

export const metadata: Metadata = {
  title: "Volunteer | Chatter Snow",
};

export default async function VolunteerPage() {
  const supabase = await createSupabaseServerClient();
  const { data: roleTypes } = await supabase
    .from("public_volunteer_role_types")
    .select("id, name, description")
    .order("name", { ascending: true });

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Volunteer
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter runs on volunteers. Here are some of the ways you can get
            involved.
          </p>
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
          <div className="mt-10">
            <VolunteerApplicationSheet />
          </div>
        </section>
      </div>
    </main>
  );
}
