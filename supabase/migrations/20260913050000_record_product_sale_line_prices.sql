-- #1015: a line's price may be overridden, and a sale may carry an item that is
-- not in the catalog at all (§5.22) -- part 2 of 2, the RPC.
--
-- `record_product_sale` no longer prices *every* line from the catalog. It
-- prices every **catalog** line from the catalog, as before, and snapshots that
-- figure as `list_price`; if the client also sent a `unit_price` for that line,
-- the RPC validates it and charges it. A **custom** line -- one with no
-- `variant_id` -- carries its own `description` and `unit_price`, has no
-- `list_price`, locks nothing and moves no stock.
--
-- The client still cannot assert what a line is worth without being checked.
-- It can only propose a number, which is validated here (>= 0, two decimals,
-- inside numeric(10,2)) against a catalog price this function looked up itself.
-- "Overridden" is derived from the two figures, never sent. No new permission:
-- a `sales:manage` holder can already reprice any variant under Products, so an
-- override grants nothing they did not already have, and `sale_line_items` is
-- audited unredacted, so who charged what, and against what list price, is in
-- the audit log without a reason column.
--
-- The body is otherwise 20260913020000's, including its tax arithmetic. The
-- signature is unchanged -- the same eight arguments, `p_tax_rate` still
-- defaulted -- so this is a plain `create or replace` with no `drop function`
-- and no PostgREST overload to resolve.
--
-- **The deadlock invariant this schema runs on is unchanged: variants are
-- locked in id order.** Custom lines are not variants and take no lock at all,
-- so they cannot participate in a cycle.
--
-- INVALID_UNIT_PRICE joins the SCREAMING_SNAKE set `saleRpcErrorMessage`
-- phrases, and carries the offending line in `detail` the way
-- INSUFFICIENT_STOCK does -- a cashier with four lines needs to know which one.

