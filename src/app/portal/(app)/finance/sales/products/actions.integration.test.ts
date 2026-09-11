// Integration test: the Products admin's Server Actions against a real local
// Supabase stack -- checkPermission first, then the real `products` /
// `product_variants` RLS from 20260911040000_create_products_and_sales.sql.
// The `sales` resource is manage for admin/finance/event_coordinator and none
// for board/volunteer, so both halves of that matrix are exercised here rather
// than assumed. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  unprivilegedActors,
} from "../../../../../../../test/integration-setup";
import {
  SEEDED_PRODUCT_IDS,
  SEEDED_USER_IDS,
} from "../../../../../../../test/seed-fixtures";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  createVariantAction,
  updateVariantAction,
  deleteVariantAction,
  setVariantStockAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };
const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

function productForm(overrides?: {
  name?: string;
  label?: string;
  price?: string;
  stock?: string;
  isActive?: string;
}) {
  const fd = new FormData();
  fd.set("name", overrides?.name ?? `IT Product ${crypto.randomUUID()}`);
  fd.set("label", overrides?.label ?? "One size");
  fd.set("price", overrides?.price ?? "20.00");
  fd.set("stockOnHand", overrides?.stock ?? "10");
  if (overrides?.isActive) fd.set("isActive", overrides.isActive);
  return fd;
}

function variantForm(overrides?: {
  label?: string;
  price?: string;
  stock?: string;
  sku?: string;
}) {
  const fd = new FormData();
  fd.set("label", overrides?.label ?? `V-${crypto.randomUUID().slice(0, 8)}`);
  fd.set("price", overrides?.price ?? "25.00");
  fd.set("stockOnHand", overrides?.stock ?? "5");
  if (overrides?.sku) fd.set("sku", overrides.sku);
  return fd;
}

/** Creates a product as the seeded admin and hands back its id plus cleanup. */
async function createProduct(name = `IT Product ${crypto.randomUUID()}`) {
  currentSupabase = adminClient;
  const result = await createProductAction(productForm({ name }));
  if (!("success" in result)) throw new Error(result.error);

  const { data, error } = await service
    .from("products")
    .select("id, product_variants(id)")
    .eq("name", name)
    .single();
  if (error) throw error;

  return {
    id: data.id as string,
    firstVariantId: (data.product_variants as { id: string }[])[0].id,
    cleanup: () => service.from("products").delete().eq("id", data.id),
  };
}

describe("createProductAction (integration)", () => {
  test("an anonymous session cannot create a product", async () => {
    currentSupabase = anonClient();
    expect(await createProductAction(productForm())).toEqual(DENIED);
  });

  test("no unprivileged actor can create a product", async () => {
    for (const { name, client } of await unprivilegedActors()) {
      currentSupabase = client;
      expect(await createProductAction(productForm()), name).toEqual(DENIED);
    }
  });

  test("board (sales: none) cannot create a product", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    expect(await createProductAction(productForm())).toEqual(DENIED);
  });

  for (const role of ["admin", "finance", "coordinator"] as const) {
    test(`${role} (sales: manage) creates a product and its first variant`, async () => {
      const name = `IT Product ${role} ${crypto.randomUUID()}`;
      currentSupabase = await signIn(SEEDED_USERS[role]);

      expect(await createProductAction(productForm({ name }))).toEqual({
        success: true,
      });

      const { data } = await service
        .from("products")
        .select("id, is_active, product_variants(label, price, stock_on_hand)")
        .eq("name", name)
        .single();
      expect(data?.is_active).toBe(true);
      expect(data?.product_variants).toHaveLength(1);
      expect(data?.product_variants[0]).toMatchObject({
        label: "One size",
        stock_on_hand: 10,
      });

      await service.from("products").delete().eq("id", data!.id);
    });
  }

  test("a product created inactive does not drag its first variant down with it", async () => {
    // Both parsers read `isActive`, and the dialog only offers the product
    // one. The action strips the shared keys before parsing the variant so the
    // variant falls back to its own default.
    const name = `IT Inactive ${crypto.randomUUID()}`;
    currentSupabase = adminClient;
    expect(
      await createProductAction(productForm({ name, isActive: "off" })),
    ).toEqual({ success: true });

    const { data } = await service
      .from("products")
      .select(
        "id, is_active, sort_order, product_variants(is_active, sort_order)",
      )
      .eq("name", name)
      .single();
    expect(data?.is_active).toBe(false);
    expect(data?.product_variants[0].is_active).toBe(true);

    await service.from("products").delete().eq("id", data!.id);
  });

  test("a duplicate name is refused by name, not by error code", async () => {
    const product = await createProduct();
    const { data: existing } = await service
      .from("products")
      .select("name")
      .eq("id", product.id)
      .single();

    currentSupabase = adminClient;
    expect(
      await createProductAction(productForm({ name: existing!.name })),
    ).toEqual({ error: "A product with this name already exists." });

    await product.cleanup();
  });

  test("a failed variant insert takes the half-made product with it", async () => {
    // Two statements and no transaction: the action undoes the product rather
    // than leaving one behind with no price.
    const name = `IT Rollback ${crypto.randomUUID()}`;
    const sku = `IT-SKU-${run}`;
    const first = await createProduct();
    currentSupabase = adminClient;
    await createVariantAction(first.id, variantForm({ sku }));

    const fd = productForm({ name });
    fd.set("sku", sku);
    currentSupabase = adminClient;
    expect(await createProductAction(fd)).toEqual({
      error: "That SKU is already in use.",
    });

    const { data } = await service
      .from("products")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    expect(data).toBeNull();

    await first.cleanup();
  });
});

