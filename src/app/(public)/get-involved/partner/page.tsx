import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Become a Partner | Chatter Snow",
};

export default function PartnerPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Become a partner
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            We work with mountains, gear brands, and other organizations to make
            events more affordable and accessible for our community. Partnership
            can look like a lift ticket discount with a resort, a gear brand
            supplying demo equipment for an event, a co-hosted meetup with
            another LGBTQ+ or outdoor organization, or a venue donating space
            for a gear drive. If your organization wants to collaborate with
            Chatter in any of these ways, we&apos;d love to hear from you.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            nativeButton={false}
            render={<Link href="/contact?topic=partnership" />}
          >
            Start a conversation
          </Button>
        </section>
      </div>
    </main>
  );
}
