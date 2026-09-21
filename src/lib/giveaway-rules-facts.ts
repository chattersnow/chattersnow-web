import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCalendarDate } from "@/lib/format";
import {
  DEFAULT_ODDS_BASIS,
  GIVEAWAY_RULES_SETTING_PREFIX,
  isOddsBasis,
  resolveGiveawayRulesAnswers,
  type GiveawayRulesAnswers,
  type OddsBasis,
} from "@/lib/giveaway-rules";
import type {
  GiveawayRulesFacts,
  GiveawayRulesOddsRow,
  GiveawayRulesOverrides,
} from "@/lib/giveaway-rules-template";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * Reading the three things a set of official rules is built from (#1322): the
 * organization's answers, the promotion's own numbers, and whatever has been
 * written for this one promotion.
 *
 * Server-only by construction -- it takes a Supabase client -- which is the
 * same split `@/lib/legal-publication.ts` keeps from `@/lib/legal-documents.ts`:
 * the registry and the prose reach the client bundle, the reads must not.
 *
 * Dates come back formatted rather than raw, in the **event's** timezone. A
 * promotion's entry period is a fact about where it runs, not about where the
 * reader happens to be, and the numbers are frozen at publish anyway -- so the
 * formatting happens once, here, and the frozen text carries the zone it was
 * written in.
 */

type OddsSourceRow = {
  tierId: string;
  tierLabel: string;
  tickets: number;
};

/**
 * "3 gold, 1 silver and 1 bronze tickets" from a tier's row of the grant
 * matrix, times a package's bundle count.
 *
 * Zero-quantity rows drop out: the default matrix has bronze earning no gold
 * tickets, and "0 gold" in a published set of rules reads as a mistake.
 */
export function describeBundle(
  grants: readonly { ticketTierId: string; quantity: number }[],
  tiers: readonly { id: string; label: string }[],
  multiplier = 1,
): string | null {
  const parts = grants
    .map((grant) => {
      const tier = tiers.find((entry) => entry.id === grant.ticketTierId);
      const quantity = grant.quantity * multiplier;
      return tier && quantity > 0
        ? `${quantity} ${tier.label.toLowerCase()}`
        : null;
    })
    .filter((part): part is string => part !== null);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const tickets =
    parts.length === 1 ? last : `${parts.slice(0, -1).join(", ")} and ${last}`;
  const total = grants.reduce(
    (sum, grant) => sum + grant.quantity * multiplier,
    0,
  );
  return `${tickets} ${total === 1 ? "ticket" : "tickets"}`;
}

/** The odds rows for one basis, from the tickets issued and the prize layout. */
export function oddsRows(
  basis: OddsBasis,
  input: {
    totals: readonly OddsSourceRow[];
    buckets: readonly { id: string; name: string; tierId: string }[];
    prizes: readonly { bucketId: string | null }[];
  },
): GiveawayRulesOddsRow[] {
  if (basis === "overall") {
    const tickets = input.totals.reduce((sum, row) => sum + row.tickets, 0);
    return [
      {
        label: "Every ticket in this promotion",
        tickets,
        prizes: input.prizes.length,
        ticketsAreUpperBound: false,
      },
    ];
  }

  if (basis === "colour") {
    return input.totals.map((row) => {
      const tierBuckets = input.buckets.filter(
        (bucket) => bucket.tierId === row.tierId,
      );
      const prizes = input.prizes.filter((prize) =>
        tierBuckets.some((bucket) => bucket.id === prize.bucketId),
      ).length;
      return {
        label: `${row.tierLabel} tickets`,
        tickets: row.tickets,
        prizes,
        ticketsAreUpperBound: false,
      };
    });
  }

  return input.buckets.map((bucket) => ({
    label: bucket.name,
    // Every ticket of the bucket's colour: which of that colour's buckets a
    // ticket actually went into is not recorded anywhere (#5 -- placement is
    // physical), so this is the most that can be in it.
    tickets:
      input.totals.find((row) => row.tierId === bucket.tierId)?.tickets ?? 0,
    prizes: input.prizes.filter((prize) => prize.bucketId === bucket.id).length,
    ticketsAreUpperBound: true,
  }));
}

export type GiveawayRulesState = {
  /** Null until somebody saves an override or publishes. */
  rulesId: string | null;
  oddsBasis: OddsBasis;
  overrides: GiveawayRulesOverrides;
  facts: GiveawayRulesFacts;
  answers: GiveawayRulesAnswers;
  /** Newest first. Empty means this promotion serves no public rules page. */
  versions: { version: number; effective_at: string }[];
};

/** A stored `overrides` object, ignoring anything that is not paragraphs. */
export function resolveOverrides(value: unknown): GiveawayRulesOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const overrides: GiveawayRulesOverrides = {};
  for (const [id, paragraphs] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(paragraphs)) continue;
    const kept = paragraphs
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (kept.length) overrides[id] = kept;
  }
  return overrides;
}

/**
 * Everything the rules editor and the publish need for one giveaway.
 *
 * One read per table rather than one nested select: the ticket totals come
 * from an RPC, the answers from `app_settings`, and PostgREST cannot embed
 * across those anyway.
 */
