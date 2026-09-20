/**
 * `/pricing` (#1330): visible numbers rather than "contact sales".
 *
 * Every figure on this page is a content row, which is the decision the ticket
 * turns on. A price is the thing on this site most likely to change and least
 * likely to deserve a code review, so it is typed into Administration > Site
 * Content by whoever sets prices and takes effect without a deploy. Nothing
 * below knows what anything costs.
 *
 * Not a tour page. `tour-page.tsx` renders a heading, a list of illustrated
 * sections and a closing note, and three routes share it; a price list is a row
 * of cards to compare against each other, which is a different shape rather
 * than the same one with different words.
 */

import type { Metadata } from "next";
import { CtaButton } from "@/components/cta-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { liveCta } from "@/lib/site-ctas";

/** One row of `pricing.plans`, as the content layer hands it over. */
type ContentPlan = {
  name: string;
  price: string;
  period?: string;
  who: string;
  includes?: string[];
  cta_label?: string;
  cta_href?: string;
  /** Absent on a row stored before the field existed, which reads as shown. */
  shown?: boolean;
};

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Pricing") };
}

export default async function PricingPage() {
  const supabase = await createSupabaseServerClient();
  const [{ content }, visibility] = await Promise.all([
    getPublicSite(supabase),
    getPageVisibility(supabase),
  ]);
  const hidden = hiddenSlots(visibility);

  // A row switched off keeps its place in the editor and stays off the page, and
  // a row with no name is one somebody is part way through writing -- neither is
  // a card. A row with no *price* is still a card: a blank where the figure goes
  // is how this page looks before the numbers exist, and it is honest.
  const plans = content
    .list<ContentPlan>("pricing.plans")
    .filter((plan) => plan.shown !== false && Boolean(plan.name?.trim()));

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 max-w-3xl text-4xl font-semibold tracking-brand sm:text-5xl">
            {content.text("pricing.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-base leading-relaxed">
          {content.text("pricing.intro")}
        </p>
      </section>

      {plans.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, index) => {
            // The plan's own button, through the same three checks the hero
            // buttons pass: switched on, a destination the site will publish,
            // and a section that is still live.
            const cta = liveCta(
              plan.cta_label && plan.cta_href
                ? { label: plan.cta_label, href: plan.cta_href }
                : null,
              hidden,
            );
            const includes = (plan.includes ?? []).filter((line) =>
              Boolean(line?.trim()),
            );

            return (
              <Card key={`${plan.name}-${index}`} className="h-full">
                <CardHeader>
                  <h2 className="brand-display text-xl font-semibold tracking-brand">
                    {plan.name}
                  </h2>
                  {/* The figure, and the period as a footnote to it rather than
                      a second line of its own: "$49 per month" is one fact. */}
                  <p className="mt-2 text-3xl font-semibold tracking-brand">
                    {plan.price}
                    {plan.period?.trim() && (
                      <span className="app-muted ml-2 text-sm font-normal tracking-normal">
                        {plan.period}
                      </span>
                    )}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="app-muted text-sm leading-relaxed">
                    {plan.who}
                  </p>
                  {includes.length > 0 && (
                    <ul className="app-muted list-disc space-y-1 pl-5 text-sm leading-relaxed">
                      {includes.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {cta && (
                    <div className="mt-auto pt-2">
                      <CtaButton
                        href={cta.href}
                        variant={index === 0 ? "rainbow" : "secondary"}
                      >
                        {cta.label}
                      </CtaButton>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <section className="grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="brand-display text-2xl font-semibold tracking-brand">
            {content.text("pricing.included_heading")}
          </h2>
          <div className="mt-3 space-y-3">
            {content.paragraphs("pricing.included").map((line) => (
              <p
                key={line}
                className="app-muted text-sm leading-relaxed sm:text-base"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
        <div>
          <h2 className="brand-display text-2xl font-semibold tracking-brand">
            {content.text("pricing.onboarding_heading")}
          </h2>
          <div className="mt-3 space-y-3">
            {content.paragraphs("pricing.onboarding").map((line) => (
              <p
                key={line}
                className="app-muted text-sm leading-relaxed sm:text-base"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>

      <p className="app-muted max-w-3xl border-t border-border pt-6 text-sm leading-relaxed">
        {content.text("pricing.closing")}
      </p>
    </div>
  );
}
