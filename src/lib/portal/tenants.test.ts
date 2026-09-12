// One host, one tenant (#956).
//
// `decideHostTenant` is the whole of that rule. The portal layout is a switch
// over its four answers, so the cases that matter -- and above all the order
// they are checked in -- are pinned here rather than in the 300-line shell
// that acts on them.
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicTenant } from "@/lib/branding";
import {
  decideHostTenant,
  getTenantContext,
  type Tenant,
  type TenantContext,
} from "@/lib/portal/tenants";

const CHATTER_SNOW = "11111111-1111-4111-8111-111111111111";
const DEMO = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

function tenant(id: string, name: string): Tenant {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    plan: "white_label",
    custom_domain: null,
  };
}

function host(id: string, name: string): PublicTenant {
  return { ...tenant(id, name), custom_domain: `${name}.example.org` };
}

function context(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenants: [tenant(CHATTER_SNOW, "Chatter Snow")],
    currentTenantId: CHATTER_SNOW,
    hostTenant: null,
    resolved: true,
    ...overrides,
  };
}

describe("decideHostTenant", () => {
  test("enforces nothing when no tenant claims the host", () => {
    // localhost, CI, a preview with no TENANT_HOST_OVERRIDE, and a domain
    // pointed at the deployment before its tenant row exists all land here.
    // This is the case that must keep behaving exactly as it did before #956.
    expect(decideHostTenant(context({ hostTenant: null }))).toEqual({
      kind: "unenforced",
    });
  });

  test("enforces nothing when the context did not resolve", () => {
    // A failed read comes back with no tenants, which is indistinguishable
    // from "member of nothing" -- refusing on it would turn a database blip
    // into a lockout on every tenant's portal at once.
    expect(
      decideHostTenant(
        context({
          resolved: false,
          tenants: [],
          hostTenant: host(DEMO, "demo"),
        }),
      ),
    ).toEqual({ kind: "unenforced" });
  });

  test("enforces nothing for an account that belongs to no tenant", () => {
    // NoTenant already explains this state, and it explains it better: there
    // is no organization to send them to and nothing they did wrong.
    expect(
      decideHostTenant(
        context({
          tenants: [],
          currentTenantId: null,
          hostTenant: host(DEMO, "demo"),
        }),
      ),
    ).toEqual({ kind: "unenforced" });
  });

  test("refuses a host belonging to an organization the account is not in", () => {
    // The reported bug: a Chatter Snow account signing in on the public demo's
    // domain got the Chatter Snow portal.
    const hostTenant = host(DEMO, "demo");
    expect(decideHostTenant(context({ hostTenant }))).toEqual({
      kind: "refuse",
      hostTenant,
    });
  });

  test("refuses before the account is asked to choose an organization", () => {
    // The ordering that matters. A member of two organizations looking at a
    // third's host has a null currentTenantId, which is exactly the state
    // ChooseTenant exists for -- so checked in the other order they would pick
    // one, have it accepted, and be asked again on the very next render,
    // forever.
    const hostTenant = host(THIRD, "third");
    expect(
      decideHostTenant(
        context({
          tenants: [tenant(CHATTER_SNOW, "Chatter Snow"), tenant(DEMO, "Demo")],
          currentTenantId: null,
          hostTenant,
        }),
      ),
    ).toEqual({ kind: "refuse", hostTenant });
  });

  test("aligns a member whose selection points at another organization", () => {
    const hostTenant = host(DEMO, "demo");
    expect(
      decideHostTenant(
        context({
          tenants: [tenant(CHATTER_SNOW, "Chatter Snow"), tenant(DEMO, "Demo")],
          currentTenantId: CHATTER_SNOW,
          hostTenant,
        }),
      ),
    ).toEqual({ kind: "align", hostTenant });
  });

  test("aligns a member who has not chosen an organization yet", () => {
    // Two memberships and no selection. The host answers the question
    // ChooseTenant would have asked, so it never gets asked.
    const hostTenant = host(DEMO, "demo");
    expect(
      decideHostTenant(
        context({
          tenants: [tenant(CHATTER_SNOW, "Chatter Snow"), tenant(DEMO, "Demo")],
          currentTenantId: null,
          hostTenant,
        }),
      ),
    ).toEqual({ kind: "align", hostTenant });
  });

  test("pins a member already scoped to the host's organization", () => {
    // The common case by far -- one membership, on its own domain. It must not
    // cost a write or a redirect.
    const hostTenant = host(CHATTER_SNOW, "chattersnow");
    expect(decideHostTenant(context({ hostTenant }))).toEqual({
      kind: "pinned",
      hostTenant,
    });
  });
});

describe("getTenantContext", () => {
  test("claims pending role grants before reading which tenants the account is in", async () => {
    // The bug this pins: provisioning stages a tenant's first admin as a
    // `pending_role_grants` row, and their membership only exists once that is
    // claimed. The claim used to live downstream, in resolvePermissions() --
    // harmless until #956 made the tenant list decide whether the request is
    // served at all. With the claim left downstream, the first person ever to
    // open a newly provisioned tenant's portal was told, on that tenant's own
    // domain, that they are not a member of it, and was refused before
    // reaching the call that would have made them one.
    const calls: string[] = [];
    const client = {
      rpc(name: string) {
        calls.push(`rpc:${name}`);
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        calls.push(`from:${table}`);
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    await getTenantContext(client);

    expect(calls.indexOf("rpc:claim_pending_role_grants")).toBeLessThan(
      calls.indexOf("from:tenants"),
    );
    expect(calls.indexOf("rpc:ensure_tenant_membership")).toBeLessThan(
      calls.indexOf("from:tenants"),
    );
  });
});
