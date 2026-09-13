import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSalesTaxRate } from "@/lib/sales-tax";
import { Button } from "@/components/ui/button";
import { SalesRegister } from "./sales-register";
import type { RegisterEvent, RegisterVariant } from "./register-cart";

export const metadata: Metadata = {
  title: "Sales Register",
};

/** Days either side of today an event may start and still be worth offering. */
const PAST_WINDOW_DAYS = 90;
const FUTURE_WINDOW_DAYS = 120;

type ProductWithVariants = {
  id: string;
  name: string;
  sort_order: number;
  product_variants: {
    id: string;
    label: string;
    price: number | string;
    stock_on_hand: number;
    is_active: boolean;
    sort_order: number;
  }[];
};

export default async function SalesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const eventParam = Array.isArray(params.event)
    ? params.event[0]
    : params.event;

  // `new Date()` rather than `Date.now()`: the React Compiler's purity rule
  // rejects the latter in a render, and every other server page in the portal
  // reads the clock this way.
  const now = new Date().getTime();
  const from = new Date(now - PAST_WINDOW_DAYS * 86_400_000).toISOString();
  const to = new Date(now + FUTURE_WINDOW_DAYS * 86_400_000).toISOString();

  const [{ data: products }, { data: events }, defaultTaxRate] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, sort_order, product_variants(id, label, price, stock_on_hand, is_active, sort_order)",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      // A narrow window rather than every event the tenant has ever run: the
      // select is a picker somebody uses standing up, and a merch table belongs
      // to something happening around now.
      //
      // `completed` is in the filter as well as `published` because yesterday's
      // takings are often typed up the morning after, by which point the event
      // has been marked completed. Draft, cancelled and archived are not:
      // nothing is sold at an event in any of those states.
      supabase
        .from("events")
        .select("id, name, starts_at, ends_at")
        .in("status", ["published", "completed"])
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at"),
      // The org default, prefilled on every sale and editable per sale (#997).
      // Read through org_sales_tax so a cashier holding only sales:manage gets
      // it without app_settings access.
      getSalesTaxRate(supabase),
    ]);

  // Flattened to variants, because a variant is what the register sells and
  // what a line item references. Inactive variants of an active product are
  // dropped here rather than filtered in the query: PostgREST cannot filter an
  // embedded resource without also dropping its parent.
  const variants: RegisterVariant[] = (
    (products ?? []) as ProductWithVariants[]
  ).flatMap((product) =>
    [...(product.product_variants ?? [])]
      .filter((variant) => variant.is_active)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.label.localeCompare(b.label, undefined, { numeric: true }),
      )
      .map((variant) => ({
        id: variant.id,
        productId: product.id,
        productName: product.name,
        label: variant.label,
        price: variant.price,
        stockOnHand: variant.stock_on_hand,
      })),
  );

  // camelCase at the boundary, so register-cart.ts -- which is pure, unit
  // tested and knows nothing about PostgREST -- never sees a column name.
  const registerEvents: RegisterEvent[] = (
    (events ?? []) as {
      id: string;
      name: string;
      starts_at: string;
      ends_at: string | null;
    }[]
  ).map((event) => ({
    id: event.id,
    name: event.name,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
  }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Register
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <Button
          variant="outline"
          // A Link renders an <a>, and Base UI's Button logs a console error
          // unless it is told it is not rendering a native <button>.
          nativeButton={false}
          render={<Link href="/portal/finance/sales" />}
        >
          Sales ledger
        </Button>
      </div>

      <p className="app-muted mt-4 text-sm">
        Payment is taken outside the system — card reader, cash box or app. This
        records what was sold and how it was paid, and takes the items out of
        stock.
      </p>

      <div className="mt-6">
        <SalesRegister
          variants={variants}
          events={registerEvents}
          defaultEventId={eventParam}
          defaultTaxRate={defaultTaxRate}
        />
      </div>
    </>
  );
}
