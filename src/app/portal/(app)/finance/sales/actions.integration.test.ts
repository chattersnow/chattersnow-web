// Integration test: the sales ledger's Server Actions and the two RPCs behind
// them (20260911050000_product_sale_rpcs.sql) against a real local Supabase
// stack.
//
// This is the file that matters most in #908, because the invariants it checks
// cannot be checked anywhere else: `sales` and `sale_line_items` have no insert
// grant at all, so the *only* way a sale exists is through
// `record_product_sale`, and the whole point of that function is arithmetic on
// a row it holds a lock on. A mock cannot fail to decrement stock, refuse an
// oversell, or lose a race.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  unprivilegedActors,
} from "../../../../../../test/integration-setup";
import {
  SEEDED_EVENT_IDS,
  SEEDED_PERSON_IDS,
  SEEDED_SALE_IDS,
  SEEDED_VARIANT_IDS,
} from "../../../../../../test/seed-fixtures";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  recordSaleAction,
  voidSaleAction,
  updateSaleAction,
  listEventSalesAction,
} = await import("./actions");

const DENIED = { error: "You don't have permission to perform this action." };
const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

/** Sales this file created, cleaned up whatever the assertions did. */
const createdSaleIds: string[] = [];
let tenantId: string;
let productId: string;
/** Stock 5, the workhorse. */
let variantId: string;
/** Stock 1, for the oversell and the race. */
let scarceVariantId: string;
/** Stock 5 but retired. */
let inactiveVariantId: string;

async function stockOf(id: string): Promise<number> {
  const { data, error } = await service
    .from("product_variants")
    .select("stock_on_hand")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.stock_on_hand as number;
}

async function setStock(id: string, stock: number) {
  const { error } = await service
    .from("product_variants")
    .update({ stock_on_hand: stock })
    .eq("id", id);
  if (error) throw error;
}

function saleInput(overrides: Record<string, unknown> = {}) {
  return {
    event_id: null,
    purchaser_person_id: null,
    payment_method: "cash",
    discount_amount: 0,
    notes: `IT sale ${run}`,
    lines: [{ variant_id: variantId, quantity: 1 }],
    ...overrides,
  };
}

/** Records a sale as the seeded admin and remembers it for cleanup. */
async function record(overrides: Record<string, unknown> = {}) {
  currentSupabase = adminClient;
  const result = await recordSaleAction(saleInput(overrides));
  if ("success" in result) createdSaleIds.push(result.saleId);
  return result;
}

beforeAll(async () => {
  // A catalog of this file's own, so the seeded products (and the stock figures
  // seed-shape.integration.test.ts pins) are left exactly as they were.
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .eq("status", "active")
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id as string;

  // Through the signed-in admin rather than service_role, so tenant_id and
  // created_by come from their defaults the way the app's own writes do.
  const { data: product, error: productError } = await adminClient
    .from("products")
    .insert({ name: `IT Sales Product ${run}` })
    .select("id")
    .single();
  if (productError) throw productError;
  productId = product.id as string;

  // `is_active` is spelled out on all three rows: PostgREST unions the keys of
  // a multi-row insert and sends an explicit null for one a row omits, which a
  // not-null column with a default refuses.
  const { data: variants, error: variantError } = await adminClient
    .from("product_variants")
    .insert([
      {
        product_id: productId,
        label: "Plenty",
        price: 10,
        stock_on_hand: 5,
        is_active: true,
      },
      {
        product_id: productId,
        label: "Last one",
        price: 7.5,
        stock_on_hand: 1,
        is_active: true,
      },
      {
        product_id: productId,
        label: "Retired",
        price: 3,
        stock_on_hand: 5,
        is_active: false,
      },
    ])
    .select("id, label");
  if (variantError) throw variantError;

  const byLabel = new Map(
    (variants as { id: string; label: string }[]).map((v) => [v.label, v.id]),
  );
  variantId = byLabel.get("Plenty")!;
  scarceVariantId = byLabel.get("Last one")!;
  inactiveVariantId = byLabel.get("Retired")!;
});

// Stock is set back to its starting figures before every test rather than
// unwound afterwards: `setStock` is absolute, so one reset leaves the three
// fixtures in a known state no matter what the previous test sold, voided or
// refused.
beforeEach(async () => {
  await setStock(variantId, 5);
  await setStock(scarceVariantId, 1);
  await setStock(inactiveVariantId, 5);
});

afterEach(() => {
  revalidatePathMock.mockClear();
});

afterAll(async () => {
  // Sales first: sale_line_items cascades from the sale, and the restrict from
  // sale_line_items to product_variants would otherwise refuse the variants.
  if (createdSaleIds.length > 0) {
    await service.from("sales").delete().in("id", createdSaleIds);
  }
  await service.from("products").delete().eq("id", productId);
});

