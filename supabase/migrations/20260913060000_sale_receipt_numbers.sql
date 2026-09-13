-- #1016: every sale gets a human-readable receipt number (§5.22).
--
-- The register records a sale and shows a toast; nothing leaves the building
-- with the buyer. A receipt is rendered on demand from the row (the app half of
-- this issue), and the one thing it cannot render without is a number the buyer
-- can read back over the phone. A UUID fragment is not that.
--
-- Three decisions are baked in below.
--
-- **Sequential per tenant, not from a sequence.** A shared sequence would show
-- one tenant the gaps left by another's sales -- receipt #41 following #12 on a
-- tenant that has rung up thirteen things is a support call, not a cosmetic
-- flaw. `max(receipt_number) + 1` under a per-tenant advisory lock gives each
-- tenant its own unbroken run, and the `unique (tenant_id, receipt_number)`
-- below is what makes that claim enforceable rather than merely intended.
--
-- **Assigned by a `before insert` trigger, not inside `record_product_sale`.**
-- That function has been rewritten three times in three days (#997 tax, #1015
-- line prices) and has more rewrites coming. A trigger on the table survives
-- all of them, covers the seed's hand-written inserts, and needs no change to
-- the RPC's deadlock ordering.
--
-- **No lock cycle is possible.** The advisory lock is taken inside the `sales`
-- insert, and in `record_product_sale` that insert comes *after* the loop that
-- locks every variant in the sale in id order. So the acquisition order is
-- always (variants in id order, then the advisory lock) and never the reverse,
-- and `void_product_sale` inserts no sale, so it never takes this lock at all. Two
-- concurrent sales queue on the advisory lock in whatever order they reach it,
-- and neither is ever waiting on a variant lock the other has yet to take.
--
-- Voided sales keep their number and leave no gap: #7 exists, and it says
-- VOIDED across it. Reprinting it next year prints the same receipt.

-- The column ---------------------------------------------------------------

alter table public.sales add column receipt_number integer;

-- Backfill in the order the numbers would have been handed out, per tenant:
-- oldest sale first, id breaking a tie between two rung up in the same second
-- -- the same (sold_at, id) ordering the ledger's index is built on.
with numbered as (
  select id,
         row_number() over (
           partition by tenant_id order by sold_at, id
         ) as assigned
    from public.sales
)
update public.sales s
   set receipt_number = numbered.assigned
  from numbered
 where numbered.id = s.id;

alter table public.sales
  alter column receipt_number set not null,
  add constraint sales_receipt_number_positive check (receipt_number >= 1),
  add constraint sales_receipt_number_unique unique (tenant_id, receipt_number);

comment on column public.sales.receipt_number is
  'Human-readable receipt number, sequential per tenant from 1 and assigned by the assign_sale_receipt_number trigger (#1016). Shown as "#000123". Kept on void -- a voided sale leaves no gap. Not in the update grant: a number that could be retyped is not a number anyone can be held to.';

-- The trigger --------------------------------------------------------------

-- `security definer` so the max() below reads the tenant's whole run rather
-- than the subset the caller's RLS admits. Today every insert into `sales`
-- arrives through `record_product_sale`, which is itself definer, so this
-- changes no outcome; it means a later insert path cannot hand out a duplicate
-- because the caller could not see the row that already had the number. The
-- read is scoped to `new.tenant_id`, so widening the read widens it by exactly
-- one tenant.
create function public.assign_sale_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A number sent explicitly is honoured: the seed spells its two out so the
  -- fixtures and the e2e assertion are stable, and the backfill above numbered
  -- everything that predates this trigger. The unique constraint is what keeps
  -- an explicit number honest.
  if new.receipt_number is null then
    -- Held to the end of the transaction, so the max() below cannot be read by
    -- a second sale between this statement and the insert that uses it.
    perform pg_advisory_xact_lock(
      hashtext('sales.receipt_number:' || new.tenant_id::text)
    );
    new.receipt_number := coalesce(
      (select max(receipt_number)
         from public.sales
        where tenant_id = new.tenant_id),
      0
    ) + 1;
  end if;

  return new;
end;
$$;

comment on function public.assign_sale_receipt_number() is
  'Assigns sales.receipt_number: max + 1 per tenant, under a per-tenant advisory lock taken after record_product_sale''s id-ordered variant locks (#1016).';

create trigger assign_sale_receipt_number
  before insert on public.sales
  for each row execute function public.assign_sale_receipt_number();

-- A trigger function is never called directly, and on the hosted database a
-- new function in `public` arrives with EXECUTE granted to both client roles
-- (20260912040000). Nothing is lost by taking it back: the trigger itself runs
-- as the table owner regardless.
revoke execute on function public.assign_sale_receipt_number() from public, anon, authenticated;
