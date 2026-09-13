-- #997: sales tax on the point-of-sale register (§5.22) -- part 2 of 3, the
-- RPC.
--
-- `record_product_sale` gains `p_tax_rate` and computes `tax_amount` itself
-- from that rate and its own catalog-priced subtotal, net of discount. The
-- body is otherwise 20260911050000's, unchanged -- including the id-ordered
-- `product_variants` lock that file's header establishes as the invariant
-- for every function that moves stock.
--
-- A new argument is a new signature, so the old one is dropped in the same
-- statement batch: PostgREST resolves an RPC by name and the named arguments
-- it is given, and two overloads that both accept the register's seven
-- arguments would leave it unable to choose. `p_tax_rate` carries a default
-- rather than being required, so a caller written before this migration --
-- every direct `.rpc()` call in the integration suites -- still resolves to
-- the one function and records an untaxed sale, which is what a rate of 0
-- means.
--
-- `void_product_sale` needs no change: a void does not zero anything, it
-- just stops counting, and a voided sale's tax leaves the rollup with the
-- rest of it (20260913030000).
--
-- Error codes stay SCREAMING_SNAKE, and INVALID_TAX_RATE joins the set the
-- register phrases in `saleRpcErrorMessage`.

drop function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb);

-- `p_lines` is `[{ "variant_id": uuid, "quantity": int }]`, as before.
create or replace function public.record_product_sale(
  p_event_id uuid,
  p_purchaser_person_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_sold_at timestamptz,
  p_notes text,
  p_lines jsonb,
  p_tax_rate numeric default 0
)
returns table (sale_id uuid, subtotal numeric, tax numeric, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_line jsonb;
  v_quantity numeric;
  -- Merged lines, both ordered by variant id: the lock order below, and what
  -- the insert and the stock update unnest in step.
  v_ids uuid[];
  v_quantities integer[];
  v_variant record;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2);
  -- Percent, three decimals, as sales.tax_rate stores it.
  v_rate numeric(6,3);
  v_tax numeric(10,2);
  v_sale_id uuid;