-- `p_lines` is `[{ "variant_id": uuid, "quantity": int, "unit_price"?: number }]`
-- for a catalog line and
-- `[{ "quantity": int, "unit_price": number, "description": text }]` for a
-- custom one. A line is a catalog line exactly when `variant_id` reads as
-- non-null, so an explicit JSON null means the same as an absent key.
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
  v_price numeric;
  v_description text;
  -- Merged catalog lines, all three ordered by variant id: the lock order
  -- below, and what the insert and the stock update unnest in step. A null in
  -- v_overrides means "no override sent", which is what coalesce reads as the
  -- catalog price.
  v_ids uuid[];
  v_quantities integer[];
  v_overrides numeric(10,2)[];
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
    if jsonb_typeof(v_line -> 'quantity') <> 'number' then
      raise exception 'INVALID_LINE';
    end if;
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity < 1 or v_quantity <> trunc(v_quantity) then
      raise exception 'INVALID_LINE';
    end if;

    if v_line ->> 'variant_id' is not null then
      -- A catalog line. Its description is this function's to compose from the
      -- product and the variant, so a client sending one is confused about
      -- which kind of line it is building, not merely verbose.
      if (v_line ->> 'variant_id') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         or v_line ->> 'description' is not null then
        raise exception 'INVALID_LINE';
      end if;
    else
      -- A custom line. Both of the things a catalog lookup would have supplied
      -- have to come with it, or there is nothing to charge and nothing to put
      -- on the receipt.
      v_description := btrim(coalesce(v_line ->> 'description', ''));
      if v_description = '' or char_length(v_description) > 120
         or v_line ->> 'unit_price' is null then
        raise exception 'INVALID_LINE';
      end if;
    end if;

    -- `->>` rather than `->`, so an explicit JSON null reads as absent, the
    -- same way variant_id does.
    if v_line ->> 'unit_price' is not null then
      if jsonb_typeof(v_line -> 'unit_price') <> 'number' then
        raise exception 'INVALID_UNIT_PRICE'
          using detail = coalesce(v_line ->> 'description', v_line ->> 'variant_id');
      end if;
      v_price := (v_line ->> 'unit_price')::numeric;
      -- Two decimals and inside numeric(10,2): checked here rather than left to
      -- the column, so an over-long fraction or an absurd figure comes back as
      -- a code the register can phrase instead of a Postgres overflow.
      if v_price < 0 or v_price <> round(v_price, 2) or v_price >= 100000000 then
        raise exception 'INVALID_UNIT_PRICE'
          using detail = coalesce(v_line ->> 'description', v_line ->> 'variant_id');
      end if;
    end if;
  end loop;

  -- One price per item per sale. Two of the same beanie at two prices is two
  -- sales: a line carries one price for its whole quantity, and relaxing that
  -- would mean two rows for one variant, which is exactly what makes the void
  -- restore a one-row-per-variant join.
  if exists (
    select 1
      from (
        select count(distinct coalesce(l ->> 'unit_price', '')) as price_count
          from jsonb_array_elements(p_lines) as l
         where l ->> 'variant_id' is not null
         group by (l ->> 'variant_id')::uuid
      ) as grouped
     where grouped.price_count > 1
  ) then
    raise exception 'INVALID_LINE' using detail = 'one price per item per sale';
  end if;

  -- The same variant twice is one line of quantity 2, not two lines: the
  -- unique (sale_id, product_variant_id) on sale_line_items says so, and a
  -- register that lets someone tap a tile twice would otherwise hand this a
  -- payload the insert refuses. Custom lines are excluded here and stay one
  -- row each -- two different donated things at $5 are two lines, and the
  -- unique constraint treats their null variant ids as distinct.
  --
  -- coalesce to '{}': an all-custom sale merges nothing, and array_agg over no
  -- rows is null, which unnest would refuse further down.
  select coalesce(array_agg(merged.variant_id order by merged.variant_id), '{}'::uuid[]),
         coalesce(array_agg(merged.quantity order by merged.variant_id), '{}'::integer[]),
         coalesce(array_agg(merged.unit_price order by merged.variant_id), '{}'::numeric(10,2)[])
    into v_ids, v_quantities, v_overrides
  from (
    select (l ->> 'variant_id')::uuid as variant_id,
           sum((l ->> 'quantity')::integer)::integer as quantity,
           -- Every row of the group agrees on this, or the check above has
           -- already raised; min() is just how one value is taken from a group.
           min((l ->> 'unit_price')::numeric(10,2)) as unit_price
      from jsonb_array_elements(p_lines) as l
     where l ->> 'variant_id' is not null
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
  --
  -- Custom lines are nowhere in this loop: they lock nothing, so they cannot
  -- widen the set of rows a transaction holds and cannot deadlock against
  -- another sale.
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

    -- The charged price: the override if one was sent and validated, else the
    -- catalog price this function just read under lock.
    v_subtotal := v_subtotal
      + coalesce(v_overrides[array_position(v_ids, v_variant.id)], v_variant.price)
        * v_quantity;
  end loop;

  -- Custom lines have no catalog side, so their contribution is simply what
  -- the cashier typed, already validated above.
  select v_subtotal + coalesce(sum(
           (l ->> 'unit_price')::numeric(10,2) * (l ->> 'quantity')::integer
         ), 0)
    into v_subtotal
  from jsonb_array_elements(p_lines) as l
  where l ->> 'variant_id' is null;

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

  -- description, list_price and unit_price are snapshots: a rename or a
  -- reprice next season must not rewrite what this receipt says was sold, for
  -- how much, or what it would have cost at the till price of the day.
  insert into public.sale_line_items (
    sale_id, product_variant_id, description, list_price, unit_price,
    quantity, line_total
  )
  select v_sale_id, v.id, p.name || ' — ' || v.label, v.price,
         coalesce(line.unit_price, v.price),
         line.quantity, coalesce(line.unit_price, v.price) * line.quantity
    from unnest(v_ids, v_quantities, v_overrides)
      as line(variant_id, quantity, unit_price)
    join public.product_variants v
      on v.id = line.variant_id and v.tenant_id = v_tenant_id
    join public.products p
      on p.tenant_id = v.tenant_id and p.id = v.product_id;

  -- Custom lines: no variant, so no list price and nothing to join to.
  insert into public.sale_line_items (
    sale_id, product_variant_id, description, list_price, unit_price,
    quantity, line_total
  )
  select v_sale_id, null, btrim(l ->> 'description'), null,
         (l ->> 'unit_price')::numeric(10,2),
         (l ->> 'quantity')::integer,
         (l ->> 'unit_price')::numeric(10,2) * (l ->> 'quantity')::integer
    from jsonb_array_elements(p_lines) as l
   where l ->> 'variant_id' is null;

  -- Catalog lines only, which is what v_ids holds. A custom line sells
  -- something that was never counted, so there is nothing to decrement.
  update public.product_variants v
     set stock_on_hand = v.stock_on_hand - line.quantity,
         updated_by = auth.uid()
    from unnest(v_ids, v_quantities) as line(variant_id, quantity)
   where v.id = line.variant_id and v.tenant_id = v_tenant_id;

  return query select v_sale_id, v_subtotal, v_tax, v_subtotal - v_discount + v_tax;
end;
$$;

comment on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb, numeric) is
  'Records one point-of-sale transaction and decrements stock, in one transaction (#908). Prices catalog lines from the catalog, accepts a validated per-line override and snapshots the list price beside it, and stores custom lines with no variant and no stock movement (#1015). Computes tax from p_tax_rate on the discounted subtotal (#997). Locks variants in id order; any other function that moves stock must do the same.';

-- Stated explicitly rather than left to Postgres's defaults, as in
-- 20260911050000: `execute` on a new function is granted to public, and this
-- one is `security definer`.
revoke all on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb, numeric) from public;
grant execute on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb, numeric) to authenticated;
