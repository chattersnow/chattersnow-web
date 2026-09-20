// Integration coverage for the delivery log (#1310), against a real local
// Supabase stack.
//
// Three things here cannot be tested any other way. `notification_deliveries`
// is written entirely by the service-role sender, which RLS does not apply to,
// so the select policy (20260906140000) is the only thing standing between a
// signed-in session and the organization's whole mail history -- and
// fetchDeliveryLogEntries adds no check of its own. The rows that carry a null
// `person_id` (20260907120000) exist only because a real sender wrote one, and
// they are the rows most likely to render as a blank cell. And the skip row
// this ticket adds is written by deliverEmail() itself, on a path that only
// exists when a real preference row says so.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  serviceRoleClient,
  unprivilegedActors,
} from "../../../../../../test/integration-setup";
import {
  isDeliveryStuck,
  DELIVERY_PENDING_STUCK_MS,
} from "@/lib/notifications/delivery-record";
import {
  fetchDeliveryLogEntries,
  type DeliveryLogEntry,
} from "./delivery-log-query";
import type { DeliveryLogParams } from "./delivery-log-params";

// deliver.ts imports "server-only", which throws outside Next's bundler.
mock.module("server-only", () => ({}));
const { deliverEmail } = await import("@/lib/notifications/deliver");

const service = serviceRoleClient();

/** A kind no other integration file writes, so these rows are ours alone. */
const KIND = "task_digest";
const RUN = crypto.randomUUID().slice(0, 8);
const key = (suffix: string) => `it-1310-${RUN}:${suffix}`;

const BASE: DeliveryLogParams = {
  sort: "created_at",
  dir: "desc",
  status: "all",
  kind: "all",
  recipient: "",
  record: "",
  from: "",
  to: "",
  page: 1,
  perPage: 25,
};

const filters = (overrides: Partial<DeliveryLogParams> = {}) => ({
  ...BASE,
  ...overrides,
});

let tenantId: string;
let otherTenantId: string;
let recipientId: string;
const recipientEmail = `delivery-log-${RUN}@example.org`;

function fetchAs(
  client: SupabaseClient,
  overrides: Partial<DeliveryLogParams>,
) {
  return fetchDeliveryLogEntries(
    client as unknown as Parameters<typeof fetchDeliveryLogEntries>[0],
    filters(overrides),
  );
}

