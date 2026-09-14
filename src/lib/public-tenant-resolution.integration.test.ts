// #813 Phase 2 against a real local stack: a public request naming its tenant
// by slug instead of by host.
//
// The rules live in SQL (`public_tenant_id()`, 20260916030000) and none of
// them are observable through a mocked client, because what is being tested is
// which rows PostgREST hands back for a given pair of request headers. So the
// whole file is two provisioned tenants, each with one published event, read
// by an anon client carrying one header or the other.
//
// Both tenants are *active* for the length of the file, which takes
// `public_tenant_id()` off its sole-active-tenant fallback -- so every read
// here names a host or a slug explicitly, the same rule the module-gating and
// provisioning suites follow.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  anonClient,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../test/seed-fixtures";

// `created_by` defaults to auth.uid(), which is null under service_role, and
// events makes it `not null`. The seeded admin stands in as the author.
const AUTHOR = SEEDED_USER_IDS.admin;

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const ONE = {
  slug: `slugres-one-${run}`,
  host: `slugres-one-${run}.example.test`,
  eventName: `Slug Resolution One ${run}`,
};
const TWO = {
  slug: `slugres-two-${run}`,
  host: `slugres-two-${run}.example.test`,
  eventName: `Slug Resolution Two ${run}`,
};

let oneId: string;
let twoId: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function must<T = any>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data as T;
}

async function provision(tenant: typeof ONE): Promise<string> {
  const id = await must<string>(
    service.rpc("provision_tenant", {
      p_name: `Slug Resolution ${tenant.slug}`,
      p_slug: tenant.slug,
      p_custom_domain: tenant.host,
      p_plan: "white_label",
      p_admin_email: null,
    }),
    `provision ${tenant.slug}`,
  );

  await must(
    service
      .from("events")
      .insert({
        tenant_id: id,
        name: tenant.eventName,
        starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        timezone: "America/Denver",
        visibility: "public",
        status: "published",
        registration_enabled: true,
        created_by: AUTHOR,
      })
      .select("id"),
    `event for ${tenant.slug}`,
  );

  return id;
}

/** The names of the published events a client can see, whoever it resolved to. */
async function visibleEventNames(
  client: ReturnType<typeof anonClient>,
): Promise<string[]> {
  const rows = await must<{ name: string }[]>(
    client.from("public_events").select("name"),
    "public_events",
  );
  return rows.map((row) => row.name);
}

/** Runs `body` with the tenant in `status`, and always puts it back to active. */
async function withStatus(
  tenantId: string,
  status: "suspended" | "archived",
  body: () => Promise<void>,
) {
  await must(
    service.from("tenants").update({ status }).eq("id", tenantId).select("id"),
    `set ${status}`,
  );
  try {
    await body();
  } finally {
    await must(
      service
        .from("tenants")
        .update({ status: "active" })
        .eq("id", tenantId)
        .select("id"),
      "back to active",
    );
  }
}

beforeAll(async () => {
  oneId = await provision(ONE);
  twoId = await provision(TWO);
});

afterAll(async () => {
  for (const id of [oneId, twoId]) {
    if (!id) continue;
    await service.from("tenants").update({ status: "archived" }).eq("id", id);
    await service.rpc("delete_tenant", { p_tenant_id: id });
  }
});

describe("resolving a tenant by slug", () => {
  test("a slug reaches its tenant's public content", async () => {
    const anon = anonClient({ slug: ONE.slug });
    expect(await visibleEventNames(anon)).toEqual([ONE.eventName]);
  });

  test("the slug names the tenant, not the host", async () => {
    // The point of the whole phase: a consumer on another origin has no
    // meaningful Host to offer, and must be able to say which tenant it is
    // asking about. Here the host belongs to somebody else entirely, and the
    // slug still decides.
    const anon = anonClient({ slug: ONE.slug, host: TWO.host });
    expect(await visibleEventNames(anon)).toEqual([ONE.eventName]);
  });

  test("a slug that names nobody resolves to nothing, not to the host", async () => {
    // A typo in an embed snippet must render an empty site rather than
    // quietly serve whichever tenant the request happened to reach. The host
    // here resolves perfectly well on its own -- the test above proves it --
    // so an empty answer can only mean the unknown slug stopped the
    // resolution rather than falling through, which is also what keeps it off
    // the sole-active-tenant fallback and its sample data.
    const anon = anonClient({ slug: `no-such-tenant-${run}`, host: TWO.host });

    expect(await visibleEventNames(anon)).toEqual([]);
    expect(
      await must<{ name: string }[]>(
        anon.from("public_tenant").select("name"),
        "public_tenant",
      ),
    ).toEqual([]);
  });

  test("an empty slug header falls through to the host", async () => {
    // A proxy that always sets the header but sometimes leaves it blank must
    // not take the site down.
    const anon = anonClient({ slug: "", host: TWO.host });
    expect(await visibleEventNames(anon)).toEqual([TWO.eventName]);
  });

  test("a host with no slug resolves as it always did", async () => {
    const anon = anonClient({ host: TWO.host });
    expect(await visibleEventNames(anon)).toEqual([TWO.eventName]);
  });
});