describe("recordSaleAction (integration)", () => {
  test("nobody unprivileged can record a sale", async () => {
    for (const actor of await unprivilegedActors()) {
      currentSupabase = actor.client;
      expect(await recordSaleAction(saleInput()), actor.name).toEqual(DENIED);
    }
    // board holds finance through reports only, and no `sales` at all.
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(await recordSaleAction(saleInput())).toEqual(DENIED);
  });

  test("an admin records a sale, and stock comes down by what was sold", async () => {
    const before = await stockOf(variantId);

    const result = await record({
      event_id: SEEDED_EVENT_IDS.past,
      purchaser_person_id: SEEDED_PERSON_IDS.donor1,
      discount_amount: 2.5,
      lines: [{ variant_id: variantId, quantity: 2 }],
    });

    expect(result).toMatchObject({ success: true, total: 17.5 });
    expect(await stockOf(variantId)).toBe(before - 2);

    const { data: sale } = await service
      .from("sales")
      .select("subtotal, discount_amount, total, status, event_id, notes")
      .eq("id", (result as { saleId: string }).saleId)
      .single();
    expect({
      subtotal: Number(sale?.subtotal),
      discount: Number(sale?.discount_amount),
      total: Number(sale?.total),
      status: sale?.status,
      event_id: sale?.event_id,
    }).toEqual({
      subtotal: 20,
      discount: 2.5,
      total: 17.5,
      status: "completed",
      event_id: SEEDED_EVENT_IDS.past,
    });

    // Snapshotted, not joined: the description and the price are the ones that
    // were current when it sold.
    const { data: lines } = await service
      .from("sale_line_items")
      .select("description, unit_price, quantity, line_total")
      .eq("sale_id", (result as { saleId: string }).saleId);
    expect(lines).toHaveLength(1);
    expect({
      ...lines![0],
      unit_price: Number(lines![0].unit_price),
      line_total: Number(lines![0].line_total),
    }).toEqual({
      description: `IT Sales Product ${run} — Plenty`,
      unit_price: 10,
      quantity: 2,
      line_total: 20,
    });
  });

  test("the same variant twice is merged into one line", async () => {
    const before = await stockOf(variantId);
    const result = await record({
      lines: [
        { variant_id: variantId, quantity: 1 },
        { variant_id: variantId, quantity: 2 },
      ],
    });

    expect(result).toMatchObject({ success: true, total: 30 });
    expect(await stockOf(variantId)).toBe(before - 3);
    const { count } = await service
      .from("sale_line_items")
      .select("id", { count: "exact", head: true })
      .eq("sale_id", (result as { saleId: string }).saleId);
    expect(count).toBe(1);
  });

  test("an oversell is refused and leaves stock untouched", async () => {
    const before = await stockOf(scarceVariantId);
    currentSupabase = adminClient;
    const result = await recordSaleAction(
      saleInput({ lines: [{ variant_id: scarceVariantId, quantity: 2 }] }),
    );

    // The message names the variant and its real count, which is the whole
    // reason the RPC raises a `detail` rather than a bare code.
    expect(result).toEqual({
      error: `Not enough stock — IT Sales Product ${run} — Last one: 1 on hand.`,
    });
    expect(await stockOf(scarceVariantId)).toBe(before);
  });

  test("a retired variant cannot be sold", async () => {
    currentSupabase = adminClient;
    const result = await recordSaleAction(
      saleInput({ lines: [{ variant_id: inactiveVariantId, quantity: 1 }] }),
    );
    expect(result).toEqual({
      error: `IT Sales Product ${run} — Retired has been retired and cannot be sold.`,
    });
  });

  test("a discount larger than the sale is refused", async () => {
    currentSupabase = adminClient;
    expect(await recordSaleAction(saleInput({ discount_amount: 999 }))).toEqual(
      { error: "The discount is more than the sale comes to." },
    );
  });

  test("an event or person from nowhere is refused before anything is written", async () => {
    currentSupabase = adminClient;
    expect(
      await recordSaleAction(saleInput({ event_id: crypto.randomUUID() })),
    ).toEqual({ error: "That event no longer exists. Pick another one." });
    expect(
      await recordSaleAction(
        saleInput({ purchaser_person_id: crypto.randomUUID() }),
      ),
    ).toEqual({
      error: "That person no longer exists. Search for them again.",
    });
    expect(
      await recordSaleAction(
        saleInput({
          lines: [{ variant_id: crypto.randomUUID(), quantity: 1 }],
        }),
      ),
    ).toEqual({
      error:
        "Something in the cart no longer exists. Reload the register and try again.",
    });
  });

  test("two sales of the last unit: exactly one succeeds", async () => {
    await setStock(scarceVariantId, 1);

    // Two separate sessions, so neither can be serialised by a shared
    // connection: each call is its own transaction, and the row lock
    // record_product_sale takes in id order is what decides between them.
    const [first, second] = await Promise.all([
      adminClient.rpc("record_product_sale", {
        p_event_id: null,
        p_purchaser_person_id: null,
        p_payment_method: "cash",
        p_discount_amount: 0,
        p_sold_at: null,
        p_notes: `IT race ${run}`,
        p_lines: [{ variant_id: scarceVariantId, quantity: 1 }],
      }),
      (await signInAs(SEEDED_USERS.finance)).rpc("record_product_sale", {
        p_event_id: null,
        p_purchaser_person_id: null,
        p_payment_method: "cash",
        p_discount_amount: 0,
        p_sold_at: null,
        p_notes: `IT race ${run}`,
        p_lines: [{ variant_id: scarceVariantId, quantity: 1 }],
      }),
    ]);

    const outcomes = [first, second];
    const won = outcomes.filter((outcome) => outcome.error === null);
    const lost = outcomes.filter((outcome) => outcome.error !== null);
    expect(won).toHaveLength(1);
    expect(lost[0].error?.message).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(scarceVariantId)).toBe(0);

    for (const outcome of won) {
      const rows = outcome.data as { sale_id: string }[];
      createdSaleIds.push(rows[0].sale_id);
    }
  });
});