/** Just this run's rows, whatever else the shared database holds. */
function ours(entries: DeliveryLogEntry[] | null): DeliveryLogEntry[] {
  return (entries ?? []).filter((entry) =>
    entry.dedupe_key.startsWith(`it-1310-${RUN}:`),
  );
}

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id as string;

  // Archived, for the reason preferences.integration.test.ts gives: this file
  // only needs a second tenant to own a row, and a second *active* tenant
  // would knock default_tenant_id() off its sole-tenant fallback for every
  // other integration file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Delivery Log Test Org",
      slug: `delivery-log-${RUN}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  const { data: person, error: personError } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      name: `Delivery Log Recipient ${RUN}`,
      email: recipientEmail,
      source_type: "individual",
    })
    .select("id")
    .single();
  if (personError) throw personError;
  recipientId = person.id as string;

  const stuckSince = new Date(
    Date.now() - DELIVERY_PENDING_STUCK_MS * 3,
  ).toISOString();

  const now = new Date().toISOString();
  // Every row carries the same keys. PostgREST unions the columns of a batch
  // insert and sends an explicit null for any a row leaves out, which on
  // created_at is a not-null violation rather than the column default.
  const row = (overrides: Record<string, unknown>) => ({
    tenant_id: tenantId,
    person_id: recipientId,
    kind: KIND,
    status: "sent",
    provider_message_id: null,
    error: null,
    sent_at: null,
    created_at: now,
    ...overrides,
  });

  const { error: insertError } = await service
    .from("notification_deliveries")
    .insert([
      row({
        dedupe_key: key("sent"),
        provider_message_id: "re_1310_sent",
        sent_at: now,
      }),
      row({
        dedupe_key: key("failed"),
        status: "failed",
        error: "The provider refused this address.",
      }),
      // The ops report's shape: addressed to a configured inbox, no people row
      // behind it.
      row({
        dedupe_key: key("ops"),
        person_id: null,
        kind: "ops_report",
        sent_at: now,
      }),
      // A claim whose finalize never happened -- a crash between the two
      // writes, backdated so it is unambiguously stuck rather than in flight.
      row({
        dedupe_key: key("stuck"),
        status: "pending",
        created_at: stuckSince,
      }),
      // The row the isolation case is about.
      row({
        dedupe_key: key("other-tenant"),
        tenant_id: otherTenantId,
        person_id: null,
        sent_at: now,
      }),
    ]);
  if (insertError) throw insertError;
});

afterAll(async () => {
  await service
    .from("notification_deliveries")
    .delete()
    .like("dedupe_key", `it-1310-${RUN}:%`);
  await service.from("people").delete().eq("id", recipientId);
  // retention_policies first: a trigger on `tenants` seeds every new tenant's
  // rules (#707 Phase 5b) and that foreign key is `no action`. The error is
  // asserted because preferences.integration.test.ts learned the hard way that
  // a silently failed delete leaves a second active-ish tenant behind for
  // every file that runs after it.
  await service
    .from("retention_policies")
    .delete()
    .eq("tenant_id", otherTenantId);
  const { error: tenantDeleteError } = await service
    .from("tenants")
    .delete()
    .eq("id", otherTenantId);
  expect(tenantDeleteError).toBeNull();
});

describe("fetchDeliveryLogEntries (integration)", () => {
  test("shows this tenant's deliveries and never another tenant's", async () => {
    const { entries, error, count } = await fetchAs(adminClient, {});
    expect(error).toBeNull();
    expect(count ?? 0).toBeGreaterThan(0);

    const keys = ours(entries).map((entry) => entry.dedupe_key);
    expect(keys).toContain(key("sent"));
    expect(keys).not.toContain(key("other-tenant"));
  });

  // The acceptance criterion this ticket was written for: an administrator
  // must be able to see what the provider said about a refused message.
  test("carries the provider's error and message id through to the reader", async () => {
    const { entries } = await fetchAs(adminClient, { status: "failed" });
    const failed = ours(entries).find((e) => e.dedupe_key === key("failed"));
    expect(failed?.error).toBe("The provider refused this address.");

    const { entries: sentEntries } = await fetchAs(adminClient, {
      status: "sent",
    });
    const sent = ours(sentEntries).find((e) => e.dedupe_key === key("sent"));
    expect(sent?.provider_message_id).toBe("re_1310_sent");
  });

  // A null person_id is by design, not a broken row, and the screen labels it
  // from the kind. What the query owes it is a kind to label it with.
  test("returns an organization-addressed row with no directory record", async () => {
    const { entries } = await fetchAs(adminClient, { kind: "ops_report" });
    const ops = ours(entries).find((e) => e.dedupe_key === key("ops"));
    expect(ops).toBeDefined();
    expect(ops?.person_id).toBeNull();
    expect(ops?.person).toBeNull();
    expect(ops?.kind).toBe("ops_report");
  });

  test("a pending row that never finished is readable and reads as stuck", async () => {
    const { entries } = await fetchAs(adminClient, { status: "pending" });
    const stuck = ours(entries).find((e) => e.dedupe_key === key("stuck"));
    expect(stuck).toBeDefined();
    expect(stuck?.sent_at).toBeNull();
    expect(isDeliveryStuck(stuck!.status, stuck!.created_at)).toBe(true);
  });

  test("resolves the recipient's directory record for the recipient column", async () => {
    const { entries } = await fetchAs(adminClient, { status: "sent" });
    const sent = ours(entries).find((e) => e.dedupe_key === key("sent"));
    expect(sent?.person?.email).toBe(recipientEmail);
  });

  test("finds a person's deliveries by address and by name", async () => {
    for (const term of [recipientEmail, `Recipient ${RUN}`]) {
      const { entries } = await fetchAs(adminClient, { recipient: term });
      const keys = ours(entries).map((e) => e.dedupe_key);
      expect({ term, hasSent: keys.includes(key("sent")) }).toEqual({
        term,
        hasSent: true,
      });
      // The ops report went to an inbox, not to this person.
      expect({ term, hasOps: keys.includes(key("ops")) }).toEqual({
        term,
        hasOps: false,
      });
    }
  });

  test("returns nothing rather than everything when nobody matches", async () => {
    const { entries } = await fetchAs(adminClient, {
      recipient: `nobody-${RUN}@example.org`,
    });
    expect(ours(entries)).toEqual([]);
  });

  // #1310 section 3: the only thread between a delivery and the record it is
  // about is the dedupe key, which is `<kind>:<record id>` by convention.
  test("finds every delivery about one record from its id", async () => {
    const { entries } = await fetchAs(adminClient, { record: RUN });
    expect(ours(entries).length).toBeGreaterThanOrEqual(4);
  });
});

describe("fetchDeliveryLogEntries for unprivileged actors (integration)", () => {
  // notification_deliveries holds who this organization writes to and when.
  // Its select policy is the whole defense: every row here was written by the
  // service-role client, which RLS never looked at.
  test("returns no entries and no total for any unprivileged session", async () => {
    const privileged = await fetchAs(adminClient, {});
    expect(privileged.error).toBeNull();
    expect(privileged.count ?? 0).toBeGreaterThan(0);

    for (const { name, client } of await unprivilegedActors()) {
      const { entries, count, error } = await fetchAs(client, {});
      expect({
        actor: name,
        entries: entries ?? [],
        count: count ?? 0,
        leaked: (entries ?? []).length > 0,
      }).toEqual({ actor: name, entries: [], count: 0, leaked: false });
      // Anonymous is refused by the API outright; a signed-in session without
      // administration:manage is filtered to zero rows by the policy.
      if (name === "anonymous") expect(error?.code).toBe("42501");
      else expect(error).toBeNull();
    }
  });
});

// The behaviour change behind the screen (#1310): until now deliverEmail()
// returned "skipped" for an opt-out and wrote nothing at all, so the receipt
// somebody had switched off and the receipt that was never triggered were
// indistinguishable from the portal -- both simply absent. 20260906140000 had
// already claimed this table was "the evidence that an opt-out was honored".
describe("deliverEmail records an opt-out as a skipped delivery", () => {
  const OPT_OUT_KIND = "event_registration_confirmation";
  const optOutKey = key("opt-out");

  afterAll(async () => {
    await service
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", recipientId)
      .eq("kind", OPT_OUT_KIND);
  });

  test("writes a skipped row naming the reason, and sends nothing", async () => {
    const { error: prefError } = await service
      .from("person_notification_preferences")
      .insert({
        tenant_id: tenantId,
        person_id: recipientId,
        kind: OPT_OUT_KIND,
        enabled: false,
      });
    expect(prefError).toBeNull();

    const outcome = await deliverEmail(service, {
      tenantId,
      personId: recipientId,
      identity: { from: '"Test Org" <notifications@example.org>' },
      kind: OPT_OUT_KIND,
      dedupeKey: optOutKey,
      to: recipientEmail,
      render: () => {
        throw new Error("a skipped send must never render a body");
      },
      logPrefix: "[it-1310]",
    });
    expect(outcome).toBe("skipped");

    const { data } = await service
      .from("notification_deliveries")
      .select("status, skip_reason, sent_at, provider_message_id")
      .eq("dedupe_key", optOutKey)
      .single();
    expect(data).toEqual({
      status: "skipped",
      skip_reason: "opted_out",
      sent_at: null,
      provider_message_id: null,
    });
  });

  test("the skipped row reaches the log, with its reason", async () => {
    const { entries } = await fetchAs(adminClient, { status: "skipped" });
    const skipped = ours(entries).find((e) => e.dedupe_key === optOutKey);
    expect(skipped?.skip_reason).toBe("opted_out");
  });

  // Re-running the same send must not pile up skip rows: the ledger's unique
  // constraint is the idempotency mechanism, and a skip row takes part in it.
  test("a repeat of the same send adds no second row", async () => {
    await deliverEmail(service, {
      tenantId,
      personId: recipientId,
      identity: { from: '"Test Org" <notifications@example.org>' },
      kind: OPT_OUT_KIND,
      dedupeKey: optOutKey,
      to: recipientEmail,
      render: () => {
        throw new Error("a skipped send must never render a body");
      },
      logPrefix: "[it-1310]",
    });

    const { count } = await service
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("dedupe_key", optOutKey);
    expect(count).toBe(1);
  });
});

// The column may only describe a skip. Without this the screen would have to
// decide which of two contradicting columns to believe.
describe("notification_deliveries.skip_reason constraints", () => {
  test("refuses a reason on a row that was actually sent", async () => {
    const { error } = await service.from("notification_deliveries").insert({
      tenant_id: tenantId,
      person_id: recipientId,
      kind: KIND,
      dedupe_key: key("bad-sent-with-reason"),
      status: "sent",
      skip_reason: "opted_out",
    });
    expect(error?.code).toBe("23514");
  });

  test("refuses a reason nothing in the application writes", async () => {
    const { error } = await service.from("notification_deliveries").insert({
      tenant_id: tenantId,
      person_id: recipientId,
      kind: KIND,
      dedupe_key: key("bad-unknown-reason"),
      status: "skipped",
      skip_reason: "because",
    });
    expect(error?.code).toBe("23514");
  });
});