begin
  if not public.has_permission('sales', 'manage') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_payment_method is null or p_payment_method not in
     ('cash', 'check', 'card', 'bank_transfer', 'online', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  v_discount := coalesce(p_discount_amount, 0);
  if v_discount < 0 then
    raise exception 'INVALID_DISCOUNT';
  end if;

  -- A null rate reads as "no tax", the same way a null discount reads as
  -- none; the register always sends one, seeded from the org default. Checked
  -- on the argument rather than after the assignment: numeric(6,3) would
  -- raise a numeric-overflow on 10000 before the range check could name it.
  if coalesce(p_tax_rate, 0) < 0 or coalesce(p_tax_rate, 0) > 100 then
    raise exception 'INVALID_TAX_RATE';
  end if;
  v_rate := coalesce(p_tax_rate, 0);

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'LINES_REQUIRED';
  end if;

  -- Shape first, before any cast that could fail with a Postgres message
  -- instead of a code the register knows how to phrase.
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if v_line ->> 'variant_id' is null
       or (v_line ->> 'variant_id') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or jsonb_typeof(v_line -> 'quantity') <> 'number' then
      raise exception 'INVALID_LINE';
    end if;
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity < 1 or v_quantity <> trunc(v_quantity) then
      raise exception 'INVALID_LINE';
    end if;
  end loop;

  -- The same variant twice is one line of quantity 2, not two lines: the
  -- unique (sale_id, product_variant_id) on sale_line_items says so, and a
  -- register that lets someone tap a tile twice would otherwise hand this a
  -- payload the insert refuses.
  select array_agg(merged.variant_id order by merged.variant_id),
         array_agg(merged.quantity order by merged.variant_id)
    into v_ids, v_quantities
  from (
    select (l ->> 'variant_id')::uuid as variant_id,
           sum((l ->> 'quantity')::integer)::integer as quantity
      from jsonb_array_elements(p_lines) as l
     group by 1
  ) as merged;

  -- Both foreign keys are optional -- a table at an event with no purchaser
  -- named is the common case -- so each is only checked when it is given.
  -- Scoped to the caller's tenant, so another tenant's id reads as absent
  -- rather than as a row nobody may see.
  if p_event_id is not null and not exists (
    select 1 from public.events e
     where e.id = p_event_id and e.tenant_id = v_tenant_id
  ) then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_purchaser_person_id is not null and not exists (
    select 1 from public.people pe
     where pe.id = p_purchaser_person_id and pe.tenant_id = v_tenant_id
  ) then
    raise exception 'PERSON_NOT_FOUND';
  end if;

  -- A variant that does not exist (or belongs to another tenant) is found
  -- here rather than by the locking query below, because `for update` cannot
  -- be applied to the nullable side of an outer join -- the one shape that
  -- would report a miss and take the locks in a single statement.
  if exists (
    select 1
      from unnest(v_ids) as wanted(id)
     where not exists (
       select 1 from public.product_variants v
        where v.id = wanted.id and v.tenant_id = v_tenant_id
     )
  ) then
    raise exception 'VARIANT_NOT_FOUND';
  end if;

  -- The lock, in id order. `for update of v` takes the row lock on the
  -- variants only; `products` is joined for the name and the active flag and
  -- is not locked, since nothing here writes it. The stock each row reports is
  -- the committed value as of acquiring the lock, which is what makes the
  -- check below hold against a concurrent sale of the same last unit: the
  -- second caller waits here and then reads the decremented figure.
  for v_variant in
    select v.id, v.label, v.price, v.stock_on_hand,
           v.is_active as variant_active,
           p.name as product_name, p.is_active as product_active
      from public.product_variants v
      join public.products p
        on p.tenant_id = v.tenant_id and p.id = v.product_id
     where v.tenant_id = v_tenant_id and v.id = any(v_ids)
     order by v.id
       for update of v
  loop
    v_quantity := v_quantities[array_position(v_ids, v_variant.id)];

    -- Retiring a product is how a tenant takes it off the register, so
    -- selling one is a mistake whichever level it was retired at.
    if not v_variant.variant_active or not v_variant.product_active then
      raise exception 'VARIANT_INACTIVE'
        using detail = format('%s — %s', v_variant.product_name, v_variant.label);
    end if;

    if v_variant.stock_on_hand < v_quantity then
      raise exception 'INSUFFICIENT_STOCK'
        using detail = format(
          '%s — %s: %s on hand',
          v_variant.product_name, v_variant.label, v_variant.stock_on_hand
        );
    end if;

    v_subtotal := v_subtotal + v_variant.price * v_quantity;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'DISCOUNT_EXCEEDS_SUBTOTAL';
  end if;

  -- Tax-exclusive, on the net of discount: the base is what the buyer
  -- actually paid for the goods, and rounding happens once, to the cent, on
  -- the whole sale rather than per line. Derived here and nowhere else --
  -- the client sends a rate and never an amount (#997).
  v_tax := round((v_subtotal - v_discount) * v_rate / 100, 2);

  -- tenant_id is left to the column default (the caller's current tenant),
  -- which is what every insert through a definer RPC in this schema does; the
  -- composite foreign keys are what would refuse a reference out of tenant if
  -- a check above were ever missed.
  insert into public.sales (
    event_id, purchaser_person_id, sold_at, payment_method,
    subtotal, discount_amount, tax_rate, tax_amount, total, notes
  )
  values (
    p_event_id, p_purchaser_person_id, coalesce(p_sold_at, now()), p_payment_method,
    v_subtotal, v_discount, v_rate, v_tax, v_subtotal - v_discount + v_tax,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_sale_id;

  -- description and unit_price are snapshots: a rename or a reprice next
  -- season must not rewrite what this receipt says was sold.
  insert into public.sale_line_items (
    sale_id, product_variant_id, description, unit_price, quantity, line_total
  )
  select v_sale_id, v.id, p.name || ' — ' || v.label, v.price,
         line.quantity, v.price * line.quantity
    from unnest(v_ids, v_quantities) as line(variant_id, quantity)
    join public.product_variants v
      on v.id = line.variant_id and v.tenant_id = v_tenant_id
    join public.products p
      on p.tenant_id = v.tenant_id and p.id = v.product_id;

  update public.product_variants v
     set stock_on_hand = v.stock_on_hand - line.quantity,
         updated_by = auth.uid()
    from unnest(v_ids, v_quantities) as line(variant_id, quantity)
   where v.id = line.variant_id and v.tenant_id = v_tenant_id;

  return query select v_sale_id, v_subtotal, v_tax, v_subtotal - v_discount + v_tax;
end;
$$;

comment on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb, numeric) is
  'Records one point-of-sale transaction and decrements stock, in one transaction (#908). Computes tax from p_tax_rate on the discounted subtotal and snapshots both on the sale (#997). Locks variants in id order; any other function that moves stock must do the same.';

-- Stated explicitly rather than left to Postgres's defaults, as in
-- 20260911050000: `execute` on a new function is granted to public, and this
-- one is `security definer`.
revoke all on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb, numeric) from public;
grant execute on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb, numeric) to authenticated;