describe("the tables refuse every write that is not an RPC", () => {
  test("an admin session cannot insert a sale directly", async () => {
    const { error } = await adminClient.from("sales").insert({
      payment_method: "cash",
      subtotal: 5,
      discount_amount: 0,
      total: 5,
    });
    // 42501: the insert grant was revoked, so this never reaches a policy.
    expect(error?.code).toBe("42501");
  });

  test("an admin session cannot insert a line item or delete a sale", async () => {
    const lineItem = await adminClient.from("sale_line_items").insert({
      sale_id: SEEDED_SALE_IDS.completed,
      product_variant_id: SEEDED_VARIANT_IDS.beanieOneSize,
      description: "Smuggled",
      unit_price: 1,
      quantity: 1,
      line_total: 1,
    });
    expect(lineItem.error?.code).toBe("42501");

    const deletion = await adminClient
      .from("sales")
      .delete()
      .eq("id", SEEDED_SALE_IDS.completed);
    expect(deletion.error?.code).toBe("42501");
  });

  test("the update grant reaches three columns and no more", async () => {
    const money = await adminClient
      .from("sales")
      .update({ total: 1 })
      .eq("id", SEEDED_SALE_IDS.completed);
    expect(money.error?.code).toBe("42501");

    const voidState = await adminClient
      .from("sales")
      .update({ status: "voided" })
      .eq("id", SEEDED_SALE_IDS.completed);
    expect(voidState.error?.code).toBe("42501");
  });
});

describe("voidSaleAction (integration)", () => {
  test("nobody unprivileged can void a sale", async () => {
    for (const actor of await unprivilegedActors()) {
      currentSupabase = actor.client;
      expect(
        await voidSaleAction(SEEDED_SALE_IDS.completed, "nope"),
        actor.name,
      ).toEqual(DENIED);
    }
  });

  test("voiding returns the units, and a second void is refused", async () => {
    const recorded = await record({
      lines: [{ variant_id: variantId, quantity: 1 }],
    });
    const saleId = (recorded as { saleId: string }).saleId;
    const afterSale = await stockOf(variantId);

    currentSupabase = adminClient;
    expect(await voidSaleAction(saleId, "Rung up twice")).toEqual({
      success: true,
    });
    expect(await stockOf(variantId)).toBe(afterSale + 1);

    const { data: sale } = await service
      .from("sales")
      .select("status, voided_at, voided_by, void_reason")
      .eq("id", saleId)
      .single();
    expect(sale?.status).toBe("voided");
    expect(sale?.voided_at).not.toBeNull();
    expect(sale?.voided_by).not.toBeNull();
    expect(sale?.void_reason).toBe("Rung up twice");

    // The line items survive: without them there would be no record of the
    // stock that came back.
    const { count } = await service
      .from("sale_line_items")
      .select("id", { count: "exact", head: true })
      .eq("sale_id", saleId);
    expect(count).toBe(1);

    // And the stock does not come back twice.
    expect(await voidSaleAction(saleId, "again")).toEqual({
      error:
        "This sale has already been voided, and its stock is already back.",
    });
    expect(await stockOf(variantId)).toBe(afterSale + 1);
  });

  test("a sale that does not exist reads as not found", async () => {
    currentSupabase = adminClient;
    expect(await voidSaleAction(crypto.randomUUID(), "x")).toEqual({
      error: "That sale no longer exists.",
    });
  });
});