describe("a slug is not a way past the tenant's status", () => {
  test("a suspended tenant is unreachable by slug", async () => {
    await withStatus(twoId, "suspended", async () => {
      const anon = anonClient({ slug: TWO.slug });
      expect(await visibleEventNames(anon)).toEqual([]);
    });
  });

  test("an archived tenant is unreachable by slug", async () => {
    await withStatus(twoId, "archived", async () => {
      const anon = anonClient({ slug: TWO.slug });
      expect(await visibleEventNames(anon)).toEqual([]);
    });
  });

  test("suspending one tenant leaves the other reachable", async () => {
    await withStatus(twoId, "suspended", async () => {
      const anon = anonClient({ slug: ONE.slug });
      expect(await visibleEventNames(anon)).toEqual([ONE.eventName]);
    });
  });
});

describe("module gating follows the slug", () => {
  test("the module view answers for the slug's tenant", async () => {
    await must(
      service
        .from("tenant_modules")
        .upsert(
          { tenant_id: oneId, module_key: "events", enabled: false },
          { onConflict: "tenant_id,module_key" },
        )
        .select("tenant_id"),
      "events off",
    );

    try {
      const anon = anonClient({ slug: ONE.slug });
      const modules = await must<{ module_key: string; enabled: boolean }[]>(
        anon.from("public_tenant_modules").select("module_key, enabled"),
        "public_tenant_modules",
      );
      expect(modules.find((row) => row.module_key === "events")?.enabled).toBe(
        false,
      );

      // And the other tenant, reached by its own slug in the same breath, is
      // untouched -- the gate is per tenant, not per request.
      const other = anonClient({ slug: TWO.slug });
      const otherModules = await must<
        { module_key: string; enabled: boolean }[]
      >(
        other.from("public_tenant_modules").select("module_key, enabled"),
        "other public_tenant_modules",
      );
      expect(
        otherModules.find((row) => row.module_key === "events")?.enabled,
      ).toBe(true);
    } finally {
      await service
        .from("tenant_modules")
        .upsert(
          { tenant_id: oneId, module_key: "events", enabled: true },
          { onConflict: "tenant_id,module_key" },
        );
    }
  });

  test("an intake RPC reached by slug refuses a disabled module", async () => {
    // The half that counts (#902): hiding a page does not stop a form post,
    // and an HTTP API makes that post easier, not harder. The RPC resolves the
    // slug's tenant and then asks about *that* tenant's modules.
    const eventId = await must<{ id: string }[]>(
      service.from("events").select("id").eq("tenant_id", oneId),
      "event id",
    ).then((rows) => rows[0].id);

    await must(
      service
        .from("tenant_modules")
        .upsert(
          { tenant_id: oneId, module_key: "events", enabled: false },
          { onConflict: "tenant_id,module_key" },
        )
        .select("tenant_id"),
      "events off",
    );

    try {
      const anon = anonClient({ slug: ONE.slug });
      const { error } = await anon.rpc("register_for_event", {
        p_event_id: eventId,
        p_name: "Slug Resolution Registrant",
        p_email: uniqueEmail("slugres"),
        p_phone: null,
        p_party_size: 1,
        p_notes: null,
        p_ip_address: uniqueIp(),
      });
      expect(error?.message).toBe("EVENT_NOT_FOUND");
    } finally {
      await service
        .from("tenant_modules")
        .upsert(
          { tenant_id: oneId, module_key: "events", enabled: true },
          { onConflict: "tenant_id,module_key" },
        );
    }
  });

  test("with the module back on, the same call goes through", async () => {
    const eventId = await must<{ id: string }[]>(
      service.from("events").select("id").eq("tenant_id", oneId),
      "event id",
    ).then((rows) => rows[0].id);

    const anon = anonClient({ slug: ONE.slug });
    const { data, error } = await anon.rpc("register_for_event", {
      p_event_id: eventId,
      p_name: "Slug Resolution Registrant",
      p_email: uniqueEmail("slugres"),
      p_phone: null,
      p_party_size: 1,
      p_notes: null,
      p_ip_address: uniqueIp(),
    });

    expect(error).toBeNull();
    expect(typeof data).toBe("string");
  });
});
