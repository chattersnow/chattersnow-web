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
  SEEDED_SALE_RECEIPT_NUMBERS,
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
      .select(
        "subtotal, discount_amount, tax_rate, tax_amount, total, status, event_id, notes",
      )
      .eq("id", (result as { saleId: string }).saleId)
      .single();
    expect({
      subtotal: Number(sale?.subtotal),
      discount: Number(sale?.discount_amount),
      tax_rate: Number(sale?.tax_rate),
      tax_amount: Number(sale?.tax_amount),
      total: Number(sale?.total),
      status: sale?.status,
      event_id: sale?.event_id,
    }).toEqual({
      subtotal: 20,
      discount: 2.5,
      // No rate sent: untaxed, and the total is exactly the net.
      tax_rate: 0,
      tax_amount: 0,
      total: 17.5,
      status: "completed",
      event_id: SEEDED_EVENT_IDS.past,
    });

    // Snapshotted, not joined: the description and the price are the ones that
    // were current when it sold. With no override sent, the price charged and
    // the list price the RPC looked up are the same figure (#1015).
    const { data: lines } = await service
      .from("sale_line_items")
      .select("description, unit_price, list_price, quantity, line_total")
      .eq("sale_id", (result as { saleId: string }).saleId);
    expect(lines).toHaveLength(1);
    expect({
      ...lines![0],
      unit_price: Number(lines![0].unit_price),
      list_price: Number(lines![0].list_price),
      line_total: Number(lines![0].line_total),
    }).toEqual({
      description: `IT Sales Product ${run} — Plenty`,
      unit_price: 10,
      list_price: 10,
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

  // #997: the client sends a rate and never an amount. The RPC computes the
  // amount on its own subtotal net of discount, rounds once to the cent, and
  // snapshots both on the row.
  test("a nonzero rate is taxed on the discounted subtotal and snapshotted", async () => {
    const result = await record({
      discount_amount: 2.5,
      tax_rate: 8.25,
      lines: [{ variant_id: variantId, quantity: 2 }],
    });
    // (20 - 2.50) * 8.25% = 1.44375 -> 1.44; total 17.50 + 1.44.
    expect(result).toMatchObject({ success: true, total: 18.94 });

    const { data: sale } = await service
      .from("sales")
      .select("subtotal, discount_amount, tax_rate, tax_amount, total")
      .eq("id", (result as { saleId: string }).saleId)
      .single();
    expect({
      subtotal: Number(sale?.subtotal),
      discount: Number(sale?.discount_amount),
      tax_rate: Number(sale?.tax_rate),
      tax_amount: Number(sale?.tax_amount),
      total: Number(sale?.total),
    }).toEqual({
      subtotal: 20,
      discount: 2.5,
      tax_rate: 8.25,
      tax_amount: 1.44,
      total: 18.94,
    });
  });

  test("a rate outside 0-100 is refused by the RPC, not only the parser", async () => {
    currentSupabase = adminClient;
    // Straight to the RPC: the Server Action's parser would refuse these
    // first, and the point is that the database refuses them too.
    for (const rate of [-1, 100.5, 10000]) {
      const { error } = await adminClient.rpc("record_product_sale", {
        p_event_id: null,
        p_purchaser_person_id: null,
        p_payment_method: "cash",
        p_discount_amount: 0,
        p_sold_at: null,
        p_notes: `IT bad rate ${run}`,
        p_lines: [{ variant_id: variantId, quantity: 1 }],
        p_tax_rate: rate,
      });
      expect(error?.message, String(rate)).toBe("INVALID_TAX_RATE");
    }
    expect(await stockOf(variantId)).toBe(5);

    expect(await recordSaleAction(saleInput({ tax_rate: 101 }))).toEqual({
      error: "Tax rate must be between 0 and 100 percent.",
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

describe("line prices and custom lines (#1015)", () => {
  async function linesOf(saleId: string) {
    const { data, error } = await service
      .from("sale_line_items")
      .select(
        "description, product_variant_id, unit_price, list_price, quantity, line_total",
      )
      .eq("sale_id", saleId)
      .order("description");
    if (error) throw error;
    return data!.map((line) => ({
      ...line,
      unit_price: Number(line.unit_price),
      list_price: line.list_price === null ? null : Number(line.list_price),
      line_total: Number(line.line_total),
    }));
  }

  test("an override is charged, and the catalog price is snapshotted beside it", async () => {
    const before = await stockOf(variantId);
    const result = await record({
      lines: [{ variant_id: variantId, quantity: 2, unit_price: 4 }],
      tax_rate: 10,
    });
    expect(result).toEqual({
      success: true,
      saleId: expect.any(String),
      total: 8.8,
      receiptNumber: expect.any(Number),
    });

    const saleId = (result as { saleId: string }).saleId;
    expect(await linesOf(saleId)).toEqual([
      {
        description: `IT Sales Product ${run} — Plenty`,
        product_variant_id: variantId,
        // What was charged, and what the catalog said on the day. The
        // difference between the two is the whole record of the override --
        // there is no flag, and the client could not have set one.
        unit_price: 4,
        list_price: 10,
        quantity: 2,
        line_total: 8,
      },
    ]);

    const { data: sale } = await service
      .from("sales")
      .select("subtotal, tax_amount, total")
      .eq("id", saleId)
      .single();
    expect(Number(sale!.subtotal)).toBe(8);
    expect(Number(sale!.tax_amount)).toBe(0.8);
    // Stock follows the units, not the money.
    expect(await stockOf(variantId)).toBe(before - 2);
  });

  test("a price equal to the catalog price stores a line that is not overridden", async () => {
    const result = await record({
      lines: [{ variant_id: variantId, quantity: 1, unit_price: 10 }],
    });
    const [line] = await linesOf((result as { saleId: string }).saleId);
    expect(line.list_price).toBe(10);
    expect(line.unit_price).toBe(10);
  });

  test("a custom line is stored with no variant and moves no stock", async () => {
    const before = await stockOf(variantId);
    const result = await record({
      lines: [{ description: "Donated print", unit_price: 3.5, quantity: 2 }],
    });
    expect(result).toEqual({
      success: true,
      saleId: expect.any(String),
      total: 7,
      receiptNumber: expect.any(Number),
    });

    expect(await linesOf((result as { saleId: string }).saleId)).toEqual([
      {
        description: "Donated print",
        product_variant_id: null,
        unit_price: 3.5,
        list_price: null,
        quantity: 2,
        line_total: 7,
      },
    ]);
    expect(await stockOf(variantId)).toBe(before);
  });

  test("two custom lines that read the same are two lines", async () => {
    // `unique (sale_id, product_variant_id)` still stands; Postgres treats the
    // nulls as distinct, which is what lets a sale hold more than one.
    const result = await record({
      lines: [
        { description: "Raffle ticket", unit_price: 2, quantity: 1 },
        { description: "Raffle ticket", unit_price: 2, quantity: 1 },
      ],
    });
    expect(await linesOf((result as { saleId: string }).saleId)).toHaveLength(
      2,
    );
  });

  test("voiding a mixed sale returns the catalog units and nothing else", async () => {
    const before = await stockOf(variantId);
    const result = await record({
      lines: [
        { variant_id: variantId, quantity: 2, unit_price: 4 },
        { description: "Donated print", unit_price: 3.5, quantity: 1 },
      ],
    });
    const saleId = (result as { saleId: string }).saleId;
    expect(await stockOf(variantId)).toBe(before - 2);

    expect(await voidSaleAction(saleId, "Rung up twice")).toEqual({
      success: true,
    });
    expect(await stockOf(variantId)).toBe(before);
    // The lines are kept, custom one included.
    expect(await linesOf(saleId)).toHaveLength(2);
  });

  test("the same variant at two prices is refused", async () => {
    expect(
      await record({
        lines: [
          { variant_id: variantId, quantity: 1, unit_price: 4 },
          { variant_id: variantId, quantity: 1 },
        ],
      }),
    ).toEqual({
      error:
        "One item can only be sold at one price per sale. Record the second price as its own sale.",
    });
  });

  test("the RPC refuses a price the parser would have let through", async () => {
    // Straight at the RPC, because the Server Action's parser would catch these
    // first and the point is that the database does not rely on it.
    for (const unitPrice of [-1, 5.005, 100000000]) {
      const { error } = await adminClient.rpc("record_product_sale", {
        p_event_id: null,
        p_purchaser_person_id: null,
        p_payment_method: "cash",
        p_discount_amount: 0,
        p_sold_at: null,
        p_notes: `IT bad price ${run}`,
        p_lines: [
          { variant_id: variantId, quantity: 1, unit_price: unitPrice },
        ],
      });
      expect(error?.message).toBe("INVALID_UNIT_PRICE");
    }
  });

  test("the RPC refuses a custom line missing either half of itself", async () => {
    for (const line of [
      { unit_price: 3, quantity: 1 },
      { description: "   ", unit_price: 3, quantity: 1 },
      { description: "Coffee", quantity: 1 },
      { description: "x".repeat(121), unit_price: 3, quantity: 1 },
    ]) {
      const { error } = await adminClient.rpc("record_product_sale", {
        p_event_id: null,
        p_purchaser_person_id: null,
        p_payment_method: "cash",
        p_discount_amount: 0,
        p_sold_at: null,
        p_notes: `IT bad custom ${run}`,
        p_lines: [line],
      });
      expect(error?.message).toBe("INVALID_LINE");
    }
  });

  test("a catalog line may not bring its own description", async () => {
    const { error } = await adminClient.rpc("record_product_sale", {
      p_event_id: null,
      p_purchaser_person_id: null,
      p_payment_method: "cash",
      p_discount_amount: 0,
      p_sold_at: null,
      p_notes: `IT bad shape ${run}`,
      p_lines: [
        { variant_id: variantId, quantity: 1, description: "Smuggled" },
      ],
    });
    expect(error?.message).toBe("INVALID_LINE");
  });

  test("a line item still cannot be inserted directly, nullable column or not", async () => {
    const { error } = await adminClient.from("sale_line_items").insert({
      sale_id: SEEDED_SALE_IDS.completed,
      product_variant_id: null,
      description: "Smuggled",
      unit_price: 1,
      list_price: null,
      quantity: 1,
      line_total: 1,
    });
    expect(error?.code).toBe("42501");
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

    // #1016: a receipt number a holder could retype is not a number anyone can
    // be held to. It is outside the column grant like the money beside it.
    const receipt = await adminClient
      .from("sales")
      .update({ receipt_number: 9999 })
      .eq("id", SEEDED_SALE_IDS.completed);
    expect(receipt.error?.code).toBe("42501");
  });
});

describe("receipt numbers (#1016)", () => {
  async function receiptNumberOf(saleId: string): Promise<number> {
    const { data, error } = await service
      .from("sales")
      .select("receipt_number")
      .eq("id", saleId)
      .single();
    if (error) throw error;
    return Number(data.receipt_number);
  }

  test("the seeded sales carry the numbers the fixtures state", async () => {
    expect(await receiptNumberOf(SEEDED_SALE_IDS.completed)).toBe(
      SEEDED_SALE_RECEIPT_NUMBERS.completed,
    );
    expect(await receiptNumberOf(SEEDED_SALE_IDS.voided)).toBe(
      SEEDED_SALE_RECEIPT_NUMBERS.voided,
    );
  });

  test("two consecutive sales get consecutive numbers, and the action returns them", async () => {
    const first = await record();
    const second = await record();
    if (!("success" in first) || !("success" in second)) {
      throw new Error("both sales were expected to record");
    }

    expect(second.receiptNumber).toBe(first.receiptNumber + 1);
    // What the action returned is what the row actually holds -- it reads the
    // number back rather than being told it by the RPC.
    expect(await receiptNumberOf(first.saleId)).toBe(first.receiptNumber);
    expect(await receiptNumberOf(second.saleId)).toBe(second.receiptNumber);
  });

  test("two sales recorded at once get distinct numbers", async () => {
    // The same two-session shape as the oversell race above: one connection
    // would serialise them and prove nothing about the advisory lock.
    const financeClient = await signInAs(SEEDED_USERS.finance);
    const args = {
      p_event_id: null,
      p_purchaser_person_id: null,
      p_payment_method: "cash",
      p_discount_amount: 0,
      p_sold_at: null,
      p_notes: `IT receipt race ${run}`,
      p_lines: [{ variant_id: variantId, quantity: 1 }],
    };
    const [first, second] = await Promise.all([
      adminClient.rpc("record_product_sale", args),
      financeClient.rpc("record_product_sale", args),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const ids = [first, second].map(
      (outcome) => (outcome.data as { sale_id: string }[])[0].sale_id,
    );
    createdSaleIds.push(...ids);

    const numbers = await Promise.all(ids.map(receiptNumberOf));
    expect(new Set(numbers).size).toBe(2);
    // Consecutive, not merely distinct: the lock is what makes max()+1 mean
    // "the next one" rather than "some free one".
    expect(Math.abs(numbers[0] - numbers[1])).toBe(1);
  });

  test("voiding keeps the number, so the run has no gap in it", async () => {
    const recorded = await record();
    if (!("success" in recorded)) throw new Error("expected a sale");

    currentSupabase = adminClient;
    expect(await voidSaleAction(recorded.saleId, "returned")).toEqual({
      success: true,
    });
    expect(await receiptNumberOf(recorded.saleId)).toBe(recorded.receiptNumber);
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
      tax_rate: 8.25,
      lines: [{ variant_id: variantId, quantity: 1 }],
    });
    const saleId = (recorded as { saleId: string }).saleId;
    const afterSale = await stockOf(variantId);

    // Before the void the sale is in the rollup, tax and all (#997): net
    // amount and the tax beside it.
    const today = new Date().toISOString().slice(0, 10);
    const inRollup = async () => {
      const { data, error } = await adminClient.rpc("get_finance_report_data", {
        p_from: today,
        p_to: today,
      });
      if (error) throw error;
      const rows = (data as { sales: { amount: unknown; tax: unknown }[] })
        .sales;
      return rows.filter((row) => Number(row.amount) === 10);
    };
    const before = await inRollup();
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(before.map((row) => Number(row.tax))).toContain(0.83);

    currentSupabase = adminClient;
    expect(await voidSaleAction(saleId, "Rung up twice")).toEqual({
      success: true,
    });
    expect(await stockOf(variantId)).toBe(afterSale + 1);

    // The whole sale leaves the rollup with the void -- the tax is not
    // zeroed on the row, it just stops counting along with the rest.
    const { data: voided } = await service
      .from("sales")
      .select("tax_amount")
      .eq("id", saleId)
      .single();
    expect(Number(voided?.tax_amount)).toBe(0.83);
    expect((await inRollup()).length).toBe(before.length - 1);

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
    // Before the tenant itself: the file-wide afterAll runs later, and
    // `sales_tenant_id_fkey` would refuse the delete below with B's own sale
    // (#1016) still on it.
    await service.from("sales").delete().eq("tenant_id", tenantBId);

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

  test("tenant B's first sale is #1, however many A has rung up", async () => {
    currentSupabase = await signInAs(tenantBEmail);

    // A custom line (#1015) needs no catalog, which is what lets a tenant with
    // no products at all record its first sale here.
    const result = await recordSaleAction(
      saleInput({
        lines: [{ description: "First ever", unit_price: 5, quantity: 1 }],
      }),
    );
    if (!("success" in result)) throw new Error(JSON.stringify(result));
    createdSaleIds.push(result.saleId);

    // The point of the per-tenant lock rather than a shared sequence: B must
    // not be shown the gaps left by A's run.
    expect(result.receiptNumber).toBe(1);

    const { count } = await service
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantBId);
    expect(count).toBe(1);
  });
});