describe("updateSaleAction and listEventSalesAction (integration)", () => {
  test("the note and the event are correctable", async () => {
    const recorded = await record();
    const saleId = (recorded as { saleId: string }).saleId;

    const formData = new FormData();
    formData.set("eventId", SEEDED_EVENT_IDS.upcoming);
    formData.set("purchaserPersonId", SEEDED_PERSON_IDS.donor2);
    formData.set("notes", "corrected");

    currentSupabase = adminClient;
    expect(await updateSaleAction(saleId, formData)).toEqual({ success: true });

    const { data } = await service
      .from("sales")
      .select("event_id, purchaser_person_id, notes")
      .eq("id", saleId)
      .single();
    expect(data).toEqual({
      event_id: SEEDED_EVENT_IDS.upcoming,
      purchaser_person_id: SEEDED_PERSON_IDS.donor2,
      notes: "corrected",
    });
  });

  test("the event list embeds the purchaser and the lines", async () => {
    currentSupabase = adminClient;
    const result = await listEventSalesAction(SEEDED_EVENT_IDS.past);
    if ("error" in result) throw new Error(result.error);

    const seeded = result.data.find(
      (sale) => sale.id === SEEDED_SALE_IDS.completed,
    );
    expect(seeded).toBeDefined();
    // The embed names its foreign key because every key on `sales` is
    // composite; a wrong hint is a PostgREST error, not an empty field.
    expect(seeded!.purchaser?.id).toBe(SEEDED_PERSON_IDS.donor1);
    expect(seeded!.sale_line_items).toHaveLength(2);
    expect(seeded!.events?.name).toContain("Trailhead");
  });

  test("a view-only reader can list but not write", async () => {
    // No seeded role holds sales at `view` -- admin, finance and
    // event_coordinator all hold manage and the rest hold none -- so the tier
    // the ledger's own layout gates on is made here rather than assumed.
    const email = uniqueEmail("sales-view");
    const { data: created, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;

    const { data: role, error: roleError } = await service
      .from("roles")
      .insert({
        tenant_id: tenantId,
        name: `sales_viewer_${run}`,
        description: "view-only sales, for the integration suite",
      })
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
      .insert({ role_id: role.id, resource_id: resource!.id, level: "view" });
    await service
      .from("user_roles")
      .insert({ user_id: created.user.id, role_id: role.id });

    try {
      currentSupabase = await signInAs(email);
      const listed = await listEventSalesAction(SEEDED_EVENT_IDS.past);
      expect("data" in listed).toBe(true);

      expect(await recordSaleAction(saleInput())).toEqual(DENIED);
      expect(await voidSaleAction(SEEDED_SALE_IDS.completed, "x")).toEqual(
        DENIED,
      );
    } finally {
      // role_permissions and user_roles cascade from the role.
      await service.from("roles").delete().eq("id", role.id);
      await service
        .from("tenant_memberships")
        .delete()
        .eq("user_id", created.user.id);
      await service
        .from("audit_log")
        .update({ actor_id: null })
        .eq("actor_id", created.user.id);
      await service.auth.admin.deleteUser(created.user.id);
    }
  });
});

describe("another tenant's sale (integration)", () => {
  let tenantBId: string;
  let tenantBUserId: string;
  const tenantBEmail = uniqueEmail("sales-tenant-b");

  beforeAll(async () => {
    const { data: tenant, error } = await service
      .from("tenants")
      .insert({
        name: `Sales Isolation ${run}`,
        slug: `sales-isolation-${run}`,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    tenantBId = tenant.id as string;

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

    await service
      .from("user_roles")
      .insert({ user_id: tenantBUserId, role_id: role.id });
  });

  // Left behind, tenant B would be a second active tenant for every file that
  // runs after this one -- default_tenant_id() resolves to the sole active
  // tenant and returns null once there are two, which stops every unscoped
  // insert in the suite cold.
  afterAll(async () => {
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", tenantBId);
    await service.from("roles").delete().eq("tenant_id", tenantBId);
    await service
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", tenantBId);
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

  test("tenant B's admin cannot void or even see tenant A's sale", async () => {
    currentSupabase = await signInAs(tenantBEmail);

    // The same answer a made-up id gets, so nothing leaks by existence either.
    expect(await voidSaleAction(SEEDED_SALE_IDS.completed, "x")).toEqual({
      error: "That sale no longer exists.",
    });

    const listed = await listEventSalesAction(SEEDED_EVENT_IDS.past);
    expect(listed).toEqual({ data: [] });

    // And A's variant cannot be sold from B either, which is the check that
    // keeps one tenant from moving another's stock.
    expect(
      await recordSaleAction(
        saleInput({ lines: [{ variant_id: variantId, quantity: 1 }] }),
      ),
    ).toEqual({
      error:
        "Something in the cart no longer exists. Reload the register and try again.",
    });
  });
});
