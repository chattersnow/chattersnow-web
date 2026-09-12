-- #989: three rows of the module catalog describe a product that has since
-- moved. The catalog is what an operator reads in Platform > Modules when
-- deciding what a tenant is being sold (`tenant-modules-dialog.tsx` renders
-- `label` and `description` next to each switch), so a stale row is not a
-- cosmetic problem -- it is the wrong answer to "what does this come with?".
--
-- Seeded by 20260910010000. An `update` rather than an edit to that file: it
-- has already run on the hosted project, and a migration is a statement about
-- what changes, not a place to revise history.
--
-- `public.modules` carries neither `set_updated_at` nor `audit_log_row`, so
-- unlike the content backfill in 20260912050000 there are no triggers to take
-- off first. Nothing else stores a copy: `plan_modules` and `tenant_modules`
-- hold `(module_key, enabled)` and read the label through the foreign key.

-- 1. Finance claimed grants, which are Governance's, and never mentioned
--    Sales, which is three of its own pages.
--
--    Grants was the inconsistency that prompted this: the catalog said grants
--    come with Finance while `/portal/governance/grants` is gated on
--    `governance:manage`, and #987's research settled that the page stays in
--    Governance -- it is a pipeline with an application, a deadline and a
--    reporting obligation, not a ledger. `board` holds `governance:manage`
--    with `finance: none`, so a board member reaches Grants today and would
--    have lost it had the catalog been treated as the source of truth.
--
--    Sales is the other half of the drift, in the opposite direction: the
--    `sales` resource was added to this module by 20260911040000, months after
--    this description was written, and brought the ledger, the point-of-sale
--    register and the product catalog with it.
update public.modules
set description = 'Donations, sales, expenses, revenue, approvals and finance reporting.'
where key = 'finance';

-- 2. Governance never named the two pipelines it owns.
--
--    The same sentence from the other side: with grants removed from Finance
--    above, an operator reading the catalog end to end would have found the
--    word nowhere at all. Partnerships was never listed either. The order
--    follows the section's own headings since #987 -- board proceedings, then
--    standing obligations, then external relationships.
update public.modules
set description = 'Board meetings and resolutions, bylaws, policies, nonprofit status, and the partnership and grant pipelines.'
where key = 'governance';

-- 3. Access Management is called Technology in the product now, and holds a
--    service registry the description never mentioned.
--
--    #943 promoted the section out of Administration and renamed it, for a
--    reason that applies word for word to this row: "the old label read as
--    RBAC while the section is a registry of vendor accounts, domains and MFA
--    status". The sidebar stopped saying Access Management; the operator
--    screen did not, so the one surface still carrying the misreading is the
--    one where somebody decides whether to sell it.
--
--    The key stays `access_management`. It is referenced by
--    `resources.module_key`, by `plan_modules` and `tenant_modules` rows in
--    every environment, and by name in `nav.ts`'s access checks -- and a key
--    is an identifier, not a label. Renaming it would be a migration with real
--    risk in exchange for tidiness nobody sees.
update public.modules
set
  label = 'Technology',
  description = 'The technology asset inventory, the service registry and periodic access reviews.'
where key = 'access_management';