describe("updateProductAction / deleteProductAction (integration)", () => {
  test("finance can rename a product", async () => {
    const product = await createProduct();
    const renamed = `IT Renamed ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const fd = new FormData();
    fd.set("name", renamed);
    expect(await updateProductAction(product.id, fd)).toEqual({
      success: true,
    });

    const { data } = await service
      .from("products")
      .select("name")
      .eq("id", product.id)
      .single();
    expect(data?.name).toBe(renamed);

    await product.cleanup();
  });

  test("volunteer (sales: none) can neither rename nor delete", async () => {
    const product = await createProduct();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const fd = new FormData();
    fd.set("name", "Nope");
    expect(await updateProductAction(product.id, fd)).toEqual(DENIED);
    expect(await deleteProductAction(product.id)).toEqual(DENIED);

    await product.cleanup();
  });

  test("admin can delete an unsold product, variants and all", async () => {
    const product = await createProduct();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(await deleteProductAction(product.id)).toEqual({ success: true });

    const { data } = await service
      .from("products")
      .select("id")
      .eq("id", product.id)
      .maybeSingle();
    expect(data).toBeNull();
  });
});

describe("variant actions (integration)", () => {
  test("event_coordinator can add, edit and delete an unsold variant", async () => {
    const product = await createProduct();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    expect(
      await createVariantAction(product.id, variantForm({ label: "L" })),
    ).toEqual({ success: true });

    const { data: added } = await service
      .from("product_variants")
      .select("id")
      .eq("product_id", product.id)
      .eq("label", "L")
      .single();

    expect(
      await updateVariantAction(
        added!.id,
        variantForm({ label: "L", price: "30.00", stock: "3" }),
      ),
    ).toEqual({ success: true });

    const { data: edited } = await service
      .from("product_variants")
      .select("price, stock_on_hand")
      .eq("id", added!.id)
      .single();
    expect(Number(edited?.price)).toBe(30);
    expect(edited?.stock_on_hand).toBe(3);

    expect(await deleteVariantAction(added!.id)).toEqual({ success: true });

    await product.cleanup();
  });

  test("a variant that has been sold can only be deactivated", async () => {
    // The `on delete restrict` from sale_line_items, and the sentence the
    // action turns 23503 into. Part 2's record_sale RPC does not exist yet, so
    // the sale is written with the service-role client -- which is also the
    // only way to write one at all, since neither table has an insert grant.
    const product = await createProduct();
    const { data: sale, error: saleError } = await service
      .from("sales")
      .insert({
        payment_method: "cash",
        subtotal: 20,
        discount_amount: 0,
        total: 20,
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (saleError) throw saleError;

    const { error: lineError } = await service.from("sale_line_items").insert({
      sale_id: sale.id,
      product_variant_id: product.firstVariantId,
      description: "One size",
      unit_price: 20,
      quantity: 1,
      line_total: 20,
      created_by: SEEDED_USER_IDS.admin,
    });
    if (lineError) throw lineError;

    currentSupabase = adminClient;
    expect(await deleteVariantAction(product.firstVariantId)).toEqual({
      error: "This variant has been sold; deactivate it instead.",
    });
    // And the product it hangs off cannot be deleted either, because the
    // cascade to variants would run into the same restrict.
    expect(await deleteProductAction(product.id)).toEqual({
      error:
        "This product has been sold; deactivate it instead — it keeps its sales history and disappears from the register.",
    });

    // Deactivating is the way out, and it works.
    expect(
      await updateVariantAction(
        product.firstVariantId,
        (() => {
          const fd = variantForm({ label: "One size", price: "20.00" });
          fd.set("isActive", "off");
          return fd;
        })(),
      ),
    ).toEqual({ success: true });

    const { data: deactivated } = await service
      .from("product_variants")
      .select("is_active")
      .eq("id", product.firstVariantId)
      .single();
    expect(deactivated?.is_active).toBe(false);

    // sale_line_items cascades from the sale; the product goes once nothing
    // references its variants.
    await service.from("sales").delete().eq("id", sale.id);
    await product.cleanup();
  });

  test("two variants of one product cannot share a label", async () => {
    const product = await createProduct();
    currentSupabase = adminClient;

    expect(
      await createVariantAction(product.id, variantForm({ label: "One size" })),
    ).toEqual({
      error: "This product already has a variant with that name or SKU.",
    });

    await product.cleanup();
  });

  test("setVariantStockAction sets an absolute count", async () => {
    const product = await createProduct();
    currentSupabase = await signIn(SEEDED_USERS.finance);

    expect(await setVariantStockAction(product.firstVariantId, 42)).toEqual({
      success: true,
    });

    const { data } = await service
      .from("product_variants")
      .select("stock_on_hand")
      .eq("id", product.firstVariantId)
      .single();
    expect(data?.stock_on_hand).toBe(42);

    await product.cleanup();
  });

  test("setVariantStockAction refuses a negative count before the database has to", async () => {
    const product = await createProduct();
    currentSupabase = adminClient;

    expect(await setVariantStockAction(product.firstVariantId, -1)).toEqual({
      error: "Stock must be a whole number, zero or more.",
    });

    await product.cleanup();
  });

  test("no unprivileged actor can touch stock", async () => {
    const product = await createProduct();
    for (const { name, client } of await unprivilegedActors()) {
      currentSupabase = client;
      expect(
        await setVariantStockAction(product.firstVariantId, 99),
        name,
      ).toEqual(DENIED);
    }
    await product.cleanup();
  });
});

describe("cross-tenant reads (integration)", () => {
  let tenantBUserId: string;
  let tenantBId: string;
  const tenantBEmail = uniqueEmail("products-iso");

  beforeAll(async () => {
    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .insert({
        name: "Products Isolation Org",
        slug: `products-iso-${run}`,
        custom_domain: `products-iso-${run}.example.test`,
        plan: "white_label",
      })
      .select("id")
      .single();
    if (tenantError) throw tenantError;
    tenantBId = tenant.id as string;

    // An admin role in B holding sales:manage -- the most access anyone in
    // another tenant could have, so a row that stays invisible here is
    // invisible to every role in B.
    const { data: role, error: roleError } = await service
      .from("roles")
      .insert({ tenant_id: tenantBId, name: "admin", description: "test" })
      .select("id")
      .single();
    if (roleError) throw roleError;

    const { data: resource } = await service
      .from("resources")
      .select("id")
      .eq("key", "sales")
      .single();
    await service
      .from("role_permissions")
      .insert({ role_id: role.id, resource_id: resource!.id, level: "manage" });

    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email: tenantBEmail,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    tenantBUserId = user.user.id;

    // ensure_membership_for_role creates the membership row.
    await service
      .from("user_roles")
      .insert({ user_id: tenantBUserId, role_id: role.id });
  });

  // Left behind, tenant B would be a second active tenant for every file that
  // runs after this one -- default_tenant_id() resolves to the sole active
  // tenant and returns null once there are two, which stops every unscoped
  // insert in the suite cold. Every foreign key to `tenants` is `no action`,
  // so the dependents go first, in order, and the final delete throws rather
  // than leaving the mess for whoever runs next.
  afterAll(async () => {
    // Seeded by the seed_retention_policies trigger on the tenant insert.
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", tenantBId);
    // role_permissions and user_roles cascade from the role.
    await service.from("roles").delete().eq("tenant_id", tenantBId);
    await service
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", tenantBId);
    // audit_log.actor_id references auth.users without a cascade.
    await service
      .from("audit_log")
      .update({ actor_id: null })
      .eq("actor_id", tenantBUserId);
    await service.auth.admin.deleteUser(tenantBUserId);

    const { error } = await service
      .from("tenants")
      .delete()
      .eq("id", tenantBId);
    if (error) throw error;
  });

  test("tenant B's admin sees none of tenant A's products or variants", async () => {
    const bClient = anonClient();
    const { error: signInError } = await bClient.auth.signInWithPassword({
      email: tenantBEmail,
      password: "password123",
    });
    expect(signInError).toBeNull();

    const { data: products } = await bClient.from("products").select("id");
    expect(products).toEqual([]);

    const { data: variants } = await bClient
      .from("product_variants")
      .select("id");
    expect(variants).toEqual([]);

    // And specifically not the seeded catalog, which a leak would surface.
    const { data: beanie } = await bClient
      .from("products")
      .select("id")
      .eq("id", SEEDED_PRODUCT_IDS.beanie)
      .maybeSingle();
    expect(beanie).toBeNull();
  });
});
