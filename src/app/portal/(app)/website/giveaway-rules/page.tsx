import type { Metadata } from "next";
import {
  GIVEAWAY_RULES_ANSWERS,
  GIVEAWAY_RULES_SETTING_PREFIX,
  resolveGiveawayRulesAnswers,
} from "@/lib/giveaway-rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GiveawayRulesPanel } from "../giveaway-rules-panel";

export const metadata: Metadata = {
  title: "Giveaway rules",
};

/**
 * Beside Legal documents, because it is the same kind of decision and carries
 * the same disclaimer (#1322): the organization saying what its own position
 * is, so that the platform never has to guess at one.
 *
 * Read straight from `app_settings` -- RLS scopes it to the current tenant --
 * rather than through a public view, for the reason written out on
 * `getTenantLegalPublication`: a view answers for the request host, which on
 * `portal.<domain>` is a different question from "the tenant this admin is
 * signed in to".
 */
export default async function WebsiteGiveawayRulesPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .like("key", `${GIVEAWAY_RULES_SETTING_PREFIX}%`);

  const answers = resolveGiveawayRulesAnswers(
    (data ?? []) as { key: string; value: unknown }[],
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Giveaway rules
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          The parts of a giveaway&rsquo;s official rules that are the same every
          time this organization runs one &mdash; who the sponsor is, who may
          enter, how somebody enters without donating or buying, what is
          published about a winner. Answer them once here; the parts that change
          per promotion &mdash; the entry period, the prizes, the odds, the
          drawing date &mdash; are filled in from the giveaway itself, in the
          event&rsquo;s Giveaway tab, where the rules are published and frozen.
        </p>
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          Nothing here is published on its own, and nothing here is legal
          advice. The wording shown in each box is an example of the shape of
          the answer, not a recommendation: what a promotion may lawfully say,
          and whether it may run at all, is a question for your organization and
          its own counsel. Every change here is recorded in the audit log.
        </p>
        <GiveawayRulesPanel fields={GIVEAWAY_RULES_ANSWERS} answers={answers} />
      </div>
    </>
  );
}
