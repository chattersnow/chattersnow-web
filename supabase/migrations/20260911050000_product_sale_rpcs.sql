-- #908: the two RPCs that own a sale -- part 2 of the phase-1 point-of-sale
-- module (Finance > Sales).
--
-- Part 1 (20260911040000) gave `sales` and `sale_line_items` a select policy,
-- a column-limited update on `sales`, and no insert or delete path at all.
-- These are that missing path. Every write that moves
-- `product_variants.stock_on_hand` happens in here, in one transaction with
-- the rows it is accounting for, which is the whole reason the tables are
-- unwritable from PostgREST.
--
-- (Part 1's comments call them `record_sale` / `void_sale`. The names that
-- shipped are `record_product_sale` / `void_product_sale` -- `record_sale` is
-- ambiguous next to `record_giveaway_ticket_sale` and
-- `record_event_distribution`, and a function name is read far more often in a
-- `.rpc()` call than in the migration that created it.)
--
-- Phase 1 is record-only: payment is taken outside the system and the portal
-- records that it happened. So there is no payment state machine here -- a
-- sale is `completed` the moment it is recorded, and the only transition is to
-- `voided`.
--
-- **Error codes are machine-readable on purpose.** Both functions raise
-- SCREAMING_SNAKE codes rather than sentences: the register renders a sentence
-- of its own per code (`saleRpcErrorMessage` in sales-shared.tsx), which keeps
-- the wording a product decision rather than a migration's. The one place a
-- message carries data is INSUFFICIENT_STOCK, whose `detail` names the variant
-- and how many are actually on hand -- a cashier standing at a table needs to
-- know which of four lines to reduce, and to what.
--
-- **Deadlock note, and the invariant this file establishes: variants are
-- locked in id order.** Two sales that share two variants in opposite order
-- would otherwise each hold what the other needs. Both functions below sort by
-- `product_variants.id` before taking a row lock, and any future function that
-- moves stock -- a stock-adjust RPC, a transfer, a bulk import -- must do the
-- same.

-- Record ----------------------------------------------------------------------

-- `p_lines` is `[{ "variant_id": uuid, "quantity": int }]`. jsonb rather than
-- two arrays or a composite type: PostgREST maps a jsonb argument from the
-- Server Action's own object without a bespoke type the client would have to
-- know about, which is how submit_artwork (20260909040000) takes its images.
create or replace function public.record_product_sale(
  p_event_id uuid,
  p_purchaser_person_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_sold_at timestamptz,
  p_notes text,
  p_lines jsonb
)
returns table (sale_id uuid, subtotal numeric, total numeric)
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

  -- tenant_id is left to the column default (the caller's current tenant),
  -- which is what every insert through a definer RPC in this schema does; the
  -- composite foreign keys are what would refuse a reference out of tenant if
  -- a check above were ever missed.
  insert into public.sales (
    event_id, purchaser_person_id, sold_at, payment_method,
    subtotal, discount_amount, total, notes
  )
  values (
    p_event_id, p_purchaser_person_id, coalesce(p_sold_at, now()), p_payment_method,
    v_subtotal, v_discount, v_subtotal - v_discount,
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

  return query select v_sale_id, v_subtotal, v_subtotal - v_discount;
end;
$$;

comment on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb) is
  'Records one point-of-sale transaction and decrements stock, in one transaction (#908). Locks variants in id order; any other function that moves stock must do the same.';

-- Stated explicitly rather than left to Postgres's defaults: `execute` on a new
-- function is granted to public, and this one is `security definer`, so without
-- the revoke `anon` could call it -- the has_permission check inside would
-- refuse, but the grant layer would have said yes.
revoke all on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb) from public;
grant execute on function public.record_product_sale(uuid, uuid, text, numeric, timestamptz, text, jsonb) to authenticated;

-- Void ------------------------------------------------------------------------

-- Voided, never deleted: the row stays, `status` says it does not count, and
-- who voided it and why stay attached. Line items are kept for the same
-- reason -- a void that erased what was in the sale would leave no way to
-- check the stock that came back.
create or replace function public.void_product_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_status text;
begin
  if not public.has_permission('sales', 'manage') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select s.status into v_status
    from public.sales s
   where s.id = p_sale_id and s.tenant_id = v_tenant_id
     for update;

  if not found then
    raise exception 'SALE_NOT_FOUND';
  end if;

  -- Not an error worth a different shape: two operators reaching for the same
  -- mistake is ordinary, and the second one needs to be told the stock has
  -- already come back rather than to put it back twice.
  if v_status = 'voided' then
    raise exception 'SALE_ALREADY_VOIDED';
  end if;

  -- In id order, the same as record_product_sale. Taken as its own statement
  -- so the ordering is visible, rather than riding on whatever plan the update
  -- below happens to get.
  perform 1
    from public.product_variants v
   where v.tenant_id = v_tenant_id
     and v.id in (
       select li.product_variant_id
         from public.sale_line_items li
        where li.sale_id = p_sale_id and li.tenant_id = v_tenant_id
     )
   order by v.id
     for update;

  update public.product_variants v
     set stock_on_hand = v.stock_on_hand + li.quantity,
         updated_by = auth.uid()
    from public.sale_line_items li
   where li.sale_id = p_sale_id
     and li.tenant_id = v_tenant_id
     and v.id = li.product_variant_id
     and v.tenant_id = v_tenant_id;

  update public.sales s
     set status = 'voided',
         voided_at = now(),
         voided_by = auth.uid(),
         void_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by = auth.uid()
   where s.id = p_sale_id and s.tenant_id = v_tenant_id;
end;
$$;

comment on function public.void_product_sale(uuid, text) is
  'Voids a sale and returns its units to stock (#908). The row and its line items are kept; status, voided_at/by and void_reason record the reversal.';

revoke all on function public.void_product_sale(uuid, text) from public;
grant execute on function public.void_product_sale(uuid, text) to authenticated;