export async function getGiveawayRulesState(
  supabase: SupabaseClient,
  giveawayId: string,
): Promise<GiveawayRulesState | null> {
  const { data: giveaway } = await supabase
    .from("giveaways")
    .select(
      "id, name, drawing_date, event:events!raffles_event_id_fkey(id, name, starts_at, ends_at, timezone)",
    )
    .eq("id", giveawayId)
    .maybeSingle();
  if (!giveaway) return null;

  const event = (
    Array.isArray(giveaway.event) ? giveaway.event[0] : giveaway.event
  ) as {
    name: string;
    starts_at: string;
    ends_at: string | null;
    timezone: string;
  } | null;

  const [
    { data: rules },
    { data: prizes },
    { data: buckets },
    { data: tiers },
    { data: grants },
    { data: packages },
    { data: totals },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("giveaway_rules")
      .select("id, odds_basis, overrides")
      .eq("giveaway_id", giveawayId)
      .maybeSingle(),
    supabase
      .from("giveaway_prizes")
      .select("id, prize_name, estimated_value, bucket_id")
      .eq("giveaway_id", giveawayId)
      .order("created_at"),
    supabase
      .from("giveaway_buckets")
      .select("id, name, tier_id, rank")
      .eq("giveaway_id", giveawayId)
      .order("rank"),
    supabase
      .from("giveaway_tiers")
      .select("id, label, rank")
      .eq("giveaway_id", giveawayId)
      .order("rank"),
    supabase
      .from("giveaway_tier_grants")
      .select("source_tier_id, ticket_tier_id, quantity")
      .eq("giveaway_id", giveawayId),
    supabase
      .from("giveaway_ticket_packages")
      .select("id, name, price, tier_id, bundle_quantity, rank, is_active")
      .eq("giveaway_id", giveawayId)
      .eq("is_active", true)
      .order("rank"),
    supabase.rpc("giveaway_ticket_totals", { p_giveaway_id: giveawayId }),
    supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${GIVEAWAY_RULES_SETTING_PREFIX}%`),
  ]);

  const tierList = (tiers ?? []).map((tier) => ({
    id: tier.id as string,
    label: tier.label as string,
  }));
  const bucketList = (buckets ?? []).map((bucket) => ({
    id: bucket.id as string,
    name: bucket.name as string,
    tierId: bucket.tier_id as string,
  }));
  const prizeList = (prizes ?? []).map((prize) => ({
    name: prize.prize_name as string,
    value:
      prize.estimated_value === null ? null : Number(prize.estimated_value),
    bucketId: (prize.bucket_id as string | null) ?? null,
  }));
  const grantList = (grants ?? []).map((grant) => ({
    sourceTierId: grant.source_tier_id as string,
    ticketTierId: grant.ticket_tier_id as string,
    quantity: Number(grant.quantity ?? 0),
  }));
  const totalList: OddsSourceRow[] = (
    (totals ?? []) as {
      tier_id: string;
      tier_label: string;
      quantity: number;
    }[]
  ).map((row) => ({
    tierId: row.tier_id,
    tierLabel: row.tier_label,
    tickets: Number(row.quantity ?? 0),
  }));

  const oddsBasis = isOddsBasis(rules?.odds_basis)
    ? rules.odds_basis
    : DEFAULT_ODDS_BASIS;

  const zone = event?.timezone ?? "UTC";
  const facts: GiveawayRulesFacts = {
    promotionName: (giveaway.name as string | null) ?? event?.name ?? "",
    timeZone: zone,
    eventName: event?.name ?? "",
    entryOpens: event?.starts_at
      ? formatDateTimeInZone(event.starts_at, zone, DATE_TIME_WITH_ZONE)
      : null,
    entryCloses: event?.ends_at
      ? formatDateTimeInZone(event.ends_at, zone, DATE_TIME_WITH_ZONE)
      : null,
    drawingDate: giveaway.drawing_date
      ? formatCalendarDate(giveaway.drawing_date as string)
      : null,
    prizes: prizeList.map((prize) => ({
      name: prize.name,
      value: prize.value,
      bucket:
        bucketList.find((bucket) => bucket.id === prize.bucketId)?.name ?? null,
    })),
    packages: (packages ?? [])
      .map((pkg) => {
        const tickets = describeBundle(
          grantList.filter((grant) => grant.sourceTierId === pkg.tier_id),
          tierList,
          Number(pkg.bundle_quantity ?? 1),
        );
        return tickets
          ? {
              name: pkg.name as string,
              price: Number(pkg.price ?? 0),
              tickets,
            }
          : null;
      })
      .filter((pkg): pkg is NonNullable<typeof pkg> => pkg !== null),
    donationTiers: tierList
      .map((tier) => {
        const tickets = describeBundle(
          grantList.filter((grant) => grant.sourceTierId === tier.id),
          tierList,
        );
        return tickets ? { label: tier.label, tickets } : null;
      })
      .filter((tier): tier is NonNullable<typeof tier> => tier !== null),
    odds: {
      basis: oddsBasis,
      rows: oddsRows(oddsBasis, {
        totals: totalList,
        buckets: bucketList,
        prizes: prizeList,
      }),
    },
  };

  const { data: versions } = rules?.id
    ? await supabase
        .from("giveaway_rules_versions")
        .select("version, effective_at")
        .eq("giveaway_rules_id", rules.id)
        .order("version", { ascending: false })
    : { data: [] };

  return {
    rulesId: (rules?.id as string | null) ?? null,
    oddsBasis,
    overrides: resolveOverrides(rules?.overrides),
    facts,
    answers: resolveGiveawayRulesAnswers(
      (settings ?? []) as { key: string; value: unknown }[],
    ),
    versions: (versions ?? []) as { version: number; effective_at: string }[],
  };
}
