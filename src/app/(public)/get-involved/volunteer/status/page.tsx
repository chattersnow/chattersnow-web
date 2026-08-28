import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { VolunteerStatusLookupForm } from "../../volunteer-status-lookup-form-fields";

export const metadata: Metadata = {
  title: "Check Application Status | Chatter Snow",
};

export default function VolunteerStatusPage() {
  return (
    <div>
      <section>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Check your application status
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Enter the email you applied with and the reference code shown when you
          submitted your volunteer application.
        </p>
        <div className="mt-6 max-w-md">
          <Card className="shadow-md">
            <CardContent>
              <VolunteerStatusLookupForm />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
