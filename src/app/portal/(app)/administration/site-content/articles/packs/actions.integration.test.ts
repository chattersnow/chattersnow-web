// Platform-authored content packs (#895), against a real stack.
//
// Three properties need a real database, and all three are cross-tenant:
//
//   1. Adoption **copies**. The adopting tenant ends up with its own rows,
//      unpublished, and editing or deleting them does nothing to the pack.
//      A mock cannot tell a copy from a reference.
//   2. The catalog crosses tenants in exactly one direction and only for
//      offered packs on an `internal` owner. Everything else about the
//      platform tenant's articles stays invisible.
//   3. Authoring a pack is platform-operator only, and that gate lives in
//      `require_platform_operator()` -- all three of its conditions -- not in
//      the Server Action that calls it.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  serviceRoleClient,
  signIn,
  uniqueEmail,
} from "../../../../../../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const PACK_KEY = `pack-${run}`;
const CATEGORY_SLUG = `pack-cat-${run}`;
const B_HOST = `packs-b-${run}.example.test`;

let platformTenant: string;
let packId: string;
let categoryId: string;
let tenantB: string;
let tenantC: string;
let adminB: SupabaseClient;
const adminEmailB = uniqueEmail("packs-admin-b");
const userIds: string[] = [];

async function must(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

function body(title: string) {
  return {
    title,
    description: `About ${title}`,
    paragraphs: ["One paragraph."],
    list: [{ label: "A point", text: "With some text." }],
    links: [{ label: "Programs", href: "/programs", internal: true }],
    disclaimer: "Not advice.",
  };
}

beforeAll(async () => {
  platformTenant = (
    await must(
      service
        .from("tenants")
        .select("id")
        .order("created_at")
        .limit(1)
        .single(),
      "platform tenant",
    )
  ).id;

  // The pack's material: one published category with two published articles,
  // written in the platform tenant exactly as any tenant writes articles.
  categoryId = await must(
    adminClient.rpc("save_article_drafts", {
      p_category: {
        id: null,
        slug: CATEGORY_SLUG,
        value: { title: "Packed category", description: "In a pack." },
      },
      p_articles: [
        { id: null, anchor: "first", value: body("First") },
        { id: null, anchor: "second", value: body("Second") },
      ],
    }),
    "save_article_drafts",
  );
  await must(
    adminClient.rpc("publish_article_category", { p_id: categoryId }),
    "publish",
  );

  packId = await must(
    adminClient.rpc("save_content_pack", {
      p_id: null,
      p_key: PACK_KEY,
      p_name: `Pack ${run}`,
      p_description: "A pack for the integration suite.",
      p_is_offered: true,
    }),
    "save_content_pack",
  );
  await must(
    adminClient.rpc("set_article_category_pack", {
      p_category_id: categoryId,
      p_pack_id: packId,
    }),
    "set_article_category_pack",
  );

  tenantB = await must(
    service.rpc("provision_tenant", {
      p_name: `Packs B ${run}`,
      p_slug: `packs-b-${run}`,
      p_custom_domain: B_HOST,
      p_plan: "white_label",
      p_admin_email: adminEmailB,
    }),
    "provision tenant B",
  );

  const created = await service.auth.admin.createUser({
    email: adminEmailB,
    password: "password123",
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("createUser failed");
  }
  userIds.push(created.data.user.id);
  adminB = await signIn(adminEmailB, "password123", { host: B_HOST });
  await must(adminB.rpc("claim_pending_role_grants"), "claim");
});

afterAll(async () => {
  for (const tenantId of [tenantB, tenantC]) {
    if (!tenantId) continue;
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", tenantId);
    await service.rpc("delete_tenant", { p_tenant_id: tenantId });
  }
  await service.from("content_packs").delete().eq("key", PACK_KEY);
  await service
    .from("article_categories")
    .delete()
    .eq("tenant_id", platformTenant)
    .eq("slug", CATEGORY_SLUG);
  for (const userId of userIds) {
    await service
      .from("audit_log")
      .update({ actor_id: null })
      .eq("actor_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
});

describe("the catalog", () => {
  test("offers the pack to another tenant, counting published rows only", async () => {
    const packs = await must(
      adminB.rpc("available_content_packs"),
      "available_content_packs",
    );
    const pack = packs.find((entry: { key: string }) => entry.key === PACK_KEY);
    expect(pack).toBeDefined();
    expect(pack.category_count).toBe(1);
    expect(pack.article_count).toBe(2);
    expect(pack.adopted_at).toBeNull();
  });

  test("never offers a tenant its own pack", async () => {
    const packs = await must(
      adminClient.rpc("available_content_packs"),
      "available_content_packs",
    );
    expect(packs.some((entry: { key: string }) => entry.key === PACK_KEY)).toBe(
      false,
    );
  });

  test("withdraws a pack that is switched off", async () => {
    await must(
      adminClient.rpc("save_content_pack", {
        p_id: packId,
        p_key: PACK_KEY,
        p_name: `Pack ${run}`,
        p_description: "",
        p_is_offered: false,
      }),
      "unoffer",
    );

    const packs = await must(
      adminB.rpc("available_content_packs"),
      "hidden catalog",
    );
    expect(packs.some((entry: { key: string }) => entry.key === PACK_KEY)).toBe(
      false,
    );
    // And an id somebody kept from before is not a way back in.
    const { error } = await adminB.rpc("adopt_content_pack", {
      p_pack_id: packId,
    });
    expect(error?.message).toContain("NO_PACK");

    await must(
      adminClient.rpc("save_content_pack", {
        p_id: packId,
        p_key: PACK_KEY,
        p_name: `Pack ${run}`,
        p_description: "A pack for the integration suite.",
        p_is_offered: true,
      }),
      "re-offer",
    );
  });

  test("does not expose the platform tenant's article rows themselves", async () => {
    const { data } = await adminB
      .from("article_categories")
      .select("id")
      .eq("id", categoryId);
    expect(data).toEqual([]);
  });
});

describe("adopting", () => {
  test("copies the pack in as drafts and puts nothing on the public site", async () => {
    const summary = await must(
      adminB.rpc("adopt_content_pack", { p_pack_id: packId }),
      "adopt",
    );
    expect(summary.categories).toBe(1);
    expect(summary.articles).toBe(2);

    const categories = await must(
      adminB
        .from("article_categories")
        .select("id, slug, value, draft_value, has_draft")
        .eq("slug", CATEGORY_SLUG),
      "copied categories",
    );
    expect(categories).toHaveLength(1);
    expect(categories[0].id).not.toBe(categoryId);
    expect(categories[0].value).toBeNull();
    expect(categories[0].has_draft).toBe(true);
    expect(categories[0].draft_value.title).toBe("Packed category");

    const articles = await must(
      adminB
        .from("articles")
        .select("anchor, position, draft_position, value, draft_value")
        .eq("category_id", categories[0].id)
        .order("draft_position"),
      "copied articles",
    );
    expect(articles.map((a: { anchor: string }) => a.anchor)).toEqual([
      "first",
      "second",
    ]);
    expect(articles.every((a: { value: unknown }) => a.value === null)).toBe(
      true,
    );

    // Nothing reaches the adopting tenant's public site until it publishes.
    const { data: published } = await anonClient({ host: B_HOST })
      .from("public_article_categories")
      .select("slug")
      .eq("slug", CATEGORY_SLUG);
    expect(published).toEqual([]);
  });

  test("records the adoption without a link back to the pack", async () => {
    const adoptions = await must(
      adminB
        .from("content_pack_adoptions")
        .select("pack_id, pack_key, pack_name, category_count, article_count")
        .eq("pack_key", PACK_KEY),
      "adoptions",
    );
    expect(adoptions).toHaveLength(1);
    expect(adoptions[0].pack_id).toBe(packId);
    expect(adoptions[0].category_count).toBe(1);

    const packs = await must(adminB.rpc("available_content_packs"), "catalog");
    const pack = packs.find((entry: { key: string }) => entry.key === PACK_KEY);
    expect(pack.adopted_at).not.toBeNull();
  });

  test("keeps the adoption record inside the tenant that made it", async () => {
    // content_pack_adoptions is out of test/tenant-tables.ts -- a single-tenant
    // seed can hold no row of it -- so the per-table isolation sweep never
    // reaches it and this is where that check lives.
    const { data, error } = await adminClient
      .from("content_pack_adoptions")
      .select("id")
      .eq("pack_key", PACK_KEY);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("leaves the copy alone when the pack's own article changes", async () => {
    await must(
      adminClient.rpc("save_article_drafts", {
        p_category: {
          id: categoryId,
          slug: CATEGORY_SLUG,
          value: { title: "Renamed upstream", description: "Changed." },
        },
        p_articles: [{ id: null, anchor: "first", value: body("Rewritten") }],
      }),
      "upstream edit",
    );
    await must(
      adminClient.rpc("publish_article_category", { p_id: categoryId }),
      "upstream publish",
    );

    const categories = await must(
      adminB
        .from("article_categories")
        .select("draft_value")
        .eq("slug", CATEGORY_SLUG),
      "copy after upstream edit",
    );
    expect(categories[0].draft_value.title).toBe("Packed category");
  });

  test("refuses rather than overwriting a category address already in use", async () => {
    const { error } = await adminB.rpc("adopt_content_pack", {
      p_pack_id: packId,
    });
    expect(error?.message).toContain("SLUG_TAKEN");
    expect(error?.message).toContain(CATEGORY_SLUG);
  });
});

describe("authoring", () => {
  test("is refused to an admin outside the platform tenant", async () => {
    const save = await adminB.rpc("save_content_pack", {
      p_id: null,
      p_key: `nope-${run}`,
      p_name: "Nope",
      p_description: "",
      p_is_offered: true,
    });
    expect(save.error).not.toBeNull();

    const label = await adminB.rpc("set_article_category_pack", {
      p_category_id: categoryId,
      p_pack_id: packId,
    });
    expect(label.error).not.toBeNull();
  });

  test("the pack tables are not writable through PostgREST", async () => {
    const insert = await adminClient
      .from("content_packs")
      .insert({ key: `direct-${run}`, name: "Direct" });
    expect(insert.error).not.toBeNull();

    const update = await adminClient
      .from("content_packs")
      .update({ is_offered: true })
      .eq("id", packId);
    expect(update.error).not.toBeNull();
  });

  test("copy_content_pack is not reachable by a signed-in session", async () => {
    const { error } = await adminB.rpc("copy_content_pack", {
      p_pack_id: packId,
      p_tenant_id: platformTenant,
    });
    expect(error).not.toBeNull();
  });
});

describe("provisioning", () => {
  test("copies the packs it is given as drafts", async () => {
    tenantC = await must(
      service.rpc("provision_tenant", {
        p_name: `Packs C ${run}`,
        p_slug: `packs-c-${run}`,
        p_plan: "white_label",
        p_pack_keys: [PACK_KEY],
      }),
      "provision with pack",
    );

    const categories = await must(
      service
        .from("article_categories")
        .select("slug, value, has_draft")
        .eq("tenant_id", tenantC),
      "provisioned categories",
    );
    expect(categories).toHaveLength(1);
    expect(categories[0].slug).toBe(CATEGORY_SLUG);
    expect(categories[0].value).toBeNull();
    expect(categories[0].has_draft).toBe(true);
  });

  test("refuses a pack key that does not exist rather than ignoring it", async () => {
    const { error } = await service.rpc("provision_tenant", {
      p_name: `Packs D ${run}`,
      p_slug: `packs-d-${run}`,
      p_plan: "white_label",
      p_pack_keys: ["no-such-pack"],
    });
    expect(error?.message).toContain("NO_PACK");

    const { data } = await service
      .from("tenants")
      .select("id")
      .eq("slug", `packs-d-${run}`);
    expect(data).toEqual([]);
  });
});
