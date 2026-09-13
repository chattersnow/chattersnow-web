-- #997: sales tax on the point-of-sale register (§5.22) -- part 1 of 3, the
-- schema.
--
-- A sale was `subtotal - discount = total`. An org selling merchandise at an
-- event collects tax and has to remit it, so the register must compute it,
-- the ledger must record it, and Financial Reports must not mistake it for
-- income. Three decisions, all settled in the issue:
--
--   1. Rate source -- one org-wide default in `app_settings`
--      (`finance.sales_tax_rate`), prefilled at the register and editable per
--      sale.
--   2. Model -- tax-exclusive: variant prices are pre-tax, tax is computed on
--      `subtotal - discount` and added on top.
--   3. Reporting -- collected tax is NOT income. It is money held for the
--      state; the Merchandise line stays net (part 3, 20260913030000) and tax
--      is reported as its own figure.
--
-- `tax_amount` is derived, never typed: the cashier picks a *rate* and
-- `record_product_sale` (part 2, 20260913020000) computes the amount from
-- that rate and its own catalog-priced subtotal, exactly as it already
-- refuses to trust client-side line prices. The rate is snapshotted on the
-- sale for the same reason `sale_line_items.unit_price` is -- a rate change
-- next quarter must not rewrite a past receipt.
--
-- Out of scope, as in phase 1: multiple jurisdictions, per-product
-- taxability flags, and tax on anything other than merchandise sales.

-- Columns ----------------------------------------------------------------------

-- Percent, not a fraction, to match what a cashier reads off a rate table:
-- 8.25 means 8.25%. Three decimals because combined state/county/city rates
-- are commonly quoted to the thousandth (e.g. 8.375). Existing rows backfill
-- to 0 and stay valid under every constraint below.
alter table public.sales
  add column tax_rate numeric(6,3) not null default 0
    constraint sales_tax_rate_is_percent check (tax_rate >= 0 and tax_rate <= 100),
  add column tax_amount numeric(10,2) not null default 0
    constraint sales_tax_amount_non_negative check (tax_amount >= 0);

comment on column public.sales.tax_rate is
  'Sales tax rate applied to this sale, as a percent (8.25 = 8.25%). Snapshotted at the register from the org default (app_settings finance.sales_tax_rate) or the cashier''s override, so a later rate change cannot rewrite a past receipt (#997).';
comment on column public.sales.tax_amount is
  'Tax collected on this sale, computed by record_product_sale as round((subtotal - discount_amount) * tax_rate / 100, 2) -- never typed. Held for remittance, not income: Financial Reports count total - tax_amount (#997).';

-- The total now includes tax. `sales_discount_within_subtotal` is unchanged:
-- the discount is still bounded by the pre-tax subtotal.
alter table public.sales
  drop constraint sales_total_is_subtotal_less_discount,
  add constraint sales_total_is_net_plus_tax
    check (total = subtotal - discount_amount + tax_amount);

-- The org default ---------------------------------------------------------------

-- Seeded per tenant, as docs/tenants.md ("Writing migrations on a multi-tenant
-- database") requires: a migration runs with no tenant in scope, so an
-- unscoped insert would fail on tenant_id's not-null. Every existing tenant
-- (Chatter Snow, the platform tenant and the demo) starts at 0 -- no tax is
-- collected until an administrator says otherwise. New tenants need nothing
-- here: provision_tenant() already copies every `finance.%` key from the
-- template tenant.
insert into public.app_settings (tenant_id, key, value)
select t.id, 'finance.sales_tax_rate', to_jsonb(0)
from public.tenants t
on conflict (tenant_id, key) do nothing;

-- The view -----------------------------------------------------------------------

-- Modelled on public.org_fiscal_year and needed for the same reason:
-- app_settings' select policy admits only six `manage` permissions, and a
-- `sales:manage` holder running the register may hold none of them. This
-- hands that one key to any signed-in member without widening the policy's
-- OR-chain, and without handing out the approval thresholds alongside it.
--
-- Family B of the definer-view pattern (#887, 20260911010000): isolation is
-- tenant_id = current_tenant_id() in the body, which is what
-- tenant_isolation_gaps() looks for.
create view public.org_sales_tax
with (security_barrier = true) as
select (value #>> '{}')::numeric as rate
from public.app_settings
where key = 'finance.sales_tax_rate'
  and tenant_id = (select public.current_tenant_id());

comment on view public.org_sales_tax is
  'The current tenant''s default sales tax rate, as a percent, for the register (#997). Security definer by design (#887): the audience is any signed-in member holding sales:manage, not only the `manage` holders app_settings'' select policy admits -- same reasoning as org_fiscal_year. Isolation is tenant_id = current_tenant_id().';

-- Authenticated only: nothing on the public site prices merchandise. Stated
-- explicitly rather than left to the defaults so the view can never gain a
-- write path -- tenant_isolation_gaps() refuses one (`view_grant`).
grant select on public.org_sales_tax to authenticated;
revoke insert, update, delete on public.org_sales_tax from anon, authenticated, public;
